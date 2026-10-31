"""Convierte elementos crudos de OpenStreetMap en fichas de negocio.

Reglas importantes:
- Nunca se inventa información: si OSM no trae horario, redes o dirección,
  el campo queda vacío y la interfaz lo indica.
- "Sin web" significa que OSM no tiene ninguna web propia para el negocio.
  Las URLs que apuntan a redes sociales (Facebook, Instagram...) o a
  directorios (Tripadvisor, TheFork...) no cuentan como web propia.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from .taxonomy import classify, cuisine_label

NORMALIZE_VERSION = 3

PHONE_KEYS = ("phone", "contact:phone", "mobile", "contact:mobile", "phone:mobile")
WEB_KEYS = ("website", "contact:website", "url", "contact:url", "website:official")

SOCIAL_NETWORKS = {
    "facebook": "Facebook",
    "instagram": "Instagram",
    "tiktok": "TikTok",
    "twitter": "X (Twitter)",
    "youtube": "YouTube",
    "linkedin": "LinkedIn",
    "whatsapp": "WhatsApp",
    "telegram": "Telegram",
    "pinterest": "Pinterest",
}

SOCIAL_TAGS = {
    "facebook": ("contact:facebook", "facebook"),
    "instagram": ("contact:instagram", "instagram"),
    "tiktok": ("contact:tiktok", "tiktok"),
    "twitter": ("contact:twitter", "twitter", "contact:x"),
    "youtube": ("contact:youtube", "youtube"),
    "linkedin": ("contact:linkedin", "linkedin"),
    "whatsapp": ("contact:whatsapp", "whatsapp"),
    "telegram": ("contact:telegram", "telegram"),
    "pinterest": ("contact:pinterest",),
}

# Dominios que no son una web propia del negocio.
SOCIAL_HOSTS = {
    "facebook.com": "facebook", "fb.com": "facebook", "fb.me": "facebook",
    "instagram.com": "instagram", "instagr.am": "instagram",
    "tiktok.com": "tiktok",
    "twitter.com": "twitter", "x.com": "twitter",
    "youtube.com": "youtube", "youtu.be": "youtube",
    "linkedin.com": "linkedin",
    "wa.me": "whatsapp", "whatsapp.com": "whatsapp",
    "t.me": "telegram",
    "pinterest.com": "pinterest", "pinterest.es": "pinterest",
}

LISTING_HOSTS = {
    "tripadvisor": "Tripadvisor",
    "thefork": "TheFork",
    "eltenedor": "TheFork",
    "booking.com": "Booking",
    "airbnb": "Airbnb",
    "yelp": "Yelp",
    "paginasamarillas.es": "Páginas Amarillas",
    "just-eat.es": "Just Eat",
    "glovoapp.com": "Glovo",
    "ubereats.com": "Uber Eats",
    "business.site": "Google Sites (business.site, servicio cerrado)",
    "linktr.ee": "Linktree",
    "g.page": "Google",
    "goo.gl": "Google",
    "maps.google.com": "Google Maps",
    "maps.app.goo.gl": "Google Maps",
    "doctoralia.es": "Doctoralia",
    "doctoralia.com": "Doctoralia",
    "treatwell.es": "Treatwell",
    "booksy.com": "Booksy",
    "fresha.com": "Fresha",
    "restaurantguru": "Restaurant Guru",
}

_DIGITS = re.compile(r"\d")
_SPLIT_PHONES = re.compile(r"\s*(?:;|,|\s/\s)\s*")
_SPLIT_URLS = re.compile(r"\s*;\s*")


def _host(url: str) -> str:
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""
    for prefix in ("www.", "m.", "mobile.", "es-es.", "es.", "web."):
        if host.startswith(prefix):
            host = host[len(prefix):]
    return host


def _match_host(host: str, table: dict) -> str | None:
    if not host:
        return None
    labels = host.split(".")
    for key, value in table.items():
        if "." in key:
            if host == key or host.endswith("." + key):
                return value
        elif key in labels:
            return value
    return None


def safe_url(value: str | None) -> str | None:
    """Devuelve una URL http(s) válida o None (nunca javascript:, data:, etc.)."""
    if not value:
        return None
    value = value.strip()
    if not value or any(c.isspace() for c in value) or len(value) > 500:
        return None
    if value.lower().startswith("www."):
        value = "https://" + value
    elif "://" not in value and re.match(r"^[a-z0-9-]+(\.[a-z0-9-]+)+(/|$)", value, re.I):
        value = "https://" + value
    try:
        parts = urlsplit(value)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    return value


def _social_url(network: str, raw: str) -> str | None:
    raw = raw.strip()
    if not raw:
        return None
    url = safe_url(raw)
    if url and ("." in (urlsplit(url).hostname or "")) and (raw.lower().startswith(("http", "www.")) or "/" in raw):
        return url
    handle = raw.lstrip("@").strip("/")
    if not re.fullmatch(r"[\w.\-]+(/[\w.\-]+)*", handle):
        if network != "whatsapp":
            return None
    if network == "facebook":
        return f"https://www.facebook.com/{handle}"
    if network == "instagram":
        return f"https://www.instagram.com/{handle}"
    if network == "tiktok":
        return f"https://www.tiktok.com/@{handle}"
    if network == "twitter":
        return f"https://x.com/{handle}"
    if network == "youtube":
        return f"https://www.youtube.com/@{handle}" if "/" not in handle else f"https://www.youtube.com/{handle}"
    if network == "linkedin":
        return f"https://www.linkedin.com/company/{handle}"
    if network == "whatsapp":
        digits = re.sub(r"\D", "", raw)
        return f"https://wa.me/{digits}" if len(digits) >= 8 else None
    if network == "telegram":
        return f"https://t.me/{handle}"
    if network == "pinterest":
        return f"https://www.pinterest.com/{handle}"
    return None


def extract_phones(tags: dict) -> list[dict]:
    phones: list[dict] = []
    seen: set[str] = set()
    for key in PHONE_KEYS:
        raw = tags.get(key)
        if not raw:
            continue
        for part in _SPLIT_PHONES.split(raw):
            part = part.strip()
            if len(_DIGITS.findall(part)) < 6:
                continue
            tel = re.sub(r"[^\d+]", "", part)
            if tel.startswith("00"):
                tel = "+" + tel[2:]
            tel = tel[0] + tel[1:].replace("+", "") if tel else tel
            digits = tel.lstrip("+")
            fingerprint = digits[-9:]
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            national = digits[2:] if digits.startswith("34") and len(digits) == 11 else digits
            is_spanish = (tel.startswith("+34") and len(digits) == 11) or (not tel.startswith("+") and len(digits) == 9)
            phones.append({
                "display": part,
                "tel": tel,
                "mobile": bool(is_spanish and national[:1] in ("6", "7")),
            })
    return phones


def analyze_web(tags: dict) -> dict:
    """Clasifica las URLs del elemento en web propia, redes y fichas en directorios."""
    own: list[str] = []
    social: dict[str, dict] = {}
    listings: list[dict] = []

    def add_social(network: str, url: str) -> None:
        if network not in social:
            social[network] = {"network": network, "label": SOCIAL_NETWORKS[network], "url": url}

    for key in WEB_KEYS:
        for value in _SPLIT_URLS.split(tags.get(key, "")):
            url = safe_url(value)
            if not url:
                continue
            host = _host(url)
            network = _match_host(host, SOCIAL_HOSTS)
            if network:
                add_social(network, url)
                continue
            listing = _match_host(host, LISTING_HOSTS)
            if listing:
                if all(item["url"] != url for item in listings):
                    listings.append({"label": listing, "url": url})
                continue
            if url not in own:
                own.append(url)

    for network, keys in SOCIAL_TAGS.items():
        for key in keys:
            for value in _SPLIT_URLS.split(tags.get(key, "")):
                url = _social_url(network, value) if value else None
                if url:
                    add_social(network, url)

    if own:
        status = "own"
    elif social or listings:
        status = "social"
    else:
        status = "none"
    return {"status": status, "own": own, "social": list(social.values()), "listings": listings}


def _address(tags: dict) -> str | None:
    street = tags.get("addr:street") or tags.get("addr:place")
    number = tags.get("addr:housenumber")
    if street and number:
        return f"{street}, {number}"
    if street:
        return street
    return tags.get("addr:full") or None


def normalize_element(element: dict) -> tuple[dict | None, str]:
    """Devuelve (ficha, motivo). La ficha es None si se descarta.

    Motivos: "ok", "no_business", "no_phone", "own_website".
    """
    tags = element.get("tags") or {}
    classified = classify(tags)
    if not classified:
        return None, "no_business"
    phones = extract_phones(tags)
    if not phones:
        return None, "no_phone"
    web = analyze_web(tags)
    if web["status"] == "own":
        return None, "own_website"

    kind = element.get("type", "node")
    osm_id = element.get("id")
    if "lat" in element:
        lat, lon = element["lat"], element["lon"]
    else:
        center = element.get("center") or {}
        lat, lon = center.get("lat"), center.get("lon")

    category, type_label = classified
    email = (tags.get("email") or tags.get("contact:email") or "").split(";")[0].strip()
    name = tags.get("name") or tags.get("brand") or None
    chain = tags.get("brand") or ((name or "Cadena") if tags.get("brand:wikidata") else None)
    item = {
        "id": f"{kind[0]}{osm_id}",
        "osmUrl": f"https://www.openstreetmap.org/{kind}/{osm_id}",
        "name": name,
        "category": category,
        "type": type_label,
        "detail": cuisine_label(tags),
        "address": _address(tags),
        "postcode": tags.get("addr:postcode") or None,
        "locality": tags.get("addr:city") or None,
        "lat": round(lat, 6) if isinstance(lat, (int, float)) else None,
        "lon": round(lon, 6) if isinstance(lon, (int, float)) else None,
        "phones": phones,
        "hours": tags.get("opening_hours") or None,
        "email": email if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) else None,
        "social": web["social"],
        "listings": web["listings"],
        "webStatus": web["status"],
        "chain": chain,
    }
    return item, "ok"


def normalize_elements(elements: list[dict]) -> dict:
    items: list[dict] = []
    stats = {"withPhone": 0, "ownWebsite": 0, "withoutWebsite": 0, "socialOnly": 0, "chains": 0}
    seen: set[str] = set()
    for element in elements:
        if element.get("type") not in ("node", "way", "relation"):
            continue
        item, reason = normalize_element(element)
        if reason in ("ok", "own_website"):
            stats["withPhone"] += 1
        if reason == "own_website":
            stats["ownWebsite"] += 1
        if not item or item["id"] in seen:
            continue
        seen.add(item["id"])
        items.append(item)
        stats["withoutWebsite"] += 1
        if item["webStatus"] == "social":
            stats["socialOnly"] += 1
        if item["chain"]:
            stats["chains"] += 1
    items.sort(key=lambda i: ((i["name"] or "~").casefold(), i["id"]))
    return {"items": items, "stats": stats}
