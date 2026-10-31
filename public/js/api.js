// Cliente de la API. Funciona en dos modos:
// - «server»: hay un servidor de Saturno (python server.py); los datos se
//   guardan en su SQLite y se comparten entre los dispositivos que lo usen.
// - «standalone»: página estática (p. ej. GitHub Pages); se consulta OSM
//   directamente y los datos se guardan en este navegador (IndexedDB).
// Las peticiones GET idénticas en curso se comparten para no duplicarlas.
import { ApiError } from './errors.js';

export { ApiError };

let backend = null;
let modePromise = null;

/** Detecta el modo una sola vez. Devuelve 'server' o 'standalone'. */
export function detectMode() {
  modePromise ??= (async () => {
    // En alojamientos estáticos conocidos no hay servidor: no hace falta preguntar.
    const staticHost = /\.github\.io$|\.pages\.dev$|\.netlify\.app$/.test(location.hostname);
    try {
      if (staticHost) throw new Error('static');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch('api/health', { signal: ctrl.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
      clearTimeout(timer);
      if (res.ok && (await res.json()).app === 'saturno') return 'server';
    } catch {
      /* sin servidor: modo independiente */
    }
    const { createBackend } = await import('./standalone/backend.js');
    backend = createBackend();
    return 'standalone';
  })();
  return modePromise;
}

const inflight = new Map();

async function request(method, path, body, { keepalive = false } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      keepalive,
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'No se pudo conectar con el servidor de Saturno. ¿Sigue abierta la ventana del servidor?');
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!response.ok) {
    const err = payload?.error || {};
    throw new ApiError(response.status, err.code || 'http', err.message || `Error ${response.status}`);
  }
  return payload;
}

function get(path) {
  if (inflight.has(path)) return inflight.get(path);
  const promise = request('GET', path).finally(() => inflight.delete(path));
  inflight.set(path, promise);
  return promise;
}

const local = (name, ...args) => backend[name](...args);

export const api = {
  config: () => (backend ? local('config') : get('api/config')),
  geocode: (q) => (backend ? local('geocode', q) : get(`api/geocode?q=${encodeURIComponent(q)}`)),
  cities: () => (backend ? local('cities') : get('api/cities')),
  addCity: (city) => (backend ? local('addCity', city) : request('POST', 'api/cities', city)),
  setCityDone: (id, done) => (backend ? local('setCityDone', id, done) : request('PATCH', `api/cities/${id}`, { done })),
  removeCity: (id) => (backend ? local('removeCity', id) : request('DELETE', `api/cities/${id}`)),
  businesses: (id, { refresh = false } = {}) =>
    backend ? local('businesses', id, { refresh }) : get(`api/cities/${id}/businesses${refresh ? '?refresh=1' : ''}`),
  tracking: () => (backend ? local('tracking') : get('api/tracking')),
  saveTracking: (bizId, patch, { keepalive = false } = {}) =>
    backend ? local('saveTracking', bizId, patch) : request('PUT', `api/tracking/${bizId}`, patch, { keepalive }),
  logCall: (bizId, payload) => (backend ? local('logCall', bizId, payload) : request('POST', `api/tracking/${bizId}/calls`, payload)),
  exportData: () => (backend ? local('exportData') : request('GET', 'api/export')),
  importData: (data) => (backend ? local('importData', data) : request('POST', 'api/import', data)),
};
