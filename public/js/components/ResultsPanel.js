// Filtros + lista + estados vacíos. Lo usan la vista de ciudad y Seguimiento.
import { h, storage } from '../utils.js';
import { icon } from '../icons.js';
import { on } from '../store.js';
import { DEFAULT_FILTERS, applyFilters, isFiltered } from '../filters.js';
import { FilterBar } from './FilterBar.js';
import { BusinessList } from './BusinessList.js';
import { EmptyState } from './States.js';
import { isDetailOpen, openDetail, startCall } from './DetailDialog.js';

/**
 * @param viewKey      clave para recordar los filtros ('city' | 'tracking')
 * @param getItems()   devuelve los negocios a filtrar
 * @param defaults     filtros por defecto propios de la vista
 * @param showCity     muestra la ciudad en cada ficha
 * @param cities       ciudades para el selector (opcional)
 * @param onResults(list) se llama tras cada filtrado
 */
export function ResultsPanel({ viewKey, getItems, defaults = {}, showCity = false, cities = null, onResults }) {
  const base = { ...DEFAULT_FILTERS, ...defaults };
  const saved = storage.get(`filters:${viewKey}`, {});
  let filters = { ...base, ...saved, q: '' };
  if (cities && filters.city !== 'all' && !cities.some((c) => c.id === filters.city)) filters.city = 'all';

  const empty = h('div', { class: 'results-empty', hidden: true });
  const hiddenNote = h('p', { class: 'hidden-note', hidden: true });
  const list = BusinessList({ onOpen: (item) => openDetail(item), onCall: startCall });
  const bar = FilterBar({ filters, cities, defaults: base, onChange: (patch) => setFilters(patch) });
  const el = h('section', { class: 'results', 'aria-label': 'Resultados' }, bar.el, hiddenNote, empty, list.el);

  function renderHiddenNote(items) {
    const chains = filters.hideChains ? items.filter((i) => i.chain).length : 0;
    hiddenNote.hidden = !chains;
    if (!chains) return;
    hiddenNote.replaceChildren(
      icon('info', { size: 15 }),
      h('span', {},
        `${chains.toLocaleString('es')} ${chains === 1 ? 'cadena o franquicia oculta' : 'cadenas y franquicias ocultas'} (suelen tener web corporativa). `,
        h('button', { type: 'button', class: 'link-btn', onClick: () => setFilters({ hideChains: false }, { syncBar: true }) }, 'Mostrarlas')),
    );
  }

  function persist() {
    const { q, ...rest } = filters;
    storage.set(`filters:${viewKey}`, rest);
  }

  function setFilters(patch, { syncBar = false } = {}) {
    filters = { ...filters, ...patch };
    persist();
    if (syncBar) bar.sync(filters);
    refresh();
  }

  function renderEmpty() {
    const actions = [];
    if (filters.q && filters.scope === 'name') {
      actions.push(h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => setFilters({ scope: 'notes' }, { syncBar: true }) },
        icon('note', { size: 16 }), `Buscar «${filters.q}» en notas`));
    }
    actions.push(h('button', {
      type: 'button', class: 'btn btn-primary',
      onClick: () => {
        const { scope, sort, ...rest } = base;
        setFilters({ ...rest, q: '' }, { syncBar: true });
      },
    }, 'Quitar filtros'));
    empty.replaceChildren(EmptyState({
      iconName: 'search',
      title: 'Ningún negocio coincide',
      text: filters.scope === 'notes' && filters.q
        ? `Ninguna nota contiene «${filters.q}» con los filtros actuales.`
        : 'Prueba con otra búsqueda o quita algún filtro.',
      actions,
    }));
  }

  function refresh({ keep = false } = {}) {
    const items = getItems();
    const { list: result, statusCounts, categoryCounts } = applyFilters(items, filters);
    bar.update({ statusCounts, categoryCounts, filters });
    renderHiddenNote(items);
    empty.hidden = result.length > 0;
    if (!result.length) renderEmpty();
    list.setItems(result, { query: filters.q, scope: filters.scope, showCity }, { keep });
    onResults?.(result, { filtered: isFiltered(filters, base) });
  }

  // Cambios de seguimiento: la ficha se repinta al momento, pero la lista no
  // se reordena mientras el panel de detalle esté abierto (evita saltos).
  let dirty = false;
  let frame = 0;
  const offTracking = on('tracking', ({ bizId }) => {
    list.refreshCard(bizId);
    if (isDetailOpen()) {
      dirty = true;
      return;
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => refresh({ keep: true }));
  });

  refresh();

  return {
    el,
    refresh,
    detailClosed() {
      if (dirty) {
        dirty = false;
        refresh({ keep: true });
      }
    },
    focusSearch: () => bar.focusSearch(),
    destroy() {
      offTracking();
      list.destroy();
      bar.el.cleanup();
    },
  };
}
