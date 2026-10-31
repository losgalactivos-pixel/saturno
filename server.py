"""Arranca Saturno: python server.py [--open]

  --open   abre la aplicación en el navegador al arrancar.

Si ya hay una instancia de Saturno en el mismo puerto, no arranca otra:
solo abre el navegador (útil para el acceso directo del escritorio).
"""
from __future__ import annotations

import json
import sys
import threading
import urllib.request
import webbrowser

from saturno.config import load_config
from saturno.web import serve


def _already_running(url: str) -> bool:
    try:
        with urllib.request.urlopen(f"{url}/api/health", timeout=1.5) as resp:
            return json.loads(resp.read()).get("app") == "saturno"
    except Exception:
        return False


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    config = load_config()
    browse_host = "localhost" if config.host in ("0.0.0.0", "::", "127.0.0.1") else config.host
    url = f"http://{browse_host}:{config.port}"
    open_browser = "--open" in sys.argv[1:]

    if _already_running(url):
        print(f"Saturno ya está en marcha en {url}")
        if open_browser:
            webbrowser.open(url)
        return 0

    def ready():
        print(f"\n  Saturno {url}\n  Datos: {config.db_path}\n  Pulsa Ctrl+C para detener.\n", flush=True)
        if config.host == "0.0.0.0":
            print("  Aviso: escuchando en toda la red local. Cualquiera en tu Wi-Fi podrá abrir la app.\n")
        if open_browser:
            threading.Timer(0.6, webbrowser.open, args=(url,)).start()

    try:
        serve(config, on_ready=ready)
    except OSError as exc:
        print(f"No se pudo abrir el puerto {config.port}: {exc}\nCambia SATURNO_PORT en el fichero .env.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
