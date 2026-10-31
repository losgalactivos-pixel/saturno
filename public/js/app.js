// Arranque de Saturno: carga inicial, rutas y acciones globales.
import { api, detectMode } from './api.js';
import { h, downloadJson, todayIso } from './utils.js';
import { icon } from './icons.js';
import {
  addCity, cityById, emit, flushAllSaves, hasPendingSaves, prepareItems, removeCity, setCities, setCityDone,
  state, upsertCity,
} from './store.js';
import { Sidebar } from './components/Sidebar.js';
import { initDetail, isDetailOpen } from './components/DetailDialog.js';
import { EmptyState } from './components/States.js';
import { toast } from './components/Toast.js';
import { HomeView } from './views/HomeView.js';
import { CityView } from './views/CityView.js';
import { TrackingView } from './views/TrackingView.js';

const main = document.getElementById('main');
const sidebarEl = document.getElementById('sidebar');
const scrim = document.getElementById('scrim');
const menuBtn = document.getElementById('menu-btn');
let view = null;
let firstRoute = true;

// ------------------------------------------------------------------ ciudades
async function loadCity(cityId, { refresh = false } = {}) {
  const entry = state.cityData.get(cityId);
  if (entry?.status === 'loading') return;
  if (entry?.status === 'ready' && !refresh) return;
  state.cityData.set(cityId, { status: 'loading', data: entry?.data || null, startedAt: Date.now() });
  emit('cityData', cityId);
  try {
    const result = await api.businesses(cityId, { refresh });
    prepareItems(result.items, cityId);
    state.cityData.set(cityId, { status: 'ready', data: result });
    if (result.city) upsertCity(result.city);
    if (refresh && result.refreshSkipped) {
      toast(`Estos datos se consultaron hace menos de ${state.config.minRefreshMinutes} min; se mantienen para no saturar OpenStreetMap.`);
    } else if (refresh) {
      toast('Datos actualizados desde OpenStreetMap', { type: 'success' });
    }
  } catch (err) {
    state.cityData.set(cityId, { status: entry?.data ? 'ready' : 'error', data: entry?.data || null, error: err });
    if (entry?.data) toast(err.message, { type: 'error' });
  }
  emit('cityData', cityId);
}

async function pickCandidate(candidate) {
  try {
    const city = await addCity(candidate);
    location.hash = `#/ciudad/${city.id}`;
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

const SETTLEMENTS = new Set(['city', 'town', 'municipality', 'village']);

async function pickSuggestion(name) {
  try {
    const { results } = await api.geocode(`${name}, España`);
    const best = results.find((r) => r.osmType === 'relation' && SETTLEMENTS.has(r.kind)) || results[0];
    if (!best) {
      toast(`No se encontró ${name}.`, { type: 'error' });
      return;
    }
    await pickCandidate(best);
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

async function confirmRemove(cityId) {
  const city = cityById(cityId);
  if (!city) return;
  try {
    await removeCity(cityId);
    if (state.route.name === 'city' && state.route.cityId === cityId) location.hash = '#/';
    toast(`${city.name} se quitó de tu lista. Tus notas se conservan.`, {
      action: {
        label: 'Deshacer',
        onClick: async () => {
          try {
            const { city: restored } = await api.addCity(city);
            if (city.done) await api.setCityDone(city.id, true);
            upsertCity({ ...restored, done: city.done });
          } catch (err) {
            toast(err.message, { type: 'error' });
          }
        },
      },
    });
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

async function toggleDone(cityId, done) {
  await setCityDone(cityId, done);
  const city = cityById(cityId);
  if (done && city) toast(`${city.name} marcada como terminada`, { type: 'success' });
}

// ------------------------------------------------------- exportar/importar
async function exportData() {
  try {
    flushAllSaves();
    const data = await api.exportData();
    downloadJson(data, `saturno-seguimiento-${todayIso()}.json`);
    toast('Copia descargada', { type: 'success' });
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const { result } = await api.importData(data);
    const [{ cities }, { tracking }] = await Promise.all([api.cities(), api.tracking()]);
    state.tracking = new Map(tracking.map((t) => [t.bizId, t]));
    setCities(cities);
    emit('tracking', { bizId: null, fields: ['all'] });
    renderRoute();
    toast(`Importado: ${result.cities} ciudades nuevas y ${result.tracking} fichas con seguimiento.`, { type: 'success' });
  } catch (err) {
    toast(err instanceof SyntaxError ? 'El fichero no es un JSON válido.' : err.message, { type: 'error' });
  }
}

// --------------------------------------------------------------------- rutas
function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [section, id] = hash.split('/');
  if (section === 'ciudad' && /^[nwr]\d+$/.test(id || '')) return { name: 'city', cityId: id };
  if (section === 'seguimiento') return { name: 'tracking', cityId: null };
  return { name: 'home', cityId: null };
}

function renderRoute() {
  const route = parseRoute();
  state.route = route;
  view?.destroy();
  setSidebar(false);

  if (route.name === 'city') {
    if (!cityById(route.cityId)) {
      view = {
        el: EmptyState({
          iconName: 'pin', title: 'Esa ciudad no está en tu lista',
          text: 'Puede que la quitaras. Búscala de nuevo para añadirla.',
          actions: [h('a', { href: '#/', class: 'btn btn-primary' }, 'Ir al inicio')],
        }),
        destroy() {},
      };
    } else {
      view = CityView(route.cityId, {
        onRetry: (id) => loadCity(id),
        onRefresh: (id) => loadCity(id, { refresh: true }),
        onBack: () => {
          location.hash = '#/';
        },
        onToggleDone: toggleDone,
      });
      loadCity(route.cityId);
      try {
        localStorage.setItem('saturno:lastCity', route.cityId);
      } catch {
        /* sin almacenamiento */
      }
    }
  } else if (route.name === 'tracking') {
    view = TrackingView();
  } else {
    view = HomeView({ onPickCandidate: pickCandidate, onSuggestion: pickSuggestion });
  }

  main.replaceChildren(view.el);
  main.classList.remove('is-entering');
  void main.offsetWidth;
  main.classList.add('is-entering');
  window.scrollTo({ top: 0 });
  if (!firstRoute) view.focusTitle?.();
  firstRoute = false;
  document.title = route.name === 'city'
    ? `${cityById(route.cityId)?.name || 'Ciudad'} · Saturno`
    : route.name === 'tracking' ? 'Seguimiento · Saturno' : 'Saturno · Negocios sin web';
  emit('route', route);
}

// --------------------------------------------------------- menú en móvil
function setSidebar(open) {
  document.body.classList.toggle('sidebar-open', open);
  scrim.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) sidebarEl.querySelector('a, button, input')?.focus();
}

menuBtn.append(icon('menu', { size: 22 }));
document.getElementById('topbar-tracking').append(icon('note', { size: 22 }));
menuBtn.addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-open')));
scrim.addEventListener('click', () => setSidebar(false));

// ------------------------------------------------------------------ teclado
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (e.key === '/' && !typing && !isDetailOpen() && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    view?.focusSearch?.();
  }
  if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
    setSidebar(false);
    menuBtn.focus();
  }
});

// Guardar cambios pendientes antes de cerrar.
window.addEventListener('pagehide', () => flushAllSaves({ keepalive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAllSaves();
});
window.addEventListener('beforeunload', (e) => {
  if (hasPendingSaves()) {
    flushAllSaves({ keepalive: true });
    e.preventDefault();
  }
});

// --------------------------------------------------------------- arranque
async function boot() {
  try {
    state.mode = await detectMode();
    const [config, { cities }, { tracking }] = await Promise.all([api.config(), api.cities(), api.tracking()]);
    state.config = config;
    state.cities = cities;
    state.tracking = new Map(tracking.map((t) => [t.bizId, t]));
    // Sin servidor, las notas viven en el navegador: pedimos que no las borre.
    if (state.mode === 'standalone') navigator.storage?.persist?.().catch(() => {});
  } catch (err) {
    main.replaceChildren(EmptyState({
      iconName: 'alert', tone: 'error', title: 'No se pudo iniciar Saturno',
      text: state.mode === 'standalone'
        ? `${err.message} Comprueba que el navegador permite guardar datos de sitios (no uses el modo privado) y recarga.`
        : `${err.message} Arranca el servidor con «python server.py» y recarga la página.`,
      actions: [h('button', { type: 'button', class: 'btn btn-primary', onClick: () => location.reload() }, 'Reintentar')],
    }));
    return;
  }

  sidebarEl.replaceChildren(Sidebar({
    onPickCandidate: pickCandidate,
    onSuggestion: pickSuggestion,
    onRemove: confirmRemove,
    onExport: exportData,
    onImport: importData,
  }));
  initDetail({ onClosed: () => view?.detailClosed?.() });

  if (!location.hash) {
    let last = null;
    try {
      last = localStorage.getItem('saturno:lastCity');
    } catch {
      /* sin almacenamiento */
    }
    if (last && cityById(last)) history.replaceState(null, '', `#/ciudad/${last}`);
  }
  window.addEventListener('hashchange', renderRoute);
  renderRoute();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
