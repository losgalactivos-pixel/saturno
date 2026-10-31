// Filtrado, recuento y orden de los negocios. Todo en el navegador, al instante.
import { fold } from './utils.js';
import { state } from './store.js';

export const DEFAULT_FILTERS = Object.freeze({
  q: '',
  scope: 'name', // 'name' | 'notes'
  categories: [],
  status: 'all',
  notes: 'all', // 'all' | 'with' | 'without'
  web: 'active', // 'active' | 'all' | 'sin_verificar' | 'sin_web' | 'tiene_web'
  social: 'all', // 'all' | 'with' | 'without'
  hideChains: true,
  sort: 'name', // 'name' | 'type' | 'recent' | 'callback'
  city: 'all',
});

export const SORTS = [
  { id: 'name', label: 'Nombre (A–Z)' },
  { id: 'type', label: 'Tipo de negocio' },
  { id: 'recent', label: 'Actividad reciente' },
  { id: 'callback', label: 'Próxima rellamada' },
];

/** Número de filtros del panel «Más filtros» distintos del valor por defecto de la vista. */
export function advancedCount(f, base = DEFAULT_FILTERS) {
  return ['notes', 'web', 'social', 'hideChains'].filter((k) => f[k] !== base[k]).length;
}

export function isFiltered(f, base = DEFAULT_FILTERS) {
  return Boolean(f.q.trim() || f.categories.length || f.status !== 'all' || f.city !== 'all' || advancedCount(f, base));
}

/**
 * Aplica los filtros en una sola pasada y calcula los recuentos de las
 * pestañas de estado y de las categorías (cada uno ignorando su propio filtro).
 */
export function applyFilters(items, f) {
  const q = fold(f.q).trim();
  const words = q.split(/\s+/).filter(Boolean);
  const cats = new Set(f.categories);
  const statusCounts = { all: 0 };
  const categoryCounts = {};
  const list = [];

  for (const item of items) {
    const rec = state.tracking.get(item.id);
    const status = rec?.status || 'pendiente';
    const notes = rec?.notes || '';
    const review = rec?.webReview || 'sin_verificar';

    if (f.notes === 'with' && !notes.trim()) continue;
    if (f.notes === 'without' && notes.trim()) continue;
    if (f.web === 'active' && review === 'tiene_web') continue;
    if (f.web !== 'active' && f.web !== 'all' && review !== f.web) continue;
    if (f.social === 'with' && !item.social?.length) continue;
    if (f.social === 'without' && item.social?.length) continue;
    if (f.hideChains && item.chain) continue;
    if (f.city !== 'all' && item.cityId !== f.city) continue;
    if (words.length) {
      if (f.scope === 'notes') {
        if (!fold(notes).includes(q)) continue;
      } else if (!words.every((w) => item._search.includes(w))) continue;
    }

    const passStatus = f.status === 'all' || status === f.status;
    const passCategory = !cats.size || cats.has(item.category);
    if (passCategory) {
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      statusCounts.all += 1;
    }
    if (passStatus) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    if (passStatus && passCategory) list.push(item);
  }

  return { list: sortItems(list, f.sort), statusCounts, categoryCounts };
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byName = (a, b) => (a.name ? (b.name ? collator.compare(a.name, b.name) : -1) : b.name ? 1 : 0);

export function sortItems(list, sort) {
  const copy = [...list];
  if (sort === 'type') copy.sort((a, b) => collator.compare(a.type, b.type) || byName(a, b));
  else if (sort === 'recent') {
    const ts = (i) => state.tracking.get(i.id)?.updatedAt || 0;
    copy.sort((a, b) => ts(b) - ts(a) || byName(a, b));
  } else if (sort === 'callback') {
    const cb = (i) => state.tracking.get(i.id)?.callbackAt || '9999';
    copy.sort((a, b) => cb(a).localeCompare(cb(b)) || byName(a, b));
  } else copy.sort(byName);
  return copy;
}

/** Resumen para la cabecera: contactados, interesados, con nota... */
export function summarize(items) {
  const out = { total: items.length, contacted: 0, interesado: 0, volver_a_llamar: 0, withNotes: 0, verified: 0 };
  for (const item of items) {
    const rec = state.tracking.get(item.id);
    if (!rec) continue;
    if (rec.status !== 'pendiente') out.contacted += 1;
    if (rec.status === 'interesado') out.interesado += 1;
    if (rec.status === 'volver_a_llamar') out.volver_a_llamar += 1;
    if (rec.notes?.trim()) out.withNotes += 1;
    if (rec.webReview === 'sin_web') out.verified += 1;
  }
  return out;
}
