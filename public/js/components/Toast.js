import { h } from '../utils.js';
import { icon } from '../icons.js';

const ICONS = { info: 'info', success: 'checkCircle', error: 'alert' };

/**
 * Muestra un aviso breve. `action` = { label, onClick } añade un botón
 * (por ejemplo «Deshacer»). Devuelve una función para cerrarlo.
 */
export function toast(message, { type = 'info', action, duration = 4200 } = {}) {
  const container = document.getElementById('toasts');
  if (!container) return () => {};
  let timer;
  const close = () => {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  const el = h(
    'div',
    { class: ['toast', `toast-${type}`], role: type === 'error' ? 'alert' : null },
    icon(ICONS[type] || 'info', { size: 18 }),
    h('span', { class: 'toast-text' }, message),
    action &&
      h('button', {
        type: 'button',
        class: 'toast-action',
        onClick: () => {
          action.onClick();
          close();
        },
      }, action.label),
    h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Cerrar aviso', onClick: close }, icon('x', { size: 16 })),
  );
  container.append(el);
  while (container.children.length > 4) container.firstElementChild.remove();
  timer = setTimeout(close, action ? Math.max(duration, 7000) : duration);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => {
    timer = setTimeout(close, 2500);
  });
  return close;
}
