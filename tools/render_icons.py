"""Genera los PNG y el .ico de la app a partir de los SVG de public/icons.

Usa Microsoft Edge o Google Chrome en modo headless para rasterizar, así que
no necesita librerías de Python. Ejecutar desde la raíz del proyecto:

    python tools/render_icons.py
"""
from __future__ import annotations

import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    shutil.which("msedge") or "",
    shutil.which("chrome") or "",
    shutil.which("google-chrome") or "",
    shutil.which("chromium") or "",
]

# (svg de origen, png de salida, tamaño)
TARGETS = [
    ("app-icon.svg", "icon-192.png", 192),
    ("app-icon.svg", "icon-512.png", 512),
    ("maskable.svg", "maskable-512.png", 512),
    ("maskable.svg", "apple-touch-icon.png", 180),
]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def find_browser() -> str:
    for path in BROWSERS:
        if path and Path(path).is_file():
            return path
    sys.exit("No se encontró Edge ni Chrome para rasterizar los SVG.")


def render(browser: str, svg: Path, out: Path, size: int, workdir: Path) -> None:
    page = workdir / f"{out.stem}.html"
    page.write_text(
        "<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}"
        f"img{{display:block;width:{size}px;height:{size}px}}</style></head>"
        f'<body><img src="{svg.as_uri()}"></body></html>',
        encoding="utf-8",
    )
    subprocess.run(
        [
            browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
            "--default-background-color=00000000", f"--window-size={size},{size}",
            f"--screenshot={out}", page.as_uri(),
        ],
        check=True, capture_output=True, timeout=60,
    )
    if not out.is_file():
        raise RuntimeError(f"No se generó {out.name}")


def png_size(data: bytes) -> tuple[int, int]:
    return struct.unpack(">II", data[16:24])


def build_ico(pngs: list[bytes], out: Path) -> None:
    header = struct.pack("<HHH", 0, 1, len(pngs))
    entries, offset = b"", 6 + 16 * len(pngs)
    for data in pngs:
        width, height = png_size(data)
        entries += struct.pack("<BBBBHHII", width % 256, height % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    out.write_bytes(header + entries + b"".join(pngs))


def main() -> None:
    browser = find_browser()
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        for svg_name, png_name, size in TARGETS:
            render(browser, ICONS / svg_name, ICONS / png_name, size, workdir)
            print(f"  {png_name} ({size}px)")
        pngs = []
        for size in ICO_SIZES:
            target = workdir / f"ico-{size}.png"
            render(browser, ICONS / ("saturno.svg" if size <= 32 else "app-icon.svg"), target, size, workdir)
            pngs.append(target.read_bytes())
        build_ico(pngs, ICONS / "saturno.ico")
        shutil.copyfile(ICONS / "saturno.ico", ROOT / "public" / "favicon.ico")
        print(f"  saturno.ico ({', '.join(map(str, ICO_SIZES))}px) y favicon.ico")


if __name__ == "__main__":
    main()
