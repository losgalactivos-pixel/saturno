// Barra de búsqueda y filtros, reutilizada en la vista de ciudad y en Seguimiento.
import { h, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { DEFAULT_FILTERS, SORTS, advancedCount } from '../filters.js';
import { Segmented } from './StatusControls.js';

/**
 * @param filters   estado inicial de los filtros
 * @param onChange  recibe un parche ({ q }, { status }...) cada vez que cambia algo
 * @param cities    si se pasa, muestra un selector de ciudad (vista Seguimiento)
 * @param defaults  valores por defecto de la vista (para «Restablecer» y el contador)
 */
export function FilterBar({ filters, onChange, cities = null, defaults = DEFAULT_FILTERS }) {
  let f = { ...filters };
  const emitChange = (patch) => {
    f = { ...f, ...patch };
    onChange(patch);
  };

  // ------------------------------------------------------------- búsqueda
  const placeholders = {
    name: 'Nombre, tipo o calle…',
    notes: 'En tus notas: «no contestaron»…',
  };
  const input = h('input', {
    type: 'search', class: 'search-input', id: 'search-input', value: f.q, autocomplete: 'off', spellcheck: 'false',
    placeholder: placeholders[f.scope], 'aria-label': f.scope === 'notes' ? 'Buscar en notas' : 'Buscar negocios por nombre',
  });
  const pushQuery = debounce(() => emitChange({ q: input.value }), 140);
  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    pushQuery();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.stopPropagation();
      input.value = '';
      clearBtn.hidden = true;
      pushQuery.flush();
    }
  });
  const clearBtn = h('button', {
    type: 'button', class: 'search-clear', 'aria-label': 'Borrar búsqueda', hidden: !f.q,
    onClick: () => {
      input.value = '';
      clearBtn.hidden = true;
      pushQuery.flush();
      input.focus();
    },
  }, icon('x', { size: 16 }));
  const scope = Segmented({
    label: 'Buscar en',
    className: 'search-scope',
    options: [{ id: 'name', label: 'Nombre' }, { id: 'notes', label: 'Notas', icon: 'note' }],
    value: f.scope,
    onChange: (value) => {
      input.placeholder = placeholders[value];
      input.setAttribute('aria-label', value === 'notes' ? 'Buscar en notas' : 'Buscar negocios por nombre');
      emitChange({ scope: value });
      input.focus();
    },
  });
  const search = h('div', { class: 'search' }, icon('search', { size: 18, className: 'search-icon' }), input, clearBtn, scope);

  // ------------------------------------------------- panel «Más filtros»
  const badge = h('span', { class: 'badge', hidden: true });
  const panelId = `filters-${Math.random().toString(36).slice(2, 8)}`;
  const toggle = h('button', {
    type: 'button', class: 'btn btn-secondary btn-filters', 'aria-expanded': 'false', 'aria-controls': panelId,
  }, icon('sliders', { size: 17 }), h('span', {}, 'Filtros'), badge);

  const controls = {};
  const panel = h('div', { class: 'filter-panel', id: panelId, hidden: true, role: 'group', 'aria-label': 'Más filtros' },
    h('div', { class: 'filter-field' }, h('span', { class: 'filter-label' }, 'Notas'),
      controls.notes = Segmented({
        label: 'Notas', value: f.notes, onChange: (v) => emitChange({ notes: v }),
        options: [{ id: 'all', label: 'Todas' }, { id: 'with', label: 'Con nota' }, { id: 'without', label: 'Sin nota' }],
      })),
    h('div', { class: 'filter-field' }, h('span', { class: 'filter-label' }, 'Revisión de web'),
      controls.web = Segmented({
        label: 'Revisión de web', value: f.web, onChange: (v) => emitChange({ web: v }),
        options: [
          { id: 'active', label: 'Activos' }, { id: 'sin_verificar', label: 'Sin verificar' },
          { id: 'sin_web', label: 'Sin web confirmada' }, { id: 'tiene_web', label: 'Tienen web' },
        ],
      }),
      h('p', { class: 'filter-help' }, '«Activos» oculta los que marcaste como «Tiene web».')),
    h('div', { class: 'filter-field' }, h('span', { class: 'filter-label' }, 'Redes sociales'),
      controls.social = Segmented({
        label: 'Redes sociales', value: f.social, onChange: (v) => emitChange({ social: v }),
        options: [{ id: 'all', label: 'Indiferente' }, { id: 'with', label: 'Con redes' }, { id: 'without', label: 'Sin redes' }],
      })),
    h('label', { class: 'check' },
      controls.chains = h('input', { type: 'checkbox', checked: f.hideChains, onChange: (e) => emitChange({ hideChains: e.target.checked }) }),
      h('span', {}, 'Ocultar cadenas y franquicias', h('small', {}, 'Suelen tener web corporativa.'))),
    h('div', { class: 'filter-foot' },
      h('button', {
        type: 'button', class: 'btn btn-ghost btn-sm',
        onClick: () => {
          const reset = { notes: defaults.notes, web: defaults.web, social: defaults.social, hideChains: defaults.hideChains };
          controls.notes.setValue(reset.notes);
          controls.web.setValue(reset.web);
          controls.social.setValue(reset.social);
          controls.chains.checked = reset.hideChains;
          emitChange(reset);
        },
      }, 'Restablecer'),
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => setPanel(false, true) }, 'Listo'),
    ),
  );

  const setPanel = (open, returnFocus = false) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      // Se abre hacia la derecha si alineado a la derecha se saldría del contenido.
      panel.classList.remove('align-left');
      const mainLeft = document.getElementById('main')?.getBoundingClientRect().left || 0;
      if (panel.getBoundingClientRect().left < mainLeft + 8) panel.classList.add('align-left');
      panel.querySelector('[aria-checked="true"]')?.focus();
    }
    else if (returnFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => setPanel(panel.hidden));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setPanel(false, true);
    }
  });
  const outside = (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) setPanel(false);
  };
  document.addEventListener('pointerdown', outside);

  controls.sort = h('select', { class: 'select', 'aria-label': 'Ordenar por', onChange: (e) => emitChange({ sort: e.target.value }) },
    SORTS.map((s) => h('option', { value: s.id, selected: s.id === f.sort }, s.label)));
  const sort = h('label', { class: 'sort' }, icon('list', { size: 16 }), controls.sort, icon('chevronDown', { size: 14 }));

  if (cities) {
    controls.city = h('select', { class: 'select', 'aria-label': 'Filtrar por ciudad', onChange: (e) => emitChange({ city: e.target.value }) },
      h('option', { value: 'all' }, 'Todas las ciudades'),
      cities.map((c) => h('option', { value: c.id, selected: c.id === f.city }, c.name)));
  }
  const citySelect = cities ? h('label', { class: 'sort' }, icon('pin', { size: 16 }), controls.city, icon('chevronDown', { size: 14 })) : null;

  const toolbar = h('div', { class: 'toolbar' }, search, h('div', { class: 'toolbar-side' }, citySelect, sort, h('div', { class: 'filters-anchor' }, toggle, panel)));

  // ------------------------------------------------------ categorías
  const categories = h('div', { class: 'chips', role: 'group', 'aria-label': 'Tipo de negocio' });
  const renderCategories = (counts) => {
    const selected = new Set(f.categories);
    const visible = state.config.categories.filter((c) => counts[c.id] || selected.has(c.id));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    categories.replaceChildren(
      h('button', {
        type: 'button', class: 'chip chip-cat', 'aria-pressed': String(!selected.size),
        onClick: () => emitChange({ categories: [] }),
      }, 'Todos', h('span', { class: 'chip-count' }, total.toLocaleString('es'))),
      ...visible.map((c) => h('button', {
        type: 'button', class: 'chip chip-cat', 'aria-pressed': String(selected.has(c.id)),
        onClick: () => {
          const next = new Set(f.categories);
          if (next.has(c.id)) next.delete(c.id);
          else next.add(c.id);
          emitChange({ categories: [...next] });
        },
      }, icon(c.icon, { size: 15 }), c.label, h('span', { class: 'chip-count' }, (counts[c.id] || 0).toLocaleString('es')))),
    );
  };

  // -------------------------------------------------- pestañas de estado
  const statusTabs = h('div', { class: 'status-tabs', role: 'radiogroup', 'aria-label': 'Filtrar por estado de llamada' });
  const renderStatus = (counts) => {
    const options = [{ id: 'all', label: 'Todos' }, ...state.config.statuses];
    statusTabs.replaceChildren(...options.map((s) => {
      const checked = f.status === s.id;
      return h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(checked), tabindex: checked ? '0' : '-1',
        class: ['status-tab', `is-${s.id}`],
        onClick: () => {
          emitChange({ status: s.id });
          renderStatus(counts);
          statusTabs.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
        },
      }, s.id !== 'all' && h('span', { class: 'status-dot', 'aria-hidden': 'true' }), s.label, h('span', { class: 'tab-count' }, (counts[s.id] || 0).toLocaleString('es')));
    }));
  };
  statusTabs.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const buttons = [...statusTabs.children];
    const index = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    buttons[(index + keys[e.key] + buttons.length) % buttons.length].click();
  });

  const el = h('div', { class: 'filterbar' }, toolbar, categories, statusTabs);
  el.cleanup = () => document.removeEventListener('pointerdown', outside);

  return {
    el,
    update({ statusCounts, categoryCounts, filters: next }) {
      if (next) f = { ...f, ...next };
      const n = advancedCount(f, defaults);
      badge.hidden = !n;
      badge.textContent = String(n);
      renderCategories(categoryCounts);
      renderStatus(statusCounts);
    },
    /** Sincroniza todos los controles con unos filtros dados (p. ej. al quitar filtros). */
    sync(next) {
      f = { ...f, ...next };
      input.value = f.q;
      clearBtn.hidden = !f.q;
      scope.setValue(f.scope);
      input.placeholder = placeholders[f.scope];
      controls.notes.setValue(f.notes);
      controls.web.setValue(f.web);
      controls.social.setValue(f.social);
      controls.chains.checked = f.hideChains;
      controls.sort.value = f.sort;
      if (controls.city) controls.city.value = f.city;
    },
    focusSearch() {
      input.focus();
      input.select();
    },
  };
}
