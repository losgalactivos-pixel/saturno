// Modo sin servidor (p. ej. GitHub Pages): la página consulta OpenStreetMap
// directamente y guarda ciudades, notas y estados en IndexedDB, en el propio
// dispositivo. Expone la misma interfaz que la API del servidor Python.
//
// Respeta las políticas de uso de OSM igual que el servidor: Nominatim como
// máximo 1 petición/s y solo al pulsar «Buscar», una consulta de Overpass a
// la vez, caché local (24 h por ciudad) y sin peticiones duplicadas.
import { ApiError } from '../errors.js';
import { TAXONOMY as T } from './taxonomy.js';
import { normalizeElements } from './normalize.js';
import { idb } from './idb.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_TIMEOUT = 180;
const CACHE_HOURS = 24;
const MIN_REFRESH_MINUTES = 10;
const GEOCODE_TTL_MS = 30 * 24 * 3600 * 1000;
const MAX_NOTES = 20000;
const MAX_HISTORY = 200;

const STATUS_IDS = new Set(T.statuses.map((s) => s.id));
const REVIEW_IDS = new Set(T.webReviews.map((w) => w.id));
const OSM_ID = /^[nwr]\d{1,15}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const invalid = (message) => new ApiError(400, 'validation', message);

// ------------------------------------------------------------- utilidades
const inflight = new Map();
function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

let lastNominatim = 0;
async function nominatimSlot() {
  const wait = lastNominatim + 1100 - Date.now();
  lastNominatim = Math.max(Date.now(), lastNominatim + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

let overpassQueue = Promise.resolve();
function withOverpassLock(fn) {
  const run = overpassQueue.then(fn, fn);
  overpassQueue = run.catch(() => {});
  return run;
}

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') err.timeout = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function cacheGet(key) {
  return (await idb.get('cache', key)) || null;
}

function cachePut(key, payload, meta = {}) {
  const fetchedAt = Date.now();
  return idb.put('cache', { key, fetchedAt, meta, payload }).then(() => fetchedAt);
}

// -------------------------------------------------------- geocodificación
function candidate(item) {
  const osmType = item.osm_type;
  if (!['node', 'way', 'relation'].includes(osmType)) return null;
  const address = item.address || {};
  const region = [];
  for (const key of ['province', 'county', 'state', 'country']) {
    const value = address[key];
    if (value && !region.includes(value) && value !== item.name) region.push(value);
  }
  const bb = (item.boundingbox || []).map(Number);
  return {
    id: `${osmType[0]}${item.osm_id}`,
    osmType,
    osmId: Number(item.osm_id),
    name: item.name || (item.display_name || '').split(',')[0],
    displayName: item.display_name || '',
    region: region.slice(0, 3).join(', '),
    kind: item.addresstype || item.type || '',
    lat: Number(item.lat),
    lon: Number(item.lon),
    bbox: bb.length === 4 && bb.every(Number.isFinite) ? [bb[0], bb[2], bb[1], bb[3]] : [],
    countryCode: address.country_code || '',
  };
}

async function geocode(rawQuery) {
  const query = rawQuery.split(/\s+/).filter(Boolean).join(' ').slice(0, 120);
  if (query.length < 2) throw new ApiError(400, 'bad_query', 'Escribe al menos 2 caracteres.');
  const key = `geocode:v1:${query.toLowerCase()}`;
  const cached = await cacheGet(key);
  if (cached && Date.now() - cached.fetchedAt < GEOCODE_TTL_MS) return { results: cached.payload.results };
  return dedupe(key, async () => {
    const params = new URLSearchParams({
      q: query, format: 'jsonv2', addressdetails: '1', limit: '8', 'accept-language': 'es', featureType: 'settlement',
    });
    await nominatimSlot();
    let raw;
    try {
      raw = await fetchJson(`${NOMINATIM}/search?${params}`, { headers: { Accept: 'application/json' } }, 20000);
    } catch (err) {
      if (err.status === 429) throw new ApiError(429, 'rate_limited', 'El buscador de ciudades (Nominatim) pide esperar un poco. Prueba de nuevo en un minuto.');
      if (err.status) throw new ApiError(502, 'upstream', `Nominatim respondió con un error (${err.status}).`);
      throw new ApiError(503, 'offline', 'No se pudo contactar con Nominatim. Revisa tu conexión a Internet.');
    }
    const results = (Array.isArray(raw) ? raw : []).map(candidate).filter(Boolean);
    await cachePut(key, { results });
    return { results };
  });
}

// --------------------------------------------------------------- negocios
function buildQuery(selector, areaHeader = '') {
  const parts = ['phone', 'contact:phone', 'mobile', 'contact:mobile'].map((k) => `nwr["${k}"]${selector};`);
  return `[out:json][timeout:${OVERPASS_TIMEOUT}];\n${areaHeader}(\n  ${parts.join('\n  ')}\n);\nout tags center qt;`;
}

async function overpass(query) {
  return withOverpassLock(async () => {
    let lastError = null;
    for (const endpoint of OVERPASS) {
      let data;
      try {
        data = await fetchJson(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        }, (OVERPASS_TIMEOUT + 20) * 1000);
      } catch (err) {
        if (err.timeout) throw new ApiError(504, 'timeout', 'La consulta tardó demasiado. Es habitual en ciudades muy grandes o en horas punta: reintenta en unos minutos.');
        if (err.status === 429) {
          lastError = new ApiError(429, 'rate_limited', 'Los servidores de OpenStreetMap están saturados o piden esperar. Prueba de nuevo en un par de minutos.');
          continue;
        }
        if ([502, 503, 504].includes(err.status)) {
          lastError = new ApiError(503, 'busy', 'El servidor de OpenStreetMap está ocupado. Prueba de nuevo en unos minutos.');
          continue;
        }
        if (err.status) throw new ApiError(502, 'upstream', `Overpass respondió con un error (${err.status}).`);
        lastError = new ApiError(503, 'offline', 'No se pudo contactar con OpenStreetMap. Revisa tu conexión a Internet.');
        continue;
      }
      const remark = String(data.remark || '').toLowerCase();
      if (remark.includes('runtime error') && !data.elements?.length) {
        if (remark.includes('timed out') || remark.includes('timeout')) {
          throw new ApiError(504, 'timeout', 'La consulta superó el tiempo máximo del servidor. Reintenta en unos minutos.');
        }
        lastError = new ApiError(503, 'busy', 'El servidor de OpenStreetMap no pudo completar la consulta.');
        continue;
      }
      return { data, endpoint };
    }
    throw lastError || new ApiError(502, 'upstream', 'No se pudo consultar OpenStreetMap.');
  });
}

async function fetchCity(city) {
  if (city.osmType === 'relation' || city.osmType === 'way') {
    const areaId = (city.osmType === 'relation' ? 3600000000 : 2400000000) + Number(city.osmId);
    const { data, endpoint } = await overpass(buildQuery('(area.a)', `area(id:${areaId})->.a;\n.a out ids;\n`));
    if ((data.elements || []).some((el) => el.type === 'area')) return { data, endpoint, mode: 'area' };
  }
  const bbox = city.bbox || [];
  let selector;
  let mode;
  if (bbox.length === 4 && bbox.every((x) => typeof x === 'number')) {
    selector = `(${bbox.join(',')})`;
    mode = 'bbox';
  } else {
    const radius = { city: 6000, town: 3000 }[city.kind] || 1500;
    selector = `(around:${radius},${city.lat},${city.lon})`;
    mode = 'radius';
  }
  const { data, endpoint } = await overpass(buildQuery(selector));
  return { data, endpoint, mode };
}

async function businesses(cityId, { refresh = false } = {}) {
  const city = await idb.get('cities', cityId);
  if (!city) throw new ApiError(404, 'not_found', 'Añade primero la ciudad a tu lista.');
  const key = `biz:v${T.normalizeVersion}:${cityId}`;
  const cached = await cacheGet(key);
  if (cached) {
    const age = Date.now() - cached.fetchedAt;
    const fresh = age < CACHE_HOURS * 3600 * 1000;
    const tooRecent = age < MIN_REFRESH_MINUTES * 60 * 1000;
    if ((fresh && !refresh) || tooRecent) {
      const updated = await updateCityTotal(cityId, cached.payload.items.length, false);
      return { ...cached.payload, ...cached.meta, fetchedAt: cached.fetchedAt, cached: true, refreshSkipped: Boolean(refresh && tooRecent), city: updated };
    }
  }
  return dedupe(key, async () => {
    const started = performance.now();
    const { data, endpoint, mode } = await fetchCity(city);
    const result = normalizeElements(data.elements || []);
    const meta = { endpoint, areaMode: mode, queryMs: Math.round(performance.now() - started) };
    const fetchedAt = await cachePut(key, result, meta);
    const updated = await updateCityTotal(cityId, result.items.length, true);
    return { ...result, ...meta, fetchedAt, cached: false, refreshSkipped: false, city: updated };
  });
}

async function updateCityTotal(cityId, total, loaded) {
  const city = await idb.get('cities', cityId);
  if (!city) return null;
  const next = { ...city, total, lastLoadedAt: loaded ? Date.now() : city.lastLoadedAt ?? Date.now() };
  await idb.put('cities', next);
  return next;
}

// --------------------------------------------------------------- ciudades
async function listCities() {
  const cities = await idb.all('cities');
  return cities.sort((a, b) => a.addedAt - b.addedAt);
}

async function addCity(c) {
  const id = String(c?.id || '');
  if (!OSM_ID.test(id)) throw invalid('Identificador de ciudad no válido.');
  if (!['node', 'way', 'relation'].includes(c.osmType)) throw invalid('Tipo de elemento OSM no válido.');
  const data = {
    osmType: c.osmType,
    osmId: Number(c.osmId),
    name: String(c.name || '').slice(0, 200),
    displayName: String(c.displayName || '').slice(0, 400),
    region: String(c.region || '').slice(0, 200),
    kind: String(c.kind || '').slice(0, 40),
    lat: Number(c.lat),
    lon: Number(c.lon),
    bbox: (c.bbox || []).map(Number).slice(0, 4),
  };
  if (!data.name || !Number.isFinite(data.lat) || !Number.isFinite(data.lon)) throw invalid('Datos de ciudad incompletos.');
  if (`${data.osmType[0]}${data.osmId}` !== id) throw invalid('El identificador no coincide con el elemento OSM.');
  const existing = await idb.get('cities', id);
  const city = existing
    ? { ...existing, ...data }
    : { ...data, id, done: Boolean(c.done), doneAt: c.done ? Date.now() : null, addedAt: Number(c.addedAt) || Date.now(), lastLoadedAt: null, total: c.total ?? null };
  return idb.put('cities', city);
}

async function setCityDone(id, done) {
  const city = await idb.get('cities', id);
  if (!city) throw new ApiError(404, 'not_found', 'Esa ciudad no está en tu lista.');
  return { city: await idb.put('cities', { ...city, done: Boolean(done), doneAt: done ? Date.now() : null }) };
}

async function removeCity(id) {
  const city = await idb.get('cities', id);
  if (!city) throw new ApiError(404, 'not_found', 'Esa ciudad no está en tu lista.');
  await idb.delete('cities', id);
  return { ok: true };
}

// ------------------------------------------------------------ seguimiento
let writeQueue = Promise.resolve();
function serialized(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

function upsertTracking(bizId, patch, event = null) {
  return serialized(async () => {
    if (!OSM_ID.test(bizId)) throw invalid('Identificador de negocio no válido.');
    const current = (await idb.get('tracking', bizId)) || {
      bizId, cityId: null, status: 'pendiente', notes: '', webReview: 'sin_verificar', webUrl: null,
      callbackAt: null, history: [], snapshot: null, updatedAt: 0,
    };
    const history = [...current.history];
    const at = Date.now();
    if ('status' in patch) {
      if (!STATUS_IDS.has(patch.status)) throw invalid('Estado no válido.');
      if (patch.status !== current.status) history.push({ at, kind: 'status', value: patch.status });
      current.status = patch.status;
    }
    if ('notes' in patch) {
      const notes = String(patch.notes || '');
      if (notes.length > MAX_NOTES) throw invalid(`Las notas no pueden superar ${MAX_NOTES} caracteres.`);
      current.notes = notes;
    }
    if ('webReview' in patch) {
      if (!REVIEW_IDS.has(patch.webReview)) throw invalid('Revisión de web no válida.');
      if (patch.webReview !== current.webReview) history.push({ at, kind: 'web', value: patch.webReview });
      current.webReview = patch.webReview;
    }
    if ('webUrl' in patch) current.webUrl = String(patch.webUrl || '').trim().slice(0, 500) || null;
    if ('callbackAt' in patch) {
      const value = patch.callbackAt || null;
      if (value !== null && !DATE.test(String(value))) throw invalid('Fecha de rellamada no válida (AAAA-MM-DD).');
      current.callbackAt = value;
    }
    if (patch.cityId) {
      if (!OSM_ID.test(String(patch.cityId))) throw invalid('Ciudad no válida.');
      current.cityId = patch.cityId;
    }
    if (patch.snapshot) current.snapshot = patch.snapshot;
    if (event) history.push({ at, ...event });
    current.history = history.slice(-MAX_HISTORY);
    current.updatedAt = at;
    await idb.put('tracking', current);
    return { tracking: current };
  });
}

// ------------------------------------------------------ exportar/importar
async function exportAll() {
  return { format: 'saturno-export', version: 1, exportedAt: Date.now(), cities: await listCities(), tracking: await idb.all('tracking') };
}

async function importAll(data) {
  if (!data || data.format !== 'saturno-export') throw invalid('El fichero no es una exportación de Saturno.');
  let cities = 0;
  let tracking = 0;
  let skipped = 0;
  for (const city of data.cities || []) {
    try {
      const existed = await idb.get('cities', String(city.id));
      const saved = await addCity(city);
      if (city.done && !(existed && existed.done)) await idb.put('cities', { ...saved, done: true, doneAt: city.doneAt || Date.now() });
      if (!existed) cities += 1;
    } catch {
      skipped += 1;
    }
  }
  for (const record of data.tracking || []) {
    const bizId = String(record.bizId || '');
    if (!OSM_ID.test(bizId)) {
      skipped += 1;
      continue;
    }
    const current = await idb.get('tracking', bizId);
    if (current && current.updatedAt >= Number(record.updatedAt || 0)) continue;
    await idb.put('tracking', {
      bizId,
      cityId: OSM_ID.test(String(record.cityId || '')) ? record.cityId : null,
      status: STATUS_IDS.has(record.status) ? record.status : 'pendiente',
      notes: String(record.notes || '').slice(0, MAX_NOTES),
      webReview: REVIEW_IDS.has(record.webReview) ? record.webReview : 'sin_verificar',
      webUrl: record.webUrl || null,
      callbackAt: DATE.test(String(record.callbackAt || '')) ? record.callbackAt : null,
      history: Array.isArray(record.history) ? record.history.slice(-MAX_HISTORY) : [],
      snapshot: record.snapshot || null,
      updatedAt: Number(record.updatedAt) || Date.now(),
    });
    tracking += 1;
  }
  return { result: { cities, tracking, skipped } };
}

// ---------------------------------------------------------------- interfaz
export function createBackend() {
  return {
    mode: 'standalone',
    config: async () => ({
      app: { name: 'Saturno', version: '1.0.0' },
      mode: 'standalone',
      categories: T.categories,
      statuses: T.statuses,
      webReviews: T.webReviews,
      cacheHours: CACHE_HOURS,
      minRefreshMinutes: MIN_REFRESH_MINUTES,
      source: {
        name: 'OpenStreetMap', attribution: '© colaboradores de OpenStreetMap', license: 'ODbL 1.0',
        url: 'https://www.openstreetmap.org/copyright',
      },
    }),
    geocode: (q) => geocode(q),
    cities: async () => ({ cities: await listCities() }),
    addCity: async (c) => ({ city: await addCity(c) }),
    setCityDone,
    removeCity,
    businesses,
    tracking: async () => ({ tracking: await idb.all('tracking') }),
    saveTracking: (bizId, patch) => {
      const allowed = ['status', 'notes', 'webReview', 'webUrl', 'callbackAt', 'cityId', 'snapshot'];
      return upsertTracking(bizId, Object.fromEntries(Object.entries(patch || {}).filter(([k]) => allowed.includes(k))));
    },
    logCall: (bizId, body = {}) => {
      const tel = String(body.tel || '').replace(/[^\d+]/g, '').slice(0, 20);
      const patch = {};
      if (body.cityId) patch.cityId = body.cityId;
      if (body.snapshot) patch.snapshot = body.snapshot;
      return upsertTracking(bizId, patch, { kind: 'call', tel });
    },
    exportData: exportAll,
    importData: importAll,
  };
}
