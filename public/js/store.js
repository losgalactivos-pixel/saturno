// Estado de la aplicación y sincronización del seguimiento con el servidor.
import { api } from './api.js';
import { fold } from './utils.js';
import { toast } from './components/Toast.js';

const listeners = new Map();

/** Suscribe `fn` a un tema. Devuelve la función para anular la suscripción. */
export function on(topic, fn) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(fn);
  return () => listeners.get(topic)?.delete(fn);
}

export function emit(topic, payload) {
  for (const fn of listeners.get(topic) || []) fn(payload);
}

export const state = {
  mode: 'server', // 'server' | 'standalone' (ver api.js)
  config: null,
  cities: [],
  tracking: new Map(),
  cityData: new Map(), // cityId -> { status: 'loading'|'ready'|'error', data, error, startedAt }
  route: { name: 'home', cityId: null },
};

// ------------------------------------------------------------------ catálogos
export const statusLabel = (id) => state.config?.statuses.find((s) => s.id === id)?.label || id;
export const webReviewLabel = (id) => state.config?.webReviews.find((w) => w.id === id)?.label || id;
export const category = (id) => state.config?.categories.find((c) => c.id === id) || { id, label: 'Otros', icon: 'dots' };

// ------------------------------------------------------------------ ciudades
export const cityById = (id) => state.cities.find((c) => c.id === id) || null;

export function setCities(list) {
  state.cities = list;
  emit('cities');
}

export function upsertCity(city) {
  const index = state.cities.findIndex((c) => c.id === city.id);
  if (index === -1) state.cities = [...state.cities, city];
  else state.cities = state.cities.map((c) => (c.id === city.id ? { ...c, ...city } : c));
  emit('cities');
}

export async function addCity(candidate) {
  const existing = cityById(candidate.id);
  if (existing) return existing;
  const { city } = await api.addCity(candidate);
  upsertCity(city);
  return city;
}

export async function setCityDone(id, done) {
  const city = cityById(id);
  if (!city) return;
  upsertCity({ ...city, done, doneAt: done ? Date.now() : null });
  try {
    const res = await api.setCityDone(id, done);
    upsertCity(res.city);
  } catch (err) {
    upsertCity(city);
    toast(err.message, { type: 'error' });
  }
}

export async function removeCity(id) {
  const city = cityById(id);
  if (!city) return null;
  await api.removeCity(id);
  state.cities = state.cities.filter((c) => c.id !== id);
  emit('cities');
  return city;
}

// ------------------------------------------------------------------ negocios
export function prepareItems(items, cityId) {
  for (const item of items) {
    item.cityId = cityId;
    item._search = fold([item.name, item.type, item.detail, item.address, item.locality, item.postcode].filter(Boolean).join(' '));
  }
  return items;
}

export function snapshotOf(item) {
  const { _search, ...rest } = item;
  return { ...rest, cityName: cityById(item.cityId)?.name || item.cityName || null };
}

// --------------------------------------------------------------- seguimiento
export const statusOf = (bizId) => state.tracking.get(bizId)?.status || 'pendiente';

export function isTracked(rec) {
  return Boolean(
    rec &&
      (rec.status !== 'pendiente' ||
        rec.notes?.trim() ||
        rec.webReview !== 'sin_verificar' ||
        rec.callbackAt ||
        rec.history?.some((e) => e.kind === 'call')),
  );
}

/** Negocios con algún seguimiento, reconstruidos desde la ficha guardada. */
export function trackedItems() {
  const items = [];
  for (const rec of state.tracking.values()) {
    if (!rec.snapshot || !isTracked(rec)) continue;
    const live = rec.cityId && state.cityData.get(rec.cityId)?.data?.items.find((i) => i.id === rec.bizId);
    if (live) {
      items.push(live);
      continue;
    }
    const item = { ...rec.snapshot, id: rec.bizId, cityId: rec.cityId };
    prepareItems([item], rec.cityId);
    items.push(item);
  }
  return items;
}

export function lastCall(rec) {
  if (!rec?.history) return null;
  for (let i = rec.history.length - 1; i >= 0; i -= 1) if (rec.history[i].kind === 'call') return rec.history[i];
  return null;
}

function blankRecord(item) {
  return {
    bizId: item.id, cityId: item.cityId || null, status: 'pendiente', notes: '', webReview: 'sin_verificar',
    webUrl: null, callbackAt: null, history: [], snapshot: null, updatedAt: 0,
  };
}

const pending = new Map(); // bizId -> { patch, item, timer, attempts }
const chains = new Map(); // bizId -> Promise (guardados en serie por negocio)
let warnedOffline = false;

/**
 * Actualiza el seguimiento de un negocio al instante en la interfaz y lo
 * guarda en el servidor (con `delay` ms de espera para agrupar escritura).
 */
export function updateTracking(item, patch, { delay = 0 } = {}) {
  const prev = state.tracking.get(item.id) || blankRecord(item);
  const at = Date.now();
  const next = { ...prev, ...patch, cityId: item.cityId || prev.cityId, snapshot: snapshotOf(item), updatedAt: at };
  const history = [...(prev.history || [])];
  if (patch.status && patch.status !== prev.status) history.push({ at, kind: 'status', value: patch.status });
  if (patch.webReview && patch.webReview !== prev.webReview) history.push({ at, kind: 'web', value: patch.webReview });
  next.history = history;
  state.tracking.set(item.id, next);
  emit('tracking', { bizId: item.id, fields: Object.keys(patch) });
  queueSave(item, patch, delay);
}

export function logCall(item, tel) {
  const prev = state.tracking.get(item.id) || blankRecord(item);
  const at = Date.now();
  state.tracking.set(item.id, {
    ...prev, cityId: item.cityId || prev.cityId, snapshot: snapshotOf(item), updatedAt: at,
    history: [...(prev.history || []), { at, kind: 'call', tel }],
  });
  emit('tracking', { bizId: item.id, fields: ['history'] });
  const run = (chains.get(item.id) || Promise.resolve())
    .then(() => api.logCall(item.id, { tel, cityId: item.cityId, snapshot: snapshotOf(item) }))
    .catch((err) => toast(`No se pudo registrar la llamada: ${err.message}`, { type: 'error' }));
  chains.set(item.id, run);
}

function queueSave(item, patch, delay) {
  const entry = pending.get(item.id) || { patch: {}, attempts: 0 };
  Object.assign(entry.patch, patch);
  entry.item = item;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => flushSave(item.id), delay);
  pending.set(item.id, entry);
  emit('saving', { bizId: item.id, state: 'pending' });
}

function flushSave(bizId, { keepalive = false } = {}) {
  const entry = pending.get(bizId);
  if (!entry) return;
  pending.delete(bizId);
  clearTimeout(entry.timer);
  const body = { ...entry.patch, cityId: entry.item.cityId, snapshot: snapshotOf(entry.item) };
  if (keepalive) {
    api.saveTracking(bizId, body, { keepalive: true }).catch(() => {});
    return;
  }
  emit('saving', { bizId, state: 'saving' });
  const run = (chains.get(bizId) || Promise.resolve())
    .then(() => api.saveTracking(bizId, body))
    .then(({ tracking }) => {
      // Si hubo cambios locales mientras se guardaba, se conservan.
      const waiting = pending.get(bizId)?.patch || {};
      const local = state.tracking.get(bizId) || {};
      const merged = { ...tracking, history: local.history?.length >= tracking.history.length ? local.history : tracking.history };
      for (const key of Object.keys(waiting)) merged[key] = local[key];
      state.tracking.set(bizId, merged);
      warnedOffline = false;
      if (!pending.has(bizId)) emit('saving', { bizId, state: 'saved' });
    })
    .catch((err) => {
      const retry = pending.get(bizId) || { patch: {}, attempts: entry.attempts, item: entry.item };
      retry.patch = { ...entry.patch, ...retry.patch };
      retry.attempts = entry.attempts + 1;
      if (err.status === 400) {
        toast(err.message, { type: 'error' });
        emit('saving', { bizId, state: 'error', error: err });
        return;
      }
      clearTimeout(retry.timer);
      retry.timer = setTimeout(() => flushSave(bizId), Math.min(30000, 1500 * 2 ** retry.attempts));
      pending.set(bizId, retry);
      emit('saving', { bizId, state: 'error', error: err });
      if (!warnedOffline) {
        warnedOffline = true;
        toast('No se pudo guardar. Lo reintentaré automáticamente; no cierres la app todavía.', { type: 'error' });
      }
    });
  chains.set(bizId, run);
}

export const hasPendingSaves = () => pending.size > 0;

export function flushAllSaves({ keepalive = false } = {}) {
  for (const bizId of [...pending.keys()]) flushSave(bizId, { keepalive });
}
