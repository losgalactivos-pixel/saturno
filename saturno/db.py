"""Almacenamiento local en SQLite: ciudades, seguimiento de llamadas y caché.

Las notas y estados se guardan en `data/saturno.db` (o en SATURNO_DB_PATH),
así que siguen ahí al cerrar el navegador o reiniciar el PC.
"""
from __future__ import annotations

import gzip
import json
import re
import sqlite3
import threading
import time
from pathlib import Path

STATUSES = [
    {"id": "pendiente", "label": "Pendiente"},
    {"id": "no_contesto", "label": "No contestó"},
    {"id": "interesado", "label": "Interesado"},
    {"id": "no_interesado", "label": "No interesado"},
    {"id": "volver_a_llamar", "label": "Volver a llamar"},
]
WEB_REVIEWS = [
    {"id": "sin_verificar", "label": "Sin verificar"},
    {"id": "sin_web", "label": "Sin web (confirmado)"},
    {"id": "tiene_web", "label": "Tiene web"},
]
STATUS_IDS = {s["id"] for s in STATUSES}
WEB_REVIEW_IDS = {w["id"] for w in WEB_REVIEWS}

BIZ_ID = re.compile(r"^[nwr]\d{1,15}$")
CITY_ID = re.compile(r"^[nwr]\d{1,15}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

MAX_NOTES = 20_000
MAX_HISTORY = 200
MAX_SNAPSHOT = 24_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS cities (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    done_at INTEGER,
    added_at INTEGER NOT NULL,
    last_loaded_at INTEGER,
    total INTEGER
);
CREATE TABLE IF NOT EXISTS tracking (
    biz_id TEXT PRIMARY KEY,
    city_id TEXT,
    status TEXT NOT NULL DEFAULT 'pendiente',
    notes TEXT NOT NULL DEFAULT '',
    web_review TEXT NOT NULL DEFAULT 'sin_verificar',
    web_url TEXT,
    callback_at TEXT,
    history TEXT NOT NULL DEFAULT '[]',
    snapshot TEXT,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tracking_city ON tracking(city_id);
CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    fetched_at INTEGER NOT NULL,
    meta TEXT,
    payload BLOB NOT NULL
);
"""


class ValidationError(ValueError):
    pass


def now_ms() -> int:
    return int(time.time() * 1000)


class Database:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._lock, self._conn:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.executescript(SCHEMA)

    # ------------------------------------------------------------------ caché
    def cache_get(self, key: str) -> tuple[int, dict, dict] | None:
        with self._lock:
            row = self._conn.execute("SELECT fetched_at, meta, payload FROM cache WHERE key=?", (key,)).fetchone()
        if not row:
            return None
        payload = json.loads(gzip.decompress(row["payload"]).decode("utf-8"))
        return row["fetched_at"], json.loads(row["meta"] or "{}"), payload

    def cache_put(self, key: str, payload: dict, meta: dict | None = None) -> int:
        fetched_at = now_ms()
        blob = gzip.compress(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO cache(key, fetched_at, meta, payload) VALUES (?,?,?,?)",
                (key, fetched_at, json.dumps(meta or {}), blob),
            )
        return fetched_at

    # --------------------------------------------------------------- ciudades
    @staticmethod
    def _city_row(row: sqlite3.Row) -> dict:
        data = json.loads(row["data"])
        data.update({
            "id": row["id"],
            "done": bool(row["done"]),
            "doneAt": row["done_at"],
            "addedAt": row["added_at"],
            "lastLoadedAt": row["last_loaded_at"],
            "total": row["total"],
        })
        return data

    def list_cities(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM cities ORDER BY added_at").fetchall()
        return [self._city_row(r) for r in rows]

    def get_city(self, city_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM cities WHERE id=?", (city_id,)).fetchone()
        return self._city_row(row) if row else None

    def add_city(self, city: dict) -> dict:
        city_id = str(city.get("id", ""))
        if not CITY_ID.match(city_id):
            raise ValidationError("Identificador de ciudad no válido.")
        if city.get("osmType") not in ("node", "way", "relation"):
            raise ValidationError("Tipo de elemento OSM no válido.")
        try:
            data = {
                "osmType": city["osmType"],
                "osmId": int(city["osmId"]),
                "name": str(city["name"])[:200],
                "displayName": str(city.get("displayName", ""))[:400],
                "region": str(city.get("region", ""))[:200],
                "kind": str(city.get("kind", ""))[:40],
                "lat": float(city["lat"]),
                "lon": float(city["lon"]),
                "bbox": [float(x) for x in city.get("bbox", [])][:4],
            }
        except (KeyError, TypeError, ValueError) as exc:
            raise ValidationError("Datos de ciudad incompletos.") from exc
        if f"{data['osmType'][0]}{data['osmId']}" != city_id:
            raise ValidationError("El identificador no coincide con el elemento OSM.")
        done = 1 if city.get("done") else 0
        with self._lock, self._conn:
            existing = self._conn.execute("SELECT id FROM cities WHERE id=?", (city_id,)).fetchone()
            if existing:
                self._conn.execute("UPDATE cities SET data=? WHERE id=?", (json.dumps(data, ensure_ascii=False), city_id))
            else:
                self._conn.execute(
                    "INSERT INTO cities(id, data, done, done_at, added_at, total) VALUES (?,?,?,?,?,?)",
                    (city_id, json.dumps(data, ensure_ascii=False), done, now_ms() if done else None,
                     int(city.get("addedAt") or now_ms()), city.get("total")),
                )
        return self.get_city(city_id)

    def update_city(self, city_id: str, patch: dict) -> dict | None:
        with self._lock, self._conn:
            if "done" in patch:
                done = 1 if patch["done"] else 0
                self._conn.execute(
                    "UPDATE cities SET done=?, done_at=? WHERE id=?",
                    (done, now_ms() if done else None, city_id),
                )
            if "total" in patch:
                self._conn.execute(
                    "UPDATE cities SET total=?, last_loaded_at=? WHERE id=?",
                    (int(patch["total"]), now_ms(), city_id),
                )
        return self.get_city(city_id)

    def delete_city(self, city_id: str) -> bool:
        with self._lock, self._conn:
            cur = self._conn.execute("DELETE FROM cities WHERE id=?", (city_id,))
        return cur.rowcount > 0

    # ------------------------------------------------------------ seguimiento
    @staticmethod
    def _tracking_row(row: sqlite3.Row) -> dict:
        return {
            "bizId": row["biz_id"],
            "cityId": row["city_id"],
            "status": row["status"],
            "notes": row["notes"],
            "webReview": row["web_review"],
            "webUrl": row["web_url"],
            "callbackAt": row["callback_at"],
            "history": json.loads(row["history"] or "[]"),
            "snapshot": json.loads(row["snapshot"]) if row["snapshot"] else None,
            "updatedAt": row["updated_at"],
        }

    def list_tracking(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM tracking").fetchall()
        return [self._tracking_row(r) for r in rows]

    def get_tracking(self, biz_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM tracking WHERE biz_id=?", (biz_id,)).fetchone()
        return self._tracking_row(row) if row else None

    def upsert_tracking(self, biz_id: str, patch: dict, event: dict | None = None) -> dict:
        if not BIZ_ID.match(biz_id):
            raise ValidationError("Identificador de negocio no válido.")
        with self._lock, self._conn:
            current = self.get_tracking(biz_id) or {
                "bizId": biz_id, "cityId": None, "status": "pendiente", "notes": "",
                "webReview": "sin_verificar", "webUrl": None, "callbackAt": None,
                "history": [], "snapshot": None, "updatedAt": 0,
            }
            history = list(current["history"])
            at = now_ms()

            if "status" in patch:
                status = patch["status"]
                if status not in STATUS_IDS:
                    raise ValidationError("Estado no válido.")
                if status != current["status"]:
                    history.append({"at": at, "kind": "status", "value": status})
                current["status"] = status
            if "notes" in patch:
                notes = str(patch["notes"] or "")
                if len(notes) > MAX_NOTES:
                    raise ValidationError(f"Las notas no pueden superar {MAX_NOTES} caracteres.")
                current["notes"] = notes
            if "webReview" in patch:
                review = patch["webReview"]
                if review not in WEB_REVIEW_IDS:
                    raise ValidationError("Revisión de web no válida.")
                if review != current["webReview"]:
                    history.append({"at": at, "kind": "web", "value": review})
                current["webReview"] = review
            if "webUrl" in patch:
                url = (patch["webUrl"] or "").strip()[:500]
                current["webUrl"] = url or None
            if "callbackAt" in patch:
                value = patch["callbackAt"] or None
                if value is not None and not DATE.match(str(value)):
                    raise ValidationError("Fecha de rellamada no válida (AAAA-MM-DD).")
                current["callbackAt"] = value
            if patch.get("cityId"):
                if not CITY_ID.match(str(patch["cityId"])):
                    raise ValidationError("Ciudad no válida.")
                current["cityId"] = patch["cityId"]
            if patch.get("snapshot") is not None:
                snapshot = json.dumps(patch["snapshot"], ensure_ascii=False)
                if len(snapshot) > MAX_SNAPSHOT:
                    raise ValidationError("Ficha demasiado grande.")
                current["snapshot"] = patch["snapshot"]
            if event:
                history.append({"at": at, **event})

            history = history[-MAX_HISTORY:]
            self._conn.execute(
                """INSERT OR REPLACE INTO tracking
                   (biz_id, city_id, status, notes, web_review, web_url, callback_at, history, snapshot, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    biz_id, current["cityId"], current["status"], current["notes"], current["webReview"],
                    current["webUrl"], current["callbackAt"], json.dumps(history, ensure_ascii=False),
                    json.dumps(current["snapshot"], ensure_ascii=False) if current["snapshot"] else None, at,
                ),
            )
        return self.get_tracking(biz_id)

    # ------------------------------------------------------ exportar/importar
    def export_all(self) -> dict:
        return {
            "format": "saturno-export",
            "version": 1,
            "exportedAt": now_ms(),
            "cities": self.list_cities(),
            "tracking": self.list_tracking(),
        }

    def import_all(self, data: dict) -> dict:
        if not isinstance(data, dict) or data.get("format") != "saturno-export":
            raise ValidationError("El fichero no es una exportación de Saturno.")
        cities = data.get("cities") or []
        tracking = data.get("tracking") or []
        added_cities = merged = skipped = 0
        for city in cities:
            try:
                existed = self.get_city(str(city.get("id")))
                self.add_city(city)
                if city.get("done") and not (existed and existed["done"]):
                    self.update_city(city["id"], {"done": True})
                added_cities += 0 if existed else 1
            except ValidationError:
                skipped += 1
        for record in tracking:
            biz_id = str(record.get("bizId", ""))
            if not BIZ_ID.match(biz_id):
                skipped += 1
                continue
            current = self.get_tracking(biz_id)
            if current and current["updatedAt"] >= int(record.get("updatedAt") or 0):
                continue
            try:
                with self._lock, self._conn:
                    self._conn.execute(
                        """INSERT OR REPLACE INTO tracking
                           (biz_id, city_id, status, notes, web_review, web_url, callback_at, history, snapshot, updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (
                            biz_id,
                            record.get("cityId") if CITY_ID.match(str(record.get("cityId") or "")) else None,
                            record.get("status") if record.get("status") in STATUS_IDS else "pendiente",
                            str(record.get("notes") or "")[:MAX_NOTES],
                            record.get("webReview") if record.get("webReview") in WEB_REVIEW_IDS else "sin_verificar",
                            (record.get("webUrl") or None),
                            record.get("callbackAt") if DATE.match(str(record.get("callbackAt") or "")) else None,
                            json.dumps((record.get("history") or [])[-MAX_HISTORY:], ensure_ascii=False),
                            json.dumps(record["snapshot"], ensure_ascii=False) if record.get("snapshot") else None,
                            int(record.get("updatedAt") or now_ms()),
                        ),
                    )
                merged += 1
            except (TypeError, ValueError):
                skipped += 1
        return {"cities": added_cities, "tracking": merged, "skipped": skipped}
