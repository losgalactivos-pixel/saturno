// Controles reutilizables para el estado de la llamada.
import { h } from '../utils.js';
import { icon } from '../icons.js';
import { state, statusOf, updateTracking } from '../store.js';

/** Selector nativo con estilo de etiqueta (accesible con teclado y en móvil). */
export function StatusSelect(item, { compact = false } = {}) {
  const current = statusOf(item.id);
  const select = h('select', {
    class: ['status-select', compact && 'is-compact'],
    dataset: { status: current },
    'aria-label': `Estado de la llamada a ${item.name || 'este negocio'}`,
    onChange: (e) => {
      select.dataset.status = e.target.value;
      updateTracking(item, { status: e.target.value });
    },
  }, state.config.statuses.map((s) => h('option', { value: s.id, selected: s.id === current }, s.label)));
  return h('span', { class: 'status-select-wrap' }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), select, icon('chevronDown', { size: 14 }));
}

/** Grupo de botones de estado (radio) para el panel de detalle. */
export function StatusGroup(item, { onChange } = {}) {
  const group = h('div', { class: 'status-group', role: 'radiogroup', 'aria-label': 'Estado de la llamada' });
  const render = () => {
    const current = statusOf(item.id);
    group.replaceChildren(
      ...state.config.statuses.map((s, index) => {
        const checked = s.id === current;
        return h('button', {
          type: 'button', role: 'radio', class: ['status-option', `is-${s.id}`], 'aria-checked': String(checked),
          tabindex: checked || (!state.config.statuses.some((x) => x.id === current) && index === 0) ? '0' : '-1',
          onClick: () => {
            if (statusOf(item.id) === s.id) return;
            updateTracking(item, { status: s.id });
            render();
            onChange?.(s.id);
          },
        }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), s.label);
      }),
    );
  };
  // Flechas para moverse entre opciones, como un radio nativo.
  group.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const buttons = [...group.querySelectorAll('[role="radio"]')];
    const index = buttons.indexOf(document.activeElement);
    const next = buttons[(index + keys[e.key] + buttons.length) % buttons.length];
    next.click();
    group.querySelector('[aria-checked="true"]')?.focus();
  });
  render();
  group.refresh = render;
  return group;
}

/** Grupo segmentado genérico (radio). options = [{ id, label, icon? }] */
export function Segmented({ label, options, value, onChange, className = '' }) {
  const group = h('div', { class: ['segmented', className], role: 'radiogroup', 'aria-label': label });
  let current = value;
  const render = () => {
    group.replaceChildren(
      ...options.map((o) =>
        h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(o.id === current), tabindex: o.id === current ? '0' : '-1',
          class: 'segmented-option',
          onClick: () => {
            if (o.id === current) return;
            current = o.id;
            render();
            group.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
            onChange(o.id);
          },
        }, o.icon ? icon(o.icon, { size: 15 }) : null, o.label),
      ),
    );
  };
  group.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const index = options.findIndex((o) => o.id === current);
    const next = options[(index + keys[e.key] + options.length) % options.length];
    group.querySelectorAll('[role="radio"]')[options.indexOf(next)].click();
  });
  render();
  group.setValue = (v) => {
    current = v;
    render();
  };
  return group;
}
