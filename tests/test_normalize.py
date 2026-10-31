import unittest

from saturno.normalize import analyze_web, extract_phones, normalize_element, safe_url
from saturno.taxonomy import classify


def el(tags, kind="node", osm_id=1, **extra):
    base = {"type": kind, "id": osm_id, "tags": tags}
    if kind == "node":
        base.update(lat=40.0, lon=-3.0)
    else:
        base["center"] = {"lat": 40.0, "lon": -3.0}
    base.update(extra)
    return base


class ClassifyTests(unittest.TestCase):
    def test_restaurant(self):
        self.assertEqual(classify({"amenity": "restaurant"}), ("restaurantes", "Restaurante"))

    def test_barber(self):
        self.assertEqual(classify({"shop": "hairdresser", "hairdresser": "barber"}), ("belleza", "Barbería"))

    def test_excluded_public_services(self):
        for tags in ({"amenity": "townhall"}, {"amenity": "school"}, {"healthcare": "hospital"}, {"office": "government"}):
            self.assertIsNone(classify(tags), tags)

    def test_unknown_shop_falls_back(self):
        self.assertEqual(classify({"shop": "yes"}), ("tiendas", "Tienda"))
        self.assertEqual(classify({"shop": "weird_value"})[0], "tiendas")

    def test_tourism_whitelist_only(self):
        self.assertIsNone(classify({"tourism": "museum"}))
        self.assertEqual(classify({"tourism": "hotel"})[0], "alojamiento")

    def test_disused(self):
        self.assertIsNone(classify({"amenity": "cafe", "disused": "yes"}))


class PhoneTests(unittest.TestCase):
    def test_split_and_dedupe(self):
        phones = extract_phones({"phone": "+34 918 88 00 00; 918880000", "mobile": "+34 600 11 22 33"})
        self.assertEqual([p["tel"] for p in phones], ["+34918880000", "+34600112233"])
        self.assertFalse(phones[0]["mobile"])
        self.assertTrue(phones[1]["mobile"])

    def test_double_zero_prefix(self):
        self.assertEqual(extract_phones({"phone": "0034 912 345 678"})[0]["tel"], "+34912345678")

    def test_ignores_garbage(self):
        self.assertEqual(extract_phones({"phone": "no tiene"}), [])


class WebTests(unittest.TestCase):
    def test_no_website(self):
        self.assertEqual(analyze_web({})["status"], "none")

    def test_own_website(self):
        self.assertEqual(analyze_web({"website": "https://pizzerialuigi.es"})["status"], "own")

    def test_facebook_in_website_is_social(self):
        web = analyze_web({"website": "https://www.facebook.com/pizzerialuigi"})
        self.assertEqual(web["status"], "social")
        self.assertEqual(web["social"][0]["network"], "facebook")

    def test_listing_is_not_own_website(self):
        web = analyze_web({"website": "https://www.tripadvisor.es/Restaurant_Review-x"})
        self.assertEqual(web["status"], "social")
        self.assertEqual(web["listings"][0]["label"], "Tripadvisor")

    def test_handles_become_urls(self):
        web = analyze_web({"contact:instagram": "@luigi.pizza", "contact:tiktok": "luigi"})
        urls = {s["network"]: s["url"] for s in web["social"]}
        self.assertEqual(urls["instagram"], "https://www.instagram.com/luigi.pizza")
        self.assertEqual(urls["tiktok"], "https://www.tiktok.com/@luigi")

    def test_rejects_dangerous_urls(self):
        self.assertIsNone(safe_url("javascript:alert(1)"))
        self.assertIsNone(safe_url("data:text/html,hi"))
        self.assertEqual(safe_url("www.ejemplo.es"), "https://www.ejemplo.es")


class NormalizeTests(unittest.TestCase):
    def test_business_without_website(self):
        item, reason = normalize_element(el({
            "amenity": "restaurant", "name": "Casa Pepe", "phone": "+34 911 222 333",
            "addr:street": "Calle Mayor", "addr:housenumber": "5", "opening_hours": "Mo-Fr 09:00-14:00",
            "cuisine": "spanish;tapas",
        }, kind="way", osm_id=99))
        self.assertEqual(reason, "ok")
        self.assertEqual(item["id"], "w99")
        self.assertEqual(item["address"], "Calle Mayor, 5")
        self.assertEqual(item["detail"], "Española · Tapas")
        self.assertEqual(item["webStatus"], "none")
        self.assertIsNone(item["chain"])

    def test_skips_own_website_and_no_phone(self):
        self.assertEqual(normalize_element(el({"amenity": "cafe", "phone": "911222333", "website": "https://x.es"}))[1], "own_website")
        self.assertEqual(normalize_element(el({"amenity": "cafe", "name": "Sin tel"}))[1], "no_phone")

    def test_chain_detection(self):
        item, _ = normalize_element(el({"amenity": "fast_food", "brand": "Burger Ejemplo", "phone": "911222333"}))
        self.assertEqual(item["chain"], "Burger Ejemplo")


if __name__ == "__main__":
    unittest.main()
