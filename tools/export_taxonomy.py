"""Genera public/js/standalone/taxonomy.js a partir del código Python.

Así el modo sin servidor (GitHub Pages) usa exactamente las mismas tablas de
categorías, dominios de redes sociales, etc. que el servidor. Ejecutar tras
cambiar saturno/taxonomy.py, saturno/normalize.py o saturno/db.py:

    python tools/export_taxonomy.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from saturno import db, normalize, taxonomy  # noqa: E402

OUT = ROOT / "public" / "js" / "standalone" / "taxonomy.js"


def main() -> None:
    data = {
        "normalizeVersion": normalize.NORMALIZE_VERSION,
        "categories": taxonomy.CATEGORIES,
        "statuses": db.STATUSES,
        "webReviews": db.WEB_REVIEWS,
        "keys": [
            {"key": key, "table": table, "excluded": None if excluded is None else sorted(excluded)}
            for key, table, excluded in taxonomy._KEYS
        ],
        "fallback": taxonomy._FALLBACK,
        "cuisine": taxonomy.CUISINE,
        "phoneKeys": normalize.PHONE_KEYS,
        "webKeys": normalize.WEB_KEYS,
        "socialNetworks": normalize.SOCIAL_NETWORKS,
        "socialTags": normalize.SOCIAL_TAGS,
        "socialHosts": normalize.SOCIAL_HOSTS,
        "listingHosts": normalize.LISTING_HOSTS,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// Generado por tools/export_taxonomy.py a partir de saturno/*.py. No editar a mano.\n"
        f"export const TAXONOMY = {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    print(f"Escrito {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
