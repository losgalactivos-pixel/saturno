// Estados de interfaz reutilizables: vacío, error y carga.
import { h } from '../utils.js';
import { icon } from '../icons.js';

export function EmptyState({ iconName = 'inbox', title, text, actions = [], tone = 'neutral' }) {
  return h('div', { class: ['state', `state-${tone}`] },
    h('div', { class: 'state-icon' }, icon(iconName, { size: 26 })),
    h('h2', { class: 'state-title' }, title),
    text && h('p', { class: 'state-text' }, text),
    actions.length ? h('div', { class: 'state-actions' }, actions) : null,
  );
}

const ERROR_TITLES = {
  timeout: 'La consulta tardó demasiado',
  rate_limited: 'OpenStreetMap pide esperar un poco',
  busy: 'Los servidores de OpenStreetMap están ocupados',
  offline: 'Sin conexión con OpenStreetMap',
  network: 'No hay conexión con Saturno',
};

export function ErrorState({ error, onRetry, onBack }) {
  return EmptyState({
    iconName: 'alert',
    tone: 'error',
    title: ERROR_TITLES[error?.code] || 'No se pudieron cargar los negocios',
    text: error?.message || 'Ha ocurrido un error inesperado.',
    actions: [
      onRetry && h('button', { type: 'button', class: 'btn btn-primary', onClick: onRetry }, icon('refresh', { size: 16 }), 'Reintentar'),
      onBack && h('button', { type: 'button', class: 'btn btn-secondary', onClick: onBack }, 'Elegir otra ciudad'),
    ].filter(Boolean),
  });
}

/** Esqueleto de fichas + mensaje con segundos transcurridos. Devuelve { el, stop }. */
export function LoadingState({ title, text, startedAt = Date.now(), onCancel }) {
  const seconds = h('span', { class: 'loading-seconds' }, '0 s');
  const tick = () => {
    seconds.textContent = `${Math.max(0, Math.round((Date.now() - startedAt) / 1000))} s`;
  };
  tick();
  const timer = setInterval(tick, 1000);
  const skeleton = h('ul', { class: 'grid', 'aria-hidden': 'true' },
    Array.from({ length: 6 }, (_, i) => h('li', { class: 'card-wrap' },
      h('div', { class: 'card skeleton', style: { animationDelay: `${i * 80}ms` } },
        h('span', { class: 'sk sk-sm' }), h('span', { class: 'sk sk-lg' }), h('span', { class: 'sk' }), h('span', { class: 'sk sk-md' }),
        h('span', { class: 'sk sk-btn' })))));
  const el = h('div', { class: 'loading', role: 'status' },
    h('div', { class: 'loading-banner' },
      h('span', { class: 'spinner', 'aria-hidden': 'true' }),
      h('div', {},
        h('p', { class: 'loading-title' }, title, ' ', seconds),
        text && h('p', { class: 'loading-text' }, text)),
      onCancel && h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: onCancel }, 'Cancelar')),
    skeleton);
  return { el, stop: () => clearInterval(timer) };
}
