"""Configuración de Saturno.

Todo se lee de variables de entorno. Si existe un fichero `.env` en la raíz
del proyecto, se carga antes (las variables ya definidas en el sistema tienen
prioridad). Ver `.env.example` para la lista completa.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = "1.0.0"

DEFAULT_OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Config:
    host: str
    port: int
    db_path: Path
    public_dir: Path
    contact_email: str
    nominatim_url: str
    overpass_urls: tuple[str, ...]
    overpass_timeout: int
    cache_hours: float
    min_refresh_minutes: float

    @property
    def user_agent(self) -> str:
        # Nominatim y Overpass piden un User-Agent que identifique la aplicación.
        contact = f"; {self.contact_email}" if self.contact_email else ""
        return f"Saturno/{VERSION} (prospeccion local; uso personal{contact})"

    @property
    def is_loopback(self) -> bool:
        return self.host in ("127.0.0.1", "localhost", "::1")


def load_config() -> Config:
    _load_dotenv(ROOT / ".env")
    urls = tuple(
        u.strip()
        for u in os.environ.get("SATURNO_OVERPASS_URLS", ",".join(DEFAULT_OVERPASS_URLS)).split(",")
        if u.strip()
    )
    db_path = Path(os.environ.get("SATURNO_DB_PATH", ROOT / "data" / "saturno.db"))
    if not db_path.is_absolute():
        db_path = ROOT / db_path
    return Config(
        host=os.environ.get("SATURNO_HOST", "127.0.0.1"),
        port=_int("SATURNO_PORT", 8787),
        db_path=db_path,
        public_dir=ROOT / "public",
        contact_email=os.environ.get("SATURNO_CONTACT_EMAIL", "").strip(),
        nominatim_url=os.environ.get("SATURNO_NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/"),
        overpass_urls=urls or DEFAULT_OVERPASS_URLS,
        overpass_timeout=max(30, _int("SATURNO_OVERPASS_TIMEOUT", 180)),
        cache_hours=max(1.0, _float("SATURNO_CACHE_HOURS", 24)),
        min_refresh_minutes=max(1.0, _float("SATURNO_MIN_REFRESH_MINUTES", 10)),
    )
