"""Clasificación de elementos de OpenStreetMap en categorías de negocio.

`classify(tags)` devuelve `(categoria, etiqueta_en_espanol)` o `None` si el
elemento no es un negocio al que tenga sentido llamar (ayuntamientos,
colegios públicos, hospitales, iglesias, cajeros...).
"""
from __future__ import annotations

CATEGORIES = [
    {"id": "restaurantes", "label": "Restaurantes", "icon": "utensils"},
    {"id": "cafeterias", "label": "Cafeterías y bares", "icon": "coffee"},
    {"id": "belleza", "label": "Peluquerías y belleza", "icon": "scissors"},
    {"id": "salud", "label": "Clínicas y salud", "icon": "stethoscope"},
    {"id": "tiendas", "label": "Tiendas", "icon": "bag"},
    {"id": "alimentacion", "label": "Alimentación", "icon": "basket"},
    {"id": "motor", "label": "Talleres y motor", "icon": "car"},
    {"id": "alojamiento", "label": "Alojamiento", "icon": "bed"},
    {"id": "ocio", "label": "Ocio y deporte", "icon": "dumbbell"},
    {"id": "servicios", "label": "Servicios y oficios", "icon": "briefcase"},
    {"id": "formacion", "label": "Academias y formación", "icon": "book"},
    {"id": "otros", "label": "Otros", "icon": "dots"},
]

# (categoría, etiqueta) por valor de cada clave principal.
AMENITY = {
    "restaurant": ("restaurantes", "Restaurante"),
    "fast_food": ("restaurantes", "Comida rápida"),
    "food_court": ("restaurantes", "Zona de restauración"),
    "cafe": ("cafeterias", "Cafetería"),
    "bar": ("cafeterias", "Bar"),
    "pub": ("cafeterias", "Pub"),
    "biergarten": ("cafeterias", "Cervecería"),
    "ice_cream": ("cafeterias", "Heladería"),
    "nightclub": ("ocio", "Discoteca"),
    "dentist": ("salud", "Clínica dental"),
    "clinic": ("salud", "Clínica"),
    "doctors": ("salud", "Consulta médica"),
    "veterinary": ("salud", "Clínica veterinaria"),
    "pharmacy": ("salud", "Farmacia"),
    "car_wash": ("motor", "Lavadero de coches"),
    "car_rental": ("motor", "Alquiler de coches"),
    "fuel": ("motor", "Gasolinera"),
    "vehicle_inspection": ("motor", "ITV"),
    "motorcycle_rental": ("motor", "Alquiler de motos"),
    "driving_school": ("formacion", "Autoescuela"),
    "language_school": ("formacion", "Academia de idiomas"),
    "music_school": ("formacion", "Escuela de música"),
    "dancing_school": ("formacion", "Escuela de baile"),
    "prep_school": ("formacion", "Academia"),
    "training": ("formacion", "Centro de formación"),
    "kindergarten": ("formacion", "Escuela infantil"),
    "childcare": ("formacion", "Guardería"),
    "cinema": ("ocio", "Cine"),
    "theatre": ("ocio", "Teatro"),
    "casino": ("ocio", "Casino"),
    "gambling": ("ocio", "Salón de juego"),
    "events_venue": ("ocio", "Salón de eventos"),
    "studio": ("servicios", "Estudio"),
    "coworking_space": ("servicios", "Coworking"),
    "internet_cafe": ("servicios", "Cibercafé"),
    "animal_boarding": ("servicios", "Residencia de animales"),
    "animal_training": ("servicios", "Adiestramiento canino"),
    "bureau_de_change": ("servicios", "Cambio de divisa"),
    "money_transfer": ("servicios", "Envío de dinero"),
    "funeral_hall": ("servicios", "Tanatorio"),
    "marketplace": ("alimentacion", "Mercado"),
}

AMENITY_EXCLUDED = {
    "townhall", "police", "fire_station", "courthouse", "prison", "place_of_worship",
    "grave_yard", "school", "university", "college", "hospital", "library", "post_office",
    "bank", "atm", "social_facility", "community_centre", "public_building", "embassy",
    "ranger_station", "parking", "parking_entrance", "charging_station", "bus_station",
    "ferry_terminal", "toilets", "drinking_water", "shelter", "telephone", "emergency_phone",
    "post_box", "recycling", "waste_disposal", "fountain", "bench", "clock", "taxi",
    "bicycle_rental", "arts_centre", "social_centre", "nursing_home", "monastery",
    "conference_centre", "exhibition_centre", "public_bath", "water_point", "vending_machine",
}

SHOP = {
    # Alimentación
    "bakery": ("alimentacion", "Panadería"),
    "butcher": ("alimentacion", "Carnicería"),
    "greengrocer": ("alimentacion", "Frutería"),
    "supermarket": ("alimentacion", "Supermercado"),
    "convenience": ("alimentacion", "Tienda de alimentación"),
    "deli": ("alimentacion", "Charcutería"),
    "seafood": ("alimentacion", "Pescadería"),
    "pastry": ("alimentacion", "Pastelería"),
    "confectionery": ("alimentacion", "Confitería"),
    "cheese": ("alimentacion", "Quesería"),
    "wine": ("alimentacion", "Vinoteca"),
    "alcohol": ("alimentacion", "Bodega y licores"),
    "beverages": ("alimentacion", "Bebidas"),
    "coffee": ("alimentacion", "Tienda de café"),
    "tea": ("alimentacion", "Tienda de té"),
    "chocolate": ("alimentacion", "Chocolatería"),
    "frozen_food": ("alimentacion", "Congelados"),
    "health_food": ("alimentacion", "Herbolario"),
    "farm": ("alimentacion", "Productos de granja"),
    "nuts": ("alimentacion", "Frutos secos"),
    "dairy": ("alimentacion", "Lechería"),
    "pasta": ("alimentacion", "Pasta fresca"),
    "spices": ("alimentacion", "Especias"),
    "food": ("alimentacion", "Alimentación"),
    # Belleza
    "hairdresser": ("belleza", "Peluquería"),
    "beauty": ("belleza", "Centro de estética"),
    "cosmetics": ("belleza", "Cosmética"),
    "perfumery": ("belleza", "Perfumería"),
    "massage": ("belleza", "Masajes"),
    "tattoo": ("belleza", "Estudio de tatuajes"),
    "piercing": ("belleza", "Piercing"),
    "hairdresser_supply": ("belleza", "Suministros de peluquería"),
    "tanning": ("belleza", "Centro de bronceado"),
    # Salud
    "optician": ("salud", "Óptica"),
    "hearing_aids": ("salud", "Audífonos"),
    "medical_supply": ("salud", "Ortopedia"),
    "herbalist": ("salud", "Herbolario"),
    "nutrition_supplements": ("salud", "Suplementos"),
    # Motor
    "car_repair": ("motor", "Taller mecánico"),
    "car": ("motor", "Concesionario"),
    "car_parts": ("motor", "Recambios"),
    "tyres": ("motor", "Neumáticos"),
    "motorcycle": ("motor", "Tienda de motos"),
    "motorcycle_repair": ("motor", "Taller de motos"),
    "bicycle": ("motor", "Bicicletas"),
    # Tiendas
    "clothes": ("tiendas", "Tienda de ropa"),
    "shoes": ("tiendas", "Zapatería"),
    "jewelry": ("tiendas", "Joyería"),
    "watches": ("tiendas", "Relojería"),
    "florist": ("tiendas", "Floristería"),
    "furniture": ("tiendas", "Muebles"),
    "hardware": ("tiendas", "Ferretería"),
    "doityourself": ("tiendas", "Bricolaje"),
    "electronics": ("tiendas", "Electrónica"),
    "mobile_phone": ("tiendas", "Telefonía móvil"),
    "computer": ("tiendas", "Informática"),
    "books": ("tiendas", "Librería"),
    "stationery": ("tiendas", "Papelería"),
    "toys": ("tiendas", "Juguetería"),
    "gift": ("tiendas", "Tienda de regalos"),
    "pet": ("tiendas", "Tienda de mascotas"),
    "sports": ("tiendas", "Tienda de deportes"),
    "bag": ("tiendas", "Bolsos y complementos"),
    "boutique": ("tiendas", "Boutique"),
    "fabric": ("tiendas", "Tejidos"),
    "sewing": ("tiendas", "Mercería"),
    "haberdashery": ("tiendas", "Mercería"),
    "kiosk": ("tiendas", "Quiosco"),
    "newsagent": ("tiendas", "Prensa"),
    "tobacco": ("tiendas", "Estanco"),
    "lottery": ("tiendas", "Administración de lotería"),
    "photo": ("tiendas", "Fotografía"),
    "copyshop": ("servicios", "Copistería"),
    "dry_cleaning": ("servicios", "Tintorería"),
    "laundry": ("servicios", "Lavandería"),
    "travel_agency": ("servicios", "Agencia de viajes"),
    "interior_decoration": ("tiendas", "Decoración"),
    "kitchen": ("tiendas", "Cocinas"),
    "bathroom_furnishing": ("tiendas", "Baños"),
    "houseware": ("tiendas", "Menaje del hogar"),
    "appliance": ("tiendas", "Electrodomésticos"),
    "lighting": ("tiendas", "Iluminación"),
    "paint": ("tiendas", "Pinturas"),
    "garden_centre": ("tiendas", "Centro de jardinería"),
    "second_hand": ("tiendas", "Segunda mano"),
    "variety_store": ("tiendas", "Bazar"),
    "music": ("tiendas", "Tienda de música"),
    "musical_instrument": ("tiendas", "Instrumentos musicales"),
    "art": ("tiendas", "Arte"),
    "frame": ("tiendas", "Marcos"),
    "craft": ("tiendas", "Manualidades"),
    "video_games": ("tiendas", "Videojuegos"),
    "games": ("tiendas", "Juegos"),
    "locksmith": ("servicios", "Cerrajería"),
    "funeral_directors": ("servicios", "Funeraria"),
    "baby_goods": ("tiendas", "Artículos de bebé"),
    "bed": ("tiendas", "Colchones"),
    "curtain": ("tiendas", "Cortinas"),
    "tiles": ("tiendas", "Azulejos"),
    "trade": ("tiendas", "Suministros profesionales"),
    "wholesale": ("tiendas", "Venta al por mayor"),
    "e-cigarette": ("tiendas", "Vapeo"),
    "pawnbroker": ("tiendas", "Compraventa"),
    "rental": ("servicios", "Alquiler"),
    "storage_rental": ("servicios", "Trasteros"),
    "glaziery": ("servicios", "Cristalería"),
    "tailor": ("servicios", "Sastrería"),
    "shoe_repair": ("servicios", "Zapatero"),
    "repair": ("servicios", "Reparaciones"),
    "electrical": ("tiendas", "Material eléctrico"),
    "gas": ("tiendas", "Gas"),
    "agrarian": ("tiendas", "Suministros agrícolas"),
    "hifi": ("tiendas", "Hi-Fi"),
    "outdoor": ("tiendas", "Montaña y aire libre"),
    "fishing": ("tiendas", "Pesca"),
    "party": ("tiendas", "Artículos de fiesta"),
    "religion": ("tiendas", "Artículos religiosos"),
    "doors": ("tiendas", "Puertas"),
    "windows": ("tiendas", "Ventanas"),
    "department_store": ("tiendas", "Grandes almacenes"),
    "mall": ("tiendas", "Centro comercial"),
    "estate_agent": ("servicios", "Inmobiliaria"),
}

SHOP_EXCLUDED = {"vacant", "no", "disused"}

HEALTHCARE = {
    "dentist": ("salud", "Clínica dental"),
    "doctor": ("salud", "Consulta médica"),
    "clinic": ("salud", "Clínica"),
    "physiotherapist": ("salud", "Fisioterapia"),
    "psychotherapist": ("salud", "Psicología"),
    "optometrist": ("salud", "Optometría"),
    "podiatrist": ("salud", "Podología"),
    "alternative": ("salud", "Terapias alternativas"),
    "laboratory": ("salud", "Laboratorio"),
    "audiologist": ("salud", "Audiología"),
    "speech_therapist": ("salud", "Logopedia"),
    "occupational_therapist": ("salud", "Terapia ocupacional"),
    "nutrition_counselling": ("salud", "Nutrición"),
    "pharmacy": ("salud", "Farmacia"),
    "rehabilitation": ("salud", "Rehabilitación"),
    "centre": ("salud", "Centro sanitario"),
}

HEALTHCARE_EXCLUDED = {"hospital", "blood_donation", "vaccination_centre", "birthing_centre"}

CRAFT = {
    "plumber": ("servicios", "Fontanería"),
    "electrician": ("servicios", "Electricista"),
    "carpenter": ("servicios", "Carpintería"),
    "painter": ("servicios", "Pintor"),
    "locksmith": ("servicios", "Cerrajería"),
    "photographer": ("servicios", "Fotógrafo"),
    "tailor": ("servicios", "Sastrería"),
    "dressmaker": ("servicios", "Modista"),
    "shoemaker": ("servicios", "Zapatero"),
    "builder": ("servicios", "Construcción"),
    "hvac": ("servicios", "Climatización"),
    "glaziery": ("servicios", "Cristalería"),
    "metal_construction": ("servicios", "Cerrajería metálica"),
    "gardener": ("servicios", "Jardinería"),
    "upholsterer": ("servicios", "Tapicería"),
    "key_cutter": ("servicios", "Copia de llaves"),
    "jeweller": ("tiendas", "Joyero"),
    "stonemason": ("servicios", "Marmolista"),
    "roofer": ("servicios", "Tejados"),
    "tiler": ("servicios", "Alicatados"),
    "floorer": ("servicios", "Suelos"),
    "plasterer": ("servicios", "Yesero"),
    "printer": ("servicios", "Imprenta"),
    "sign_maker": ("servicios", "Rótulos"),
    "window_construction": ("servicios", "Carpintería de ventanas"),
    "cleaning": ("servicios", "Limpieza"),
    "caterer": ("restaurantes", "Catering"),
    "winery": ("alimentacion", "Bodega"),
    "brewery": ("alimentacion", "Cervecera artesanal"),
    "confectionery": ("alimentacion", "Obrador"),
    "bakery": ("alimentacion", "Obrador de pan"),
    "beekeeper": ("alimentacion", "Apicultor"),
    "optician": ("salud", "Óptica"),
}

OFFICE = {
    "lawyer": ("servicios", "Abogados"),
    "notary": ("servicios", "Notaría"),
    "accountant": ("servicios", "Asesoría contable"),
    "tax_advisor": ("servicios", "Asesoría fiscal"),
    "estate_agent": ("servicios", "Inmobiliaria"),
    "insurance": ("servicios", "Seguros"),
    "architect": ("servicios", "Arquitectura"),
    "travel_agent": ("servicios", "Agencia de viajes"),
    "employment_agency": ("servicios", "Agencia de empleo"),
    "financial": ("servicios", "Servicios financieros"),
    "financial_advisor": ("servicios", "Asesoría financiera"),
    "it": ("servicios", "Informática"),
    "company": ("servicios", "Empresa"),
    "consulting": ("servicios", "Consultoría"),
    "advertising_agency": ("servicios", "Publicidad"),
    "engineer": ("servicios", "Ingeniería"),
    "graphic_design": ("servicios", "Diseño gráfico"),
    "telecommunication": ("servicios", "Telecomunicaciones"),
    "logistics": ("servicios", "Logística"),
    "moving_company": ("servicios", "Mudanzas"),
    "property_management": ("servicios", "Administración de fincas"),
    "coworking": ("servicios", "Coworking"),
    "surveyor": ("servicios", "Topografía"),
    "construction_company": ("servicios", "Construcción"),
    "educational_institution": ("formacion", "Centro de formación"),
    "tutoring": ("formacion", "Clases particulares"),
    "therapist": ("salud", "Terapeuta"),
    "physician": ("salud", "Consulta médica"),
    "psychologist": ("salud", "Psicología"),
}

OFFICE_EXCLUDED = {
    "government", "diplomatic", "political_party", "religion", "ngo", "union",
    "association", "foundation", "charity", "administrative", "public_service", "vacant",
}

TOURISM = {
    "hotel": ("alojamiento", "Hotel"),
    "guest_house": ("alojamiento", "Hostal"),
    "hostel": ("alojamiento", "Albergue"),
    "motel": ("alojamiento", "Motel"),
    "apartment": ("alojamiento", "Apartamentos turísticos"),
    "chalet": ("alojamiento", "Casa rural"),
    "camp_site": ("alojamiento", "Camping"),
    "caravan_site": ("alojamiento", "Área de autocaravanas"),
    "gallery": ("tiendas", "Galería de arte"),
}

LEISURE = {
    "fitness_centre": ("ocio", "Gimnasio"),
    "sports_centre": ("ocio", "Centro deportivo"),
    "dance": ("ocio", "Escuela de baile"),
    "escape_game": ("ocio", "Escape room"),
    "bowling_alley": ("ocio", "Bolera"),
    "amusement_arcade": ("ocio", "Salón recreativo"),
    "adult_gaming_centre": ("ocio", "Salón de juego"),
    "horse_riding": ("ocio", "Hípica"),
    "sauna": ("ocio", "Sauna"),
    "tanning_salon": ("belleza", "Centro de bronceado"),
    "golf_course": ("ocio", "Golf"),
    "miniature_golf": ("ocio", "Minigolf"),
    "water_park": ("ocio", "Parque acuático"),
    "trampoline_park": ("ocio", "Parque de trampolines"),
    "ice_rink": ("ocio", "Pista de hielo"),
    "resort": ("alojamiento", "Resort"),
    "indoor_play": ("ocio", "Parque infantil cubierto"),
    "marina": ("ocio", "Puerto deportivo"),
}

CUISINE = {
    "spanish": "Española", "regional": "Regional", "tapas": "Tapas", "mediterranean": "Mediterránea",
    "italian": "Italiana", "pizza": "Pizza", "chinese": "China", "japanese": "Japonesa",
    "sushi": "Sushi", "asian": "Asiática", "indian": "India", "mexican": "Mexicana",
    "burger": "Hamburguesas", "kebab": "Kebab", "seafood": "Marisco", "fish": "Pescado",
    "steak_house": "Asador", "grill": "Parrilla", "chicken": "Pollo", "sandwich": "Bocadillos",
    "vegetarian": "Vegetariana", "vegan": "Vegana", "american": "Americana", "argentinian": "Argentina",
    "peruvian": "Peruana", "venezuelan": "Venezolana", "colombian": "Colombiana", "thai": "Tailandesa",
    "turkish": "Turca", "lebanese": "Libanesa", "moroccan": "Marroquí", "french": "Francesa",
    "greek": "Griega", "korean": "Coreana", "vietnamese": "Vietnamita", "basque": "Vasca",
    "galician": "Gallega", "catalan": "Catalana", "asturian": "Asturiana", "andalusian": "Andaluza",
    "coffee_shop": "Cafetería", "breakfast": "Desayunos", "churros": "Churros", "ice_cream": "Helados",
    "crepe": "Crepes", "donut": "Dónuts", "paella": "Paellas", "rice": "Arroces", "chocolate": "Chocolate",
    "brunch": "Brunch", "international": "Internacional", "fusion": "Fusión", "doner": "Döner",
}

# Orden de prioridad de las claves principales.
_KEYS = (
    ("amenity", AMENITY, AMENITY_EXCLUDED),
    ("shop", SHOP, SHOP_EXCLUDED),
    ("healthcare", HEALTHCARE, HEALTHCARE_EXCLUDED),
    ("craft", CRAFT, set()),
    ("office", OFFICE, OFFICE_EXCLUDED),
    ("tourism", TOURISM, None),
    ("leisure", LEISURE, None),
)

_FALLBACK = {
    "amenity": ("otros", "Establecimiento"),
    "shop": ("tiendas", "Tienda"),
    "healthcare": ("salud", "Centro sanitario"),
    "craft": ("servicios", "Oficio"),
    "office": ("servicios", "Oficina"),
}


def classify(tags: dict) -> tuple[str, str] | None:
    """Devuelve (categoría, tipo legible) o None si no es un negocio llamable."""
    # Los negocios cerrados se etiquetan como `disused:shop=*` (no los vemos)
    # o con `disused=yes`.
    if tags.get("disused") == "yes" or tags.get("opening_hours") == "closed":
        return None
    for key, table, excluded in _KEYS:
        value = tags.get(key)
        if not value:
            continue
        value = value.split(";")[0].strip()
        if value in table:
            category, label = table[value]
            if key == "shop" and value == "hairdresser" and (tags.get("hairdresser") == "barber" or tags.get("male") == "yes" and tags.get("female") == "no"):
                label = "Barbería"
            return category, label
        if excluded is None:
            # tourism/leisure: solo los valores de la lista blanca.
            continue
        if value in excluded:
            return None
        if key in _FALLBACK:
            category, label = _FALLBACK[key]
            if key in ("shop", "craft", "office") and value not in ("yes",):
                label = f"{label} · {value.replace('_', ' ')}"
            return category, label
    return None


def cuisine_label(tags: dict) -> str | None:
    raw = tags.get("cuisine")
    if not raw:
        return None
    parts = []
    for value in raw.split(";"):
        value = value.strip().lower()
        if value and value in CUISINE and CUISINE[value] not in parts:
            parts.append(CUISINE[value])
    return " · ".join(parts[:3]) or None
