"""Servidor HTTP: API JSON + ficheros estáticos de la interfaz."""
from __future__ import annotations

import gzip
import json
import mimetypes
import re
import time
import urllib.parse
from email.utils import formatdate, parsedate_to_datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .config import VERSION, Config
from .db import STATUSES, WEB_REVIEWS, Database, ValidationError
from .osm import OsmClient, UpstreamError
from .taxonomy import CATEGORIES

MAX_BODY = 5 * 1024 * 1024
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "[::1]", "::1"}

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/x-icon", ".ico")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class App:
    """Rutas de la API. Independiente del transporte para poder probarla."""

    def __init__(self, config: Config):
        self.config = config
        self.db = Database(config.db_path)
        self.osm = OsmClient(config, self.db)
        self.routes = [
            ("GET", r"/api/health", self.health),
            ("GET", r"/api/config", self.get_config),
            ("GET", r"/api/geocode", self.geocode),
            ("GET", r"/api/cities", self.list_cities),
            ("POST", r"/api/cities", self.add_city),
            ("PATCH", r"/api/cities/(?P<city_id>[nwr]\d+)", self.update_city),
            ("DELETE", r"/api/cities/(?P<city_id>[nwr]\d+)", self.delete_city),
            ("GET", r"/api/cities/(?P<city_id>[nwr]\d+)/businesses", self.businesses),
            ("GET", r"/api/tracking", self.list_tracking),
            ("PUT", r"/api/tracking/(?P<biz_id>[nwr]\d+)", self.save_tracking),
            ("POST", r"/api/tracking/(?P<biz_id>[nwr]\d+)/calls", self.log_call),
            ("GET", r"/api/export", self.export_data),
            ("POST", r"/api/import", self.import_data),
        ]
        self._compiled = [(m, re.compile(p + r"$"), fn) for m, p, fn in self.routes]

    def dispatch(self, method: str, path: str, query: dict, body):
        allowed = False
        for route_method, pattern, fn in self._compiled:
            match = pattern.match(path)
            if not match:
                continue
            allowed = True
            if route_method == method:
                return fn(query=query, body=body, **match.groupdict())
        if allowed:
            raise ApiError(405, "method_not_allowed", "Método no permitido.")
        raise ApiError(404, "not_found", "Ruta de la API no encontrada.")

    # ----------------------------------------------------------------- rutas
    def health(self, **_):
        return {"ok": True, "app": "saturno", "version": VERSION}

    def get_config(self, **_):
        return {
            "app": {"name": "Saturno", "version": VERSION},
            "categories": CATEGORIES,
            "statuses": STATUSES,
            "webReviews": WEB_REVIEWS,
            "cacheHours": self.config.cache_hours,
            "minRefreshMinutes": self.config.min_refresh_minutes,
            "source": {
                "name": "OpenStreetMap",
                "attribution": "© colaboradores de OpenStreetMap",
                "license": "ODbL 1.0",
                "url": "https://www.openstreetmap.org/copyright",
            },
        }

    def geocode(self, query, **_):
        q = (query.get("q") or [""])[0].strip()
        if len(q) < 2:
            raise ApiError(400, "bad_query", "Escribe al menos 2 caracteres.")
        return {"results": self.osm.geocode(q)}

    def list_cities(self, **_):
        return {"cities": self.db.list_cities()}

    def add_city(self, body, **_):
        return {"city": self.db.add_city(body or {})}

    def update_city(self, city_id, body, **_):
        city = self.db.update_city(city_id, {"done": bool((body or {}).get("done"))})
        if not city:
            raise ApiError(404, "not_found", "Esa ciudad no está en tu lista.")
        return {"city": city}

    def delete_city(self, city_id, **_):
        if not self.db.delete_city(city_id):
            raise ApiError(404, "not_found", "Esa ciudad no está en tu lista.")
        return {"ok": True}

    def businesses(self, city_id, query, **_):
        city = self.db.get_city(city_id)
        if not city:
            raise ApiError(404, "not_found", "Añade primero la ciudad a tu lista.")
        refresh = (query.get("refresh") or ["0"])[0] == "1"
        result = self.osm.businesses(city, refresh=refresh)
        updated = self.db.update_city(city_id, {"total": len(result["items"])})
        return {**result, "city": updated}

    def list_tracking(self, **_):
        return {"tracking": self.db.list_tracking()}

    def save_tracking(self, biz_id, body, **_):
        if not isinstance(body, dict):
            raise ApiError(400, "bad_body", "Cuerpo no válido.")
        allowed = {"status", "notes", "webReview", "webUrl", "callbackAt", "cityId", "snapshot"}
        patch = {k: v for k, v in body.items() if k in allowed}
        return {"tracking": self.db.upsert_tracking(biz_id, patch)}

    def log_call(self, biz_id, body, **_):
        body = body if isinstance(body, dict) else {}
        tel = re.sub(r"[^\d+]", "", str(body.get("tel") or ""))[:20]
        patch = {k: body[k] for k in ("cityId", "snapshot") if k in body}
        return {"tracking": self.db.upsert_tracking(biz_id, patch, event={"kind": "call", "tel": tel})}

    def export_data(self, **_):
        return self.db.export_all()

    def import_data(self, body, **_):
        return {"result": self.db.import_all(body)}


def make_handler(app: App):
    config = app.config
    public_dir = config.public_dir.resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version = f"Saturno/{VERSION}"
        protocol_version = "HTTP/1.1"

        # ------------------------------------------------------- utilidades
        def log_request(self, code="-", size="-"):
            pass  # registramos nosotros al terminar cada petición (ver _handle)

        def log_message(self, fmt, *args):
            print(f"{time.strftime('%H:%M:%S')}  {fmt % args}")

        def _send(self, status: int, body: bytes, content_type: str, extra: dict | None = None):
            self._status = status
            headers = {"Content-Type": content_type, "X-Content-Type-Options": "nosniff"}
            headers.update(extra or {})
            accepts_gzip = "gzip" in (self.headers.get("Accept-Encoding") or "")
            compressible = content_type.startswith(("application/json", "text/", "image/svg", "application/manifest"))
            if accepts_gzip and compressible and len(body) > 1024 and self.command != "HEAD":
                body = gzip.compress(body, compresslevel=6)
                headers["Content-Encoding"] = "gzip"
                headers["Vary"] = "Accept-Encoding"
            headers["Content-Length"] = str(len(body))
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, status: int, payload):
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self._send(status, body, "application/json; charset=utf-8", {"Cache-Control": "no-store"})

        def _error(self, status: int, code: str, message: str):
            self._json(status, {"error": {"code": code, "message": message}})

        def _host_allowed(self) -> bool:
            if not config.is_loopback:
                return True
            host = (self.headers.get("Host") or "").strip().lower()
            hostname = host.rsplit(":", 1)[0] if not host.endswith("]") else host
            return hostname in LOOPBACK_HOSTS

        def _origin_allowed(self) -> bool:
            origin = self.headers.get("Origin")
            if not origin:
                return True
            return urllib.parse.urlsplit(origin).netloc.lower() == (self.headers.get("Host") or "").lower()

        # --------------------------------------------------------- métodos
        def do_GET(self):
            self._handle()

        def do_HEAD(self):
            self._handle()

        def do_POST(self):
            self._handle()

        def do_PUT(self):
            self._handle()

        def do_PATCH(self):
            self._handle()

        def do_DELETE(self):
            self._handle()

        def _handle(self):
            started = time.monotonic()
            self._status = 0
            try:
                if not self._host_allowed():
                    return self._error(403, "forbidden_host", "Host no permitido.")
                parsed = urllib.parse.urlsplit(self.path)
                if parsed.path.startswith("/api/"):
                    self._api(parsed)
                elif self.command in ("GET", "HEAD"):
                    self._static(parsed.path)
                else:
                    self._error(405, "method_not_allowed", "Método no permitido.")
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                if self.path.startswith("/api/") or self._status >= 400:
                    ms = int((time.monotonic() - started) * 1000)
                    print(f"{time.strftime('%H:%M:%S')}  {self.command:6} {self.path[:90]}  {self._status}  {ms} ms", flush=True)

        def _api(self, parsed):
            method = "GET" if self.command == "HEAD" else self.command
            body = None
            if method not in ("GET", "DELETE"):
                if not self._origin_allowed():
                    return self._error(403, "forbidden_origin", "Origen no permitido.")
                if "application/json" not in (self.headers.get("Content-Type") or ""):
                    return self._error(415, "unsupported_media_type", "Se esperaba JSON.")
                length = int(self.headers.get("Content-Length") or 0)
                if length > MAX_BODY:
                    return self._error(413, "too_large", "Petición demasiado grande.")
                raw = self.rfile.read(length) if length else b""
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except (UnicodeDecodeError, json.JSONDecodeError):
                    return self._error(400, "bad_json", "JSON no válido.")
            elif method == "DELETE" and not self._origin_allowed():
                return self._error(403, "forbidden_origin", "Origen no permitido.")
            try:
                result = app.dispatch(method, parsed.path, urllib.parse.parse_qs(parsed.query), body)
                self._json(200, result)
            except ApiError as exc:
                self._error(exc.status, exc.code, exc.message)
            except ValidationError as exc:
                self._error(400, "validation", str(exc))
            except UpstreamError as exc:
                self._error(exc.status, exc.code, exc.message)
            except Exception as exc:  # pragma: no cover - red de seguridad
                print(f"Error inesperado en {parsed.path}: {exc!r}")
                self._error(500, "internal", "Error interno del servidor.")

        def _static(self, path: str):
            rel = urllib.parse.unquote(path).lstrip("/") or "index.html"
            target = (public_dir / rel).resolve()
            if public_dir not in target.parents and target != public_dir:
                return self._error(404, "not_found", "No encontrado.")
            if not target.is_file():
                if "." in Path(rel).name:
                    return self._send(404, b"No encontrado", "text/plain; charset=utf-8")
                target = public_dir / "index.html"  # rutas de la SPA
            stat = target.stat()
            last_modified = formatdate(stat.st_mtime, usegmt=True)
            since = self.headers.get("If-Modified-Since")
            if since:
                try:
                    if int(parsedate_to_datetime(since).timestamp()) >= int(stat.st_mtime):
                        self._status = 304
                        self.send_response(304)
                        self.send_header("Last-Modified", last_modified)
                        self.send_header("Content-Length", "0")
                        self.end_headers()
                        return
                except (TypeError, ValueError):
                    pass
            content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in ("application/manifest+json",):
                content_type += "; charset=utf-8"
            cache = "public, max-age=86400" if target.parent.name == "icons" else "no-cache"
            extra = {"Last-Modified": last_modified, "Cache-Control": cache}
            if target.name == "index.html":
                extra["Content-Security-Policy"] = (
                    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
                    "frame-src https://www.openstreetmap.org; connect-src 'self'; base-uri 'none'; form-action 'self'"
                )
                extra["Referrer-Policy"] = "strict-origin-when-cross-origin"
            self._send(200, target.read_bytes(), content_type, extra)

    return Handler


def serve(config: Config, on_ready=None) -> None:
    app = App(config)
    httpd = ThreadingHTTPServer((config.host, config.port), make_handler(app))
    httpd.daemon_threads = True
    if on_ready:
        on_ready()
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
