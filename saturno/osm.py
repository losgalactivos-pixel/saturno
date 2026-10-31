"""Clientes de Nominatim (geocodificación) y Overpass API (negocios).

Cumple las políticas de uso de OpenStreetMap:
- Nominatim: máximo 1 petición por segundo, User-Agent identificativo,
  sin autocompletado (solo se busca al enviar) y resultados cacheados.
- Overpass: una consulta a la vez, caché de 24 h por ciudad, reintento en
  otro servidor solo ante errores de saturación (429/50x), nunca en bucle.
"""
from __future__ import annotations

import json
import threading
import time
import socket
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import Future

from .config import Config
from .db import Database
from .normalize import NORMALIZE_VERSION, normalize_elements

GEOCODE_TTL_MS = 30 * 24 * 3600 * 1000
SETTLEMENT_KINDS = {"city", "town", "village", "municipality", "hamlet", "suburb", "borough", "quarter", "county", "state_district"}


class UpstreamError(Exception):
    """Error al consultar un servicio externo, con un mensaje apto para el usuario."""

    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class _RateLimiter:
    def __init__(self, min_interval: float):
        self._interval = min_interval
        self._lock = threading.Lock()
        self._last = 0.0

    def wait(self) -> None:
        with self._lock:
            delay = self._last + self._interval - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            self._last = time.monotonic()


class OsmClient:
    def __init__(self, config: Config, db: Database):
        self.config = config
        self.db = db
        self._nominatim_limiter = _RateLimiter(1.1)
        self._overpass_lock = threading.Semaphore(1)
        self._inflight: dict[str, Future] = {}
        self._inflight_lock = threading.Lock()

    # ------------------------------------------------------------- utilidades
    def _dedupe(self, key: str, fn):
        """Si ya hay una petición idéntica en curso, espera su resultado."""
        with self._inflight_lock:
            future = self._inflight.get(key)
            owner = future is None
            if owner:
                future = Future()
                self._inflight[key] = future
        if not owner:
            return future.result()
        try:
            result = fn()
            future.set_result(result)
            return result
        except BaseException as exc:
            future.set_exception(exc)
            raise
        finally:
            with self._inflight_lock:
                self._inflight.pop(key, None)

    def _request(self, url: str, data: bytes | None = None, timeout: float = 30) -> dict:
        headers = {"User-Agent": self.config.user_agent, "Accept": "application/json", "Accept-Language": "es"}
        if data is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    # -------------------------------------------------------- geocodificación
    def geocode(self, query: str) -> list[dict]:
        query = " ".join(query.split())[:120]
        if len(query) < 2:
            return []
        key = f"geocode:v1:{query.casefold()}"
        cached = self.db.cache_get(key)
        if cached and time.time() * 1000 - cached[0] < GEOCODE_TTL_MS:
            return cached[2]["results"]

        def run():
            params = {
                "q": query, "format": "jsonv2", "addressdetails": 1, "limit": 8,
                "accept-language": "es", "featureType": "settlement",
            }
            if self.config.contact_email:
                params["email"] = self.config.contact_email
            url = f"{self.config.nominatim_url}/search?{urllib.parse.urlencode(params)}"
            self._nominatim_limiter.wait()
            try:
                raw = self._request(url, timeout=20)
            except urllib.error.HTTPError as exc:
                if exc.code == 429:
                    raise UpstreamError("rate_limited", "El buscador de ciudades (Nominatim) pide esperar un poco. Prueba de nuevo en un minuto.", 429)
                raise UpstreamError("upstream", f"Nominatim respondió con un error ({exc.code}).")
            except (urllib.error.URLError, socket.timeout, TimeoutError):
                raise UpstreamError("offline", "No se pudo contactar con Nominatim. Revisa tu conexión a Internet.", 503)
            results = [self._candidate(item) for item in raw if isinstance(item, dict)]
            results = [r for r in results if r]
            self.db.cache_put(key, {"results": results})
            return results

        return self._dedupe(key, run)

    @staticmethod
    def _candidate(item: dict) -> dict | None:
        osm_type = item.get("osm_type")
        if osm_type not in ("node", "way", "relation"):
            return None
        address = item.get("address") or {}
        region_parts = []
        for key in ("province", "county", "state", "country"):
            value = address.get(key)
            if value and value not in region_parts and value != item.get("name"):
                region_parts.append(value)
        try:
            south, north, west, east = (float(x) for x in item.get("boundingbox", []))
        except (TypeError, ValueError):
            south = north = west = east = None
        return {
            "id": f"{osm_type[0]}{item['osm_id']}",
            "osmType": osm_type,
            "osmId": int(item["osm_id"]),
            "name": item.get("name") or item.get("display_name", "").split(",")[0],
            "displayName": item.get("display_name", ""),
            "region": ", ".join(region_parts[:3]),
            "kind": item.get("addresstype") or item.get("type") or "",
            "lat": float(item["lat"]),
            "lon": float(item["lon"]),
            "bbox": [south, west, north, east] if south is not None else [],
            "countryCode": address.get("country_code", ""),
        }

    # -------------------------------------------------------------- negocios
    def businesses(self, city: dict, refresh: bool = False) -> dict:
        key = f"biz:v{NORMALIZE_VERSION}:{city['id']}"
        cached = self.db.cache_get(key)
        now = time.time() * 1000
        if cached:
            fetched_at, meta, payload = cached
            age_ms = now - fetched_at
            fresh = age_ms < self.config.cache_hours * 3600 * 1000
            too_recent = age_ms < self.config.min_refresh_minutes * 60 * 1000
            if (fresh and not refresh) or too_recent:
                return {**payload, "fetchedAt": fetched_at, "cached": True, "refreshSkipped": bool(refresh and too_recent), **meta}

        def run():
            started = time.monotonic()
            data, endpoint, mode = self._fetch_city(city)
            result = normalize_elements(data.get("elements", []))
            meta = {"endpoint": endpoint, "areaMode": mode, "queryMs": int((time.monotonic() - started) * 1000)}
            fetched_at = self.db.cache_put(key, result, meta)
            return {**result, "fetchedAt": fetched_at, "cached": False, "refreshSkipped": False, **meta}

        return self._dedupe(key, run)

    def _query(self, selector: str, area_header: str = "") -> str:
        timeout = self.config.overpass_timeout
        parts = [f'nwr["{k}"]{selector};' for k in ("phone", "contact:phone", "mobile", "contact:mobile")]
        return (
            f"[out:json][timeout:{timeout}];\n{area_header}"
            "(\n  " + "\n  ".join(parts) + "\n);\nout tags center qt;"
        )

    def _fetch_city(self, city: dict) -> tuple[dict, str, str]:
        osm_type, osm_id = city["osmType"], int(city["osmId"])
        if osm_type in ("relation", "way"):
            area_id = (3600000000 if osm_type == "relation" else 2400000000) + osm_id
            query = self._query("(area.a)", f"area(id:{area_id})->.a;\n.a out ids;\n")
            data, endpoint = self._overpass(query)
            if any(el.get("type") == "area" for el in data.get("elements", [])):
                return data, endpoint, "area"
        # Sin polígono disponible: usamos el recuadro de Nominatim o un radio.
        bbox = city.get("bbox") or []
        if len(bbox) == 4 and all(isinstance(x, (int, float)) for x in bbox):
            south, west, north, east = bbox
            selector = f"({south},{west},{north},{east})"
            mode = "bbox"
        else:
            radius = {"city": 6000, "town": 3000}.get(city.get("kind", ""), 1500)
            selector = f"(around:{radius},{city['lat']},{city['lon']})"
            mode = "radius"
        data, endpoint = self._overpass(self._query(selector))
        return data, endpoint, mode

    def _overpass(self, query: str) -> tuple[dict, str]:
        body = urllib.parse.urlencode({"data": query}).encode("utf-8")
        last_error: UpstreamError | None = None
        with self._overpass_lock:
            for endpoint in self.config.overpass_urls[:3]:
                try:
                    data = self._request(endpoint, data=body, timeout=self.config.overpass_timeout + 20)
                except urllib.error.HTTPError as exc:
                    if exc.code == 429:
                        last_error = UpstreamError("rate_limited", "Los servidores de OpenStreetMap están saturados o piden esperar. Prueba de nuevo en un par de minutos.", 429)
                        continue
                    if exc.code in (502, 503, 504):
                        last_error = UpstreamError("busy", "El servidor de OpenStreetMap está ocupado. Prueba de nuevo en unos minutos.", 503)
                        continue
                    raise UpstreamError("upstream", f"Overpass respondió con un error ({exc.code}).")
                except (socket.timeout, TimeoutError):
                    raise UpstreamError("timeout", "La consulta tardó demasiado. Es habitual en ciudades muy grandes o en horas punta: reintenta en unos minutos.", 504)
                except urllib.error.URLError as exc:
                    if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                        raise UpstreamError("timeout", "La consulta tardó demasiado. Reintenta en unos minutos.", 504)
                    last_error = UpstreamError("offline", "No se pudo contactar con OpenStreetMap. Revisa tu conexión a Internet.", 503)
                    continue
                remark = str(data.get("remark") or "")
                if "runtime error" in remark.lower() and not data.get("elements"):
                    if "timed out" in remark.lower() or "timeout" in remark.lower():
                        raise UpstreamError("timeout", "La consulta superó el tiempo máximo del servidor. Reintenta en unos minutos.", 504)
                    last_error = UpstreamError("busy", "El servidor de OpenStreetMap no pudo completar la consulta.", 503)
                    continue
                return data, endpoint
        raise last_error or UpstreamError("upstream", "No se pudo consultar OpenStreetMap.")
