// Lista de fichas con carga progresiva: pinta por bloques al hacer scroll.
import { h, plural, prefersReducedMotion } from '../utils.js';
import { BusinessCard } from './BusinessCard.js';

const PAGE = 30;

export function BusinessList({ onOpen, onCall }) {
  const grid = h('ul', { class: 'grid', 'aria-label': 'Negocios' });
  const status = h('p', { class: 'list-status', 'aria-live': 'polite' });
  const moreBtn = h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => renderMore(true) }, 'Mostrar más');
  const footer = h('div', { class: 'list-footer' }, status, moreBtn);
  const sentinel = h('div', { class: 'sentinel', 'aria-hidden': 'true' });
  const el = h('div', { class: 'list' }, grid, sentinel, footer);

  let items = [];
  let shown = 0;
  let ctx = { query: '', scope: 'name', showCity: false };

  const cardCtx = () => ({ ...ctx, onOpen, onCall });

  const updateFooter = () => {
    const remaining = items.length - shown;
    moreBtn.hidden = remaining <= 0;
    moreBtn.textContent = remaining > 0 ? `Mostrar ${Math.min(PAGE, remaining)} más` : '';
    status.textContent = items.length ? `Mostrando ${shown.toLocaleString('es')} de ${plural(items.length, 'negocio', 'negocios')}` : '';
  };

  function renderMore(focusFirstNew = false) {
    const next = items.slice(shown, shown + PAGE);
    if (!next.length) return;
    const animate = !prefersReducedMotion();
    const frag = document.createDocumentFragment();
    next.forEach((item, i) => {
      const card = BusinessCard(item, cardCtx());
      if (animate) {
        card.classList.add('is-entering');
        card.style.animationDelay = `${Math.min(i, 12) * 18}ms`;
      }
      frag.append(card);
    });
    const firstNew = frag.firstElementChild;
    grid.append(frag);
    shown += next.length;
    updateFooter();
    if (focusFirstNew) firstNew?.querySelector('.card-open')?.focus();
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && shown < items.length) renderMore();
  }, { rootMargin: '600px 0px' });
  observer.observe(sentinel);

  return {
    el,
    /** Sustituye los elementos. `keep` conserva cuántos había pintados (sin animar). */
    setItems(next, nextCtx, { keep = false } = {}) {
      const previouslyShown = shown;
      items = next;
      ctx = { ...ctx, ...nextCtx };
      grid.replaceChildren();
      shown = 0;
      if (keep) {
        const count = Math.max(PAGE, Math.min(previouslyShown, items.length));
        const frag = document.createDocumentFragment();
        items.slice(0, count).forEach((item) => frag.append(BusinessCard(item, cardCtx())));
        grid.append(frag);
        shown = Math.min(count, items.length);
      } else {
        renderMore();
      }
      updateFooter();
    },
    /** Vuelve a pintar una ficha concreta si está visible. */
    refreshCard(bizId) {
      const index = items.findIndex((i) => i.id === bizId);
      if (index === -1 || index >= shown) return;
      const old = grid.querySelector(`[data-id="${CSS.escape(bizId)}"]`)?.closest('.card-wrap');
      if (!old) return;
      const hadFocus = old.contains(document.activeElement) ? document.activeElement.className : null;
      const fresh = BusinessCard(items[index], cardCtx());
      old.replaceWith(fresh);
      if (hadFocus) fresh.querySelector(`.${hadFocus.split(' ')[0]}`)?.focus();
    },
    destroy() {
      observer.disconnect();
    },
  };
}
