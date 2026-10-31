// Vista de una ciudad: cabecera, progreso, aviso del criterio y resultados.
import { h, dateTime, plural, relativeTime, storage } from '../utils.js';
import { icon } from '../icons.js';
import { cityById, on, state } from '../store.js';
import { summarize } from '../filters.js';
import { ResultsPanel } from '../components/ResultsPanel.js';
import { EmptyState, ErrorState, LoadingState } from '../components/States.js';

function stat(label, value, status) {
  return h('div', { class: ['stat', status && `is-${status}`] },
    h('span', { class: 'stat-value' }, value.toLocaleString('es')),
    h('span', { class: 'stat-label' }, status && h('span', { class: 'status-dot', 'aria-hidden': 'true' }), label));
}

/** Barra de progreso y recuentos. `getItems` se vuelve a leer en cada render. */
export function Summary(getItems) {
  const el = h('div', { class: 'summary' });
  const render = () => {
    const s = summarize(getItems());
    const pct = s.total ? Math.round((s.contacted / s.total) * 100) : 0;
    el.replaceChildren(
      h('div', { class: 'progress-card' },
        h('div', { class: 'progress-text' }, h('strong', {}, `${s.contacted.toLocaleString('es')} de ${s.total.toLocaleString('es')}`), ' contactados', h('span', { class: 'muted' }, ` · ${pct} %`)),
        h('div', {
          class: 'progress', role: 'progressbar', 'aria-label': 'Negocios contactados',
          'aria-valuemin': '0', 'aria-valuemax': String(s.total), 'aria-valuenow': String(s.contacted),
        }, h('span', { style: { width: `${pct}%` } }))),
      stat('Interesados', s.interesado, 'interesado'),
      stat('Volver a llamar', s.volver_a_llamar, 'volver_a_llamar'),
      stat('Con nota', s.withNotes),
      stat('Sin web confirmada', s.verified),
    );
  };
  render();
  el.render = render;
  return el;
}

function WebNotice(stats) {
  if (storage.get('notice:web-criteria', false)) return null;
  const el = h('aside', { class: 'notice', role: 'note' },
    icon('info', { size: 18 }),
    h('div', {},
      h('p', {}, h('strong', {}, 'Qué significa «sin web». '),
        'Se muestran negocios con teléfono para los que OpenStreetMap no tiene una web propia (las redes sociales y los directorios no cuentan como web). ',
        'Que OSM no la tenga no demuestra que no exista: revisa cada ficha con «Buscar en la web» y márcala como confirmada.'),
      stats && h('p', { class: 'muted small' },
        `En esta zona OSM tiene ${plural(stats.withPhone, 'negocio', 'negocios')} con teléfono; ${stats.ownWebsite.toLocaleString('es')} tienen web propia y no aparecen aquí.`)),
    h('button', {
      type: 'button', class: 'btn btn-ghost btn-sm',
      onClick: () => {
        storage.set('notice:web-criteria', true);
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 180);
      },
    }, 'Entendido'));
  return el;
}

/**
 * @param actions { onRetry, onBack, onRefresh, onToggleDone }
 */
export function CityView(cityId, actions) {
  const head = h('header', { class: 'view-head' });
  const body = h('div', { class: 'view-body' });
  const el = h('div', { class: 'view view-city' }, head, body);
  let panel = null;
  let summary = null;
  let loading = null;
  let renderedData = null;

  function renderHead() {
    const city = cityById(cityId);
    const entry = state.cityData.get(cityId);
    const data = entry?.data;
    const busy = entry?.status === 'loading';
    head.replaceChildren(
      h('div', { class: 'view-title' },
        h('p', { class: 'eyebrow' }, icon('pin', { size: 14 }), city?.region || 'Ciudad'),
        h('h1', { tabindex: '-1', class: 'view-h1' }, city?.name || 'Ciudad'),
        data
          ? h('p', { class: 'view-meta' },
              `${plural(data.items.length, 'negocio', 'negocios')} con teléfono y sin web en OSM · `,
              h('span', { title: `Consultado el ${dateTime(data.fetchedAt)}` }, `datos ${relativeTime(data.fetchedAt)}`))
          : null),
      h('div', { class: 'view-actions' },
        data && h('button', {
          type: 'button', class: ['btn', 'btn-ghost', 'btn-sm', busy && 'is-busy'], disabled: busy,
          title: 'Volver a consultar OpenStreetMap', onClick: () => actions.onRefresh(cityId),
        }, icon('refresh', { size: 16, className: busy ? 'spin' : '' }), busy ? 'Actualizando…' : 'Actualizar datos'),
        city && h('button', {
          type: 'button', class: ['btn', city.done ? 'btn-done' : 'btn-secondary'], 'aria-pressed': String(city.done),
          title: city.done ? 'Volver a marcarla como pendiente' : 'Marca la ciudad cuando hayas terminado sus llamadas',
          onClick: () => actions.onToggleDone(cityId, !city.done),
        }, icon(city.done ? 'checkCircle' : 'flag', { size: 17 }), city.done ? 'Llamadas terminadas' : 'Marcar como terminada')),
    );
  }

  function clearBody() {
    loading?.stop();
    loading = null;
    panel?.destroy();
    panel = null;
    summary = null;
  }

  function renderBody() {
    const entry = state.cityData.get(cityId);
    const data = entry?.data;
    if (data && data === renderedData) return;
    clearBody();
    renderedData = data || null;

    if (!data) {
      if (entry?.status === 'error') {
        body.replaceChildren(ErrorState({ error: entry.error, onRetry: () => actions.onRetry(cityId), onBack: actions.onBack }));
        return;
      }
      loading = LoadingState({
        title: 'Consultando OpenStreetMap…',
        text: 'La primera vez que abres una ciudad puede tardar hasta un minuto (más en ciudades grandes). Después se guarda 24 h y abre al instante.',
        startedAt: entry?.startedAt,
        onCancel: actions.onBack,
      });
      body.replaceChildren(loading.el);
      return;
    }

    if (!data.items.length) {
      body.replaceChildren(EmptyState({
        iconName: 'globeOff',
        title: 'No hay negocios sin web con teléfono en esta zona',
        text: data.stats.withPhone
          ? `OpenStreetMap tiene ${plural(data.stats.withPhone, 'negocio', 'negocios')} con teléfono aquí, pero todos tienen web propia.`
          : 'OpenStreetMap no tiene negocios con teléfono registrados en esta zona. Prueba con una ciudad más grande o cercana.',
        actions: [h('button', { type: 'button', class: 'btn btn-secondary', onClick: actions.onBack }, 'Elegir otra ciudad')],
      }));
      return;
    }

    const getItems = () => state.cityData.get(cityId)?.data?.items || [];
    summary = Summary(getItems);
    panel = ResultsPanel({ viewKey: 'city', getItems });
    body.replaceChildren(summary, WebNotice(data.stats) || '', panel.el);
  }

  renderHead();
  renderBody();

  let frame = 0;
  const offs = [
    on('cityData', (id) => {
      if (id !== cityId) return;
      renderHead();
      renderBody();
    }),
    on('cities', renderHead),
    on('tracking', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => summary?.render());
    }),
  ];

  return {
    el,
    focusTitle: () => head.querySelector('h1')?.focus(),
    focusSearch: () => panel?.focusSearch(),
    detailClosed: () => panel?.detailClosed(),
    destroy() {
      offs.forEach((off) => off());
      clearBody();
    },
  };
}
