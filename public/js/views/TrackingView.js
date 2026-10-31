// Seguimiento: todos los negocios con notas o estado, de todas las ciudades.
import { h, plural } from '../utils.js';
import { icon } from '../icons.js';
import { on, state, trackedItems } from '../store.js';
import { ResultsPanel } from '../components/ResultsPanel.js';
import { EmptyState } from '../components/States.js';
import { Summary } from './CityView.js';

export function TrackingView() {
  const meta = h('p', { class: 'view-meta' });
  const head = h('header', { class: 'view-head' },
    h('div', { class: 'view-title' },
      h('p', { class: 'eyebrow' }, icon('note', { size: 14 }), 'Todas tus ciudades'),
      h('h1', { tabindex: '-1', class: 'view-h1' }, 'Seguimiento'),
      meta));
  const body = h('div', { class: 'view-body' });
  const el = h('div', { class: 'view view-tracking' }, head, body);
  let panel = null;
  let summary = null;
  let hadItems = null;

  function renderBody() {
    const items = trackedItems();
    const cityIds = new Set(items.map((i) => i.cityId));
    meta.textContent = items.length
      ? `${plural(items.length, 'negocio', 'negocios')} con llamadas, notas o estado en ${plural(cityIds.size, 'ciudad', 'ciudades')}. Busca en todas tus notas a la vez.`
      : 'Aquí se reúnen los negocios que ya has trabajado.';
    if (hadItems === Boolean(items.length) && panel) return;
    hadItems = Boolean(items.length);
    panel?.destroy();
    panel = null;
    summary = null;

    if (!items.length) {
      body.replaceChildren(EmptyState({
        iconName: 'note',
        title: 'Todavía no hay seguimiento',
        text: 'Cuando llames a un negocio, cambies su estado o escribas una nota, aparecerá aquí. Desde esta vista puedes buscar en todas tus notas a la vez.',
        actions: [h('a', { href: '#/', class: 'btn btn-primary' }, 'Elegir una ciudad')],
      }));
      return;
    }
    const cities = state.cities.filter((c) => cityIds.has(c.id));
    summary = Summary(trackedItems);
    panel = ResultsPanel({
      viewKey: 'tracking',
      getItems: trackedItems,
      defaults: { hideChains: false, sort: 'recent', web: 'all' },
      showCity: true,
      cities,
    });
    body.replaceChildren(summary, panel.el);
  }

  renderBody();
  let frame = 0;
  const off = on('tracking', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      renderBody();
      summary?.render();
    });
  });

  return {
    el,
    focusTitle: () => head.querySelector('h1')?.focus(),
    focusSearch: () => panel?.focusSearch(),
    detailClosed: () => panel?.detailClosed(),
    destroy() {
      off();
      panel?.destroy();
    },
  };
}
