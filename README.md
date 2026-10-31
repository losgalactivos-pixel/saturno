# Saturno · Negocios sin web

Aplicación web local para encontrar negocios con teléfono y **sin página web** en una ciudad,
llamarlos con un clic y llevar el seguimiento de cada llamada (estado, notas, rellamadas).

- Busca o elige una ciudad, filtra por tipo de negocio (restaurantes, cafeterías, peluquerías,
  clínicas, tiendas…) y por nombre.
- Cada ficha muestra nombre, tipo, dirección, teléfono, horario y redes sociales **cuando la fuente
  los tiene**; si faltan, lo indica.
- Botón «Llamar» (`tel:`), mapa, «Cómo llegar» y enlaces a la ficha pública del negocio.
- Estados rápidos: pendiente, no contestó, interesado, no interesado y volver a llamar (con fecha).
- Notas con guardado automático, registro rápido con fecha e historial de llamadas.
- Buscador por contenido de las notas («no contestaron»), filtros con/sin nota y por estado.
- Ciudades pendientes y terminadas, con progreso de contactados.
- Vista **Seguimiento** con todos los negocios trabajados de todas tus ciudades.

## Versión publicada (móvil, sin instalar nada)

**https://losgalactivos-pixel.github.io/saturno/**

Se abre en cualquier móvil u ordenador. Esta versión no usa el servidor de Python: el navegador
consulta OpenStreetMap directamente y **guarda tus ciudades, notas y estados solo en ese
dispositivo** (no se envían a ningún sitio). Para pasar tu trabajo del PC al móvil o al revés, usa
**Exportar** en uno e **Importar** en el otro. Cada persona que abra el enlace tiene sus propios
datos. En el móvil puedes añadirla a la pantalla de inicio (Chrome: menú ⋮ → «Añadir a pantalla de
inicio»; Safari: Compartir → «Añadir a pantalla de inicio»).

Se actualiza sola: cada cambio que se sube a la rama `main` dentro de `public/` se publica con
GitHub Actions (`.github/workflows/pages.yml`).

## Requisitos (versión con servidor)

- **Python 3.9 o superior** (ya lo tienes: 3.12). No hace falta instalar paquetes: solo usa la
  biblioteca estándar.
- Conexión a Internet (para consultar OpenStreetMap).
- Un navegador moderno (Edge, Chrome, Firefox o Safari).

## Ejecutar

Doble clic en **`Iniciar Saturno.bat`**, o desde una terminal en esta carpeta:

```bash
python server.py --open
```

Se abre `http://localhost:8787`. Cierra la ventana del servidor (o pulsa Ctrl+C) para detenerlo.

### Icono en el escritorio

- Doble clic en **`Crear acceso directo.bat`**: crea `Saturno` en tu Escritorio con el logo.
  Al abrirlo arranca el servidor minimizado y abre la app (si ya estaba en marcha, solo la abre).
- Además, con la app abierta en Edge o Chrome puedes usar **Instalar Saturno** (icono en la barra de
  direcciones o menú ⋯ → Aplicaciones). Se abre en su propia ventana; el servidor tiene que estar en
  marcha.

## Configuración

No necesita claves ni cuentas. Para cambiar algo, copia `.env.example` como `.env` y edítalo:

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `SATURNO_HOST` | `127.0.0.1` | `0.0.0.0` para abrir la app desde el móvil en tu Wi-Fi (sin contraseña: solo en redes de confianza). |
| `SATURNO_PORT` | `8787` | Puerto del servidor local. |
| `SATURNO_CONTACT_EMAIL` | vacío | Correo de contacto que recomienda la política de Nominatim. Recomendado. |
| `SATURNO_DB_PATH` | `data/saturno.db` | Fichero SQLite con ciudades, notas y estados. |
| `SATURNO_CACHE_HOURS` | `24` | Horas que se reutilizan los resultados de una ciudad. |
| `SATURNO_MIN_REFRESH_MINUTES` | `10` | Tiempo mínimo entre dos «Actualizar datos» de la misma ciudad. |
| `SATURNO_OVERPASS_URLS` | 3 servidores públicos | Servidores de Overpass API, separados por comas. |
| `SATURNO_OVERPASS_TIMEOUT` | `180` | Segundos máximos por consulta. |
| `SATURNO_NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Servidor de búsqueda de ciudades. |

## Fuente de datos y limitaciones

Los negocios vienen de **[OpenStreetMap](https://www.openstreetmap.org/copyright)** (licencia ODbL),
un mapa colaborativo y abierto:

- **Nominatim** busca la ciudad y su límite municipal.
- **Overpass API** devuelve los establecimientos de esa zona que tienen teléfono.

Saturno descarta servicios públicos (ayuntamientos, colegios, hospitales…), clasifica el resto en
categorías y se queda con los que **no tienen web propia en OSM**. Las URLs de Facebook, Instagram y
similares, o las fichas en directorios (Tripadvisor, TheFork…), no cuentan como web propia: se
muestran como redes o fichas públicas.

Lo que conviene saber:

- **«Sin web» significa «sin web en OpenStreetMap».** No demuestra que el negocio no tenga web. Cada
  ficha tiene «Buscar en la web» y «Buscar en Google Maps» para comprobarlo, y un control para
  marcarlo como *No tiene web* (confirmado) o *Tiene web* (se oculta de la lista activa).
- **Cobertura:** OSM es muy completo en algunas ciudades y escaso en otras. No incluye todos los
  negocios ni todos los teléfonos.
- **Horarios y redes sociales** solo aparecen si alguien los añadió a OSM. Nunca se inventan.
- **Cadenas y franquicias** (marcas con `brand` en OSM) se ocultan por defecto porque suelen tener
  web corporativa; puedes mostrarlas en Filtros.
- **Tiempo de carga:** la primera consulta de una ciudad tarda entre 20 s y 1–2 min (más en ciudades
  grandes o en horas punta). Después se guarda 24 h en el disco y abre al instante.
- **Uso responsable:** los servidores de OSM son públicos y gratuitos. Saturno respeta sus políticas:
  máximo 1 búsqueda de ciudad por segundo y solo al pulsar «Buscar» (sin autocompletar), un
  User-Agent identificativo, una sola consulta de Overpass a la vez, caché local, sin consultas
  duplicadas y cambio de servidor solo si el anterior está saturado. Si un servidor pide esperar
  (error 429), la app lo indica.
- Los mapas de cada ficha son el visor oficial de openstreetmap.org. «Cómo llegar» abre Google Maps.

Si ves un dato erróneo, puedes corregirlo en OpenStreetMap desde el enlace «Ficha en
OpenStreetMap» de cada negocio.

## Tus datos

- Ciudades, notas, estados e historial se guardan en `data/saturno.db` (SQLite) en tu PC. Siguen ahí
  al cerrar el navegador o reiniciar.
- **Exportar** (barra lateral) descarga una copia en JSON; **Importar** la recupera y fusiona (gana
  el cambio más reciente de cada ficha).
- Para empezar de cero, cierra el servidor y borra la carpeta `data`.

## Uso desde el móvil

Pon `SATURNO_HOST=0.0.0.0` en `.env`, reinicia y abre `http://IP-de-tu-PC:8787` en el móvil (misma
Wi-Fi). Así «Llamar» marca directamente desde el teléfono y las notas se comparten con el PC.
No tiene contraseña: no lo hagas en redes públicas.

## Teclado

- `/` enfoca el buscador. `Esc` cierra la ficha, el panel de filtros o el menú.
- `Tab` recorre fichas y botones; `Intro` abre la ficha enfocada. Flechas en los grupos de estado.

## Estructura

```text
server.py                 Arranque (python server.py [--open])
saturno/
  config.py               Variables de entorno y .env
  osm.py                  Nominatim + Overpass: límites, caché, peticiones sin duplicar
  normalize.py            Elementos OSM → fichas (teléfonos, web vs. redes, dirección)
  taxonomy.py             Categorías y tipos de negocio en español
  db.py                   SQLite: ciudades, seguimiento, caché, exportar/importar
  web.py                  Servidor HTTP: API JSON + ficheros estáticos
public/
  index.html, manifest.webmanifest, sw.js
  css/app.css             Estilos (morado principal #790DD6)
  icons/                  Logo Saturno (SVG), PNG, .ico
  js/app.js               Rutas y acciones globales
  js/store.js             Estado y guardado automático con reintentos
  js/filters.js           Filtros, recuentos y orden
  js/components/          Componentes reutilizables (ficha, detalle, filtros, lista…)
  js/views/               Inicio, Ciudad y Seguimiento
  js/api.js               Detecta el modo: servidor (API local) o sin servidor
  js/standalone/          Modo sin servidor: OSM desde el navegador + IndexedDB
tests/                    Pruebas de la normalización de datos
tools/                    Iconos, acceso directo y export_taxonomy.py
```

`public/js/standalone/taxonomy.js` se genera desde el código Python con
`python tools/export_taxonomy.py`, para que las dos versiones clasifiquen igual. Si cambias
`saturno/taxonomy.py` o `saturno/normalize.py`, vuelve a ejecutarlo (y adapta
`public/js/standalone/normalize.js` si cambia la lógica).

### API local

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/geocode?q=` | Buscar ciudades (Nominatim) |
| GET/POST | `/api/cities` | Listar / añadir ciudad |
| PATCH/DELETE | `/api/cities/{id}` | Marcar terminada / quitar |
| GET | `/api/cities/{id}/businesses[?refresh=1]` | Negocios sin web de la ciudad |
| GET | `/api/tracking` | Todo el seguimiento |
| PUT | `/api/tracking/{bizId}` | Guardar estado, notas, revisión de web, fecha |
| POST | `/api/tracking/{bizId}/calls` | Registrar una llamada |
| GET/POST | `/api/export`, `/api/import` | Copia de seguridad |

## Desarrollo

```bash
python -m unittest discover -s tests
```

```bash
python tools/render_icons.py
```

El segundo comando regenera los PNG y el `.ico` a partir de los SVG (usa Edge o Chrome en modo
headless).
