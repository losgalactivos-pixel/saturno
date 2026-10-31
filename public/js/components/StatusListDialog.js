// Lista emergente con los negocios de un recuento del resumen
// (contactados, interesados, volver a llamar, con nota, sin web confirmada).
// Al abrir una ficha desde aquí, el detalle se abre encima y al cerrarlo
// se vuelve a la lista, para poder repasarla de uno en uno.
import { h, prefersReducedMotion, relativeTime, shortDate, todayIso } from '../utils.js';
import { icon } from '../icons.js';
import { category, cityById, lastCall, on, state, statusLabel, statusOf } from '../store.js';
import { openDetail, startCall } from './DetailDialog.js';
import { EmptyState } from './States.js';

export const LISTS = {
  contacted: {
    title: 'Contactados', hint: 'Negocios con un estado distinto de «Pendiente», del más reciente al más antiguo.',
    empty: 'Todavía no has cambiado el estado de ningún negocio.', showStatus: true,
    match: (rec) => Boolean(rec) && rec.status !== 'pendiente',
  },
  interesado: {
    title: 'Interesados', hint: 'Del más reciente al más antiguo.',
    empty: 'Todavía no hay negocios marcados como «Interesado».',
    match: (rec) => rec?.status === 'interesado',
  },
  volver_a_llamar: {
    title: 'Volver a llamar', hint: 'Ordenados por fecha de rellamada; los vencidos, primero.',
    empty: 'No tienes rellamadas pendientes.', byCallback: true,
    match: (rec) => rec?.status === 'volver_a_llamar',
  },
  withNotes: {
    title: 'Con nota', hint: 'Se muestra la última línea de cada nota.', showStatus: true,
    empty: 'Todavía no has escrito notas.',
    match: (rec) => Boolean(rec?.notes?.trim()),
  },
  verified: {
    title: 'Sin web confirmada', hint: 'Negocios que revisaste y no tienen página web.', showStatus: true,
    empty: 'Todavía no has confirmado que ningún negocio no tenga web.',
    match: (rec) => rec?.webReview === 'sin_web',
  },
};

let dialog = null;
let current = null; // { kind, getItems, options, cleanup }

function ensureDialog() {
  if (dialog) return dialog;
  dialog = h('dialog', { class: 'listdlg', 'aria-labelledby': 'list-title' });
  document.body.append(dialog);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeStatusList();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeStatusList();
  });
  dialog.addEventListener('close', () => {
    const closed = current;
    current = null;
    closed?.cleanup.forEach((fn) => fn());
    dialog.replaceChildren();
    if (!document.querySelector('dialog[open]')) document.documentElement.classList.remove('has-dialog');
    if (closed) {
      const target = closed.options.returnFocus?.();
      (target && !target.disabled ? target : document.getElementById('main'))?.focus({ preventScroll: true });
    }
  });
  return dialog;
}

export function closeStatusList() {
  if (!dialog?.open || dialog.classList.contains('is-closing')) return;
  if (prefersReducedMotion()) {
    dialog.close();
    return;
  }
  dialog.classList.add('is-closing');
  const done = () => {
    dialog.classList.remove('is-closing');
    if (dialog.open) dialog.close();
  };
  dialog.addEventListener('animationend', done, { once: true });
  setTimeout(done, 300);
}

function matching(kind, getItems) {
  const spec = LISTS[kind];
  const items = getItems().filter((item) => spec.match(state.tracking.get(item.id)));
  const updated = (i) => state.tracking.get(i.id)?.updatedAt || 0;
  if (spec.byCallback) {
    const cb = (i) => state.tracking.get(i.id)?.callbackAt || '9999-99-99';
    return items.sort((a, b) => cb(a).localeCompare(cb(b)) || updated(b) - updated(a));
  }
  return items.sort((a, b) => updated(b) - updated(a));
}

function lastNoteLine(notes) {
  const lines = (notes || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || '';
}

function Row(item, spec, options) {
  const rec = state.tracking.get(item.id);
  const status = statusOf(item.id);
  const name = item.name || `Sin nombre · ${item.type}`;
  const phone = item.phones[0];
  const call = lastCall(rec);
  const note = lastNoteLine(rec?.notes);
  const cityName = options.showCity ? cityById(item.cityId)?.name || item.cityName : null;
  const overdue = rec?.callbackAt && rec.callbackAt <= todayIso();
  const reopen = () => {
    const row = dialog?.querySelector(`.srow[data-id="${CSS.escape(item.id)}"] .srow-main`);
    (row || dialog?.querySelector('#list-title'))?.focus({ preventScroll: Boolean(row) });
  };

  return h('li', { class: 'srow', dataset: { id: item.id } },
    h('button', {
      type: 'button', class: 'srow-main', 'aria-label': `Abrir la ficha de ${name}`,
      onClick: () => openDetail(item, { onClose: reopen }),
    },
      h('span', { class: 'srow-top' },
        icon(category(item.category).icon, { size: 15, className: 'srow-icon' }),
        h('span', { class: 'srow-name' }, name),
        spec.showStatus && h('span', { class: ['tag', 'tag-status', `is-${status}`] },
          h('span', { class: 'status-dot', 'aria-hidden': 'true' }), statusLabel(status))),
      h('span', { class: 'srow-sub' }, [item.type, item.address, cityName].filter(Boolean).join(' · ')),
      spec.byCallback && h('span', { class: ['tag', rec?.callbackAt ? (overdue ? 'tag-due' : 'tag-callback') : 'tag-soft'] },
        icon('calendar', { size: 13 }),
        rec?.callbackAt ? `${overdue ? 'Toca llamar' : 'Llamar'}: ${shortDate(rec.callbackAt)}` : 'Sin fecha'),
      note && h('span', { class: 'srow-note' }, icon('note', { size: 13 }), h('span', {}, note)),
      call && h('span', { class: 'srow-meta' }, `Llamado ${relativeTime(call.at)}`)),
    phone && h('a', {
      class: 'btn btn-primary btn-sm srow-call', href: `tel:${phone.tel}`,
      'aria-label': `Llamar a ${name}: ${phone.display}`,
      onClick: () => startCall(item, phone, { onClose: reopen }),
    }, icon('phone', { size: 15 }), h('span', { class: 'srow-phone' }, phone.display)),
  );
}

/**
 * Abre la lista de un recuento.
 * @param kind      clave de LISTS
 * @param getItems  función que devuelve los negocios de la vista (ciudad o seguimiento)
 * @param options   { context: texto bajo el título, showCity, returnFocus: () => elemento }
 */
export function openStatusList(kind, getItems, options = {}) {
  const spec = LISTS[kind];
  const dlg = ensureDialog();
  current?.cleanup.forEach((fn) => fn());
  current = { kind, getItems, options, cleanup: [] };

  const count = h('span', { class: 'listdlg-count' });
  const list = h('ul', { class: 'srows' });
  const scroll = h('div', { class: 'listdlg-scroll' }, list);

  const render = () => {
    const items = matching(kind, getItems);
    // Si el foco estaba en una fila, lo conservamos (o lo llevamos al título si ya no está).
    const focusedRow = scroll.contains(document.activeElement) ? document.activeElement.closest('.srow') : null;
    const focusedClass = focusedRow && document.activeElement.classList.contains('srow-call') ? '.srow-call' : '.srow-main';
    count.textContent = items.length.toLocaleString('es');
    const top = scroll.scrollTop;
    if (!items.length) {
      scroll.replaceChildren(EmptyState({ iconName: 'inbox', title: 'Lista vacía', text: spec.empty }));
    } else {
      list.replaceChildren(...items.map((item) => Row(item, spec, options)));
      if (list.parentNode !== scroll) scroll.replaceChildren(list);
      scroll.scrollTop = top;
    }
    if (focusedRow) {
      const again = list.querySelector(`.srow[data-id="${CSS.escape(focusedRow.dataset.id)}"] ${focusedClass}`);
      (again || dlg.querySelector('#list-title')).focus({ preventScroll: true });
    }
  };

  dlg.classList.remove('is-closing');
  dlg.replaceChildren(h('div', { class: 'listdlg-panel' },
    h('header', { class: 'listdlg-head' },
      h('div', { class: 'listdlg-heading' },
        options.context && h('p', { class: 'eyebrow' }, icon('pin', { size: 13 }), options.context),
        h('h2', { id: 'list-title', tabindex: '-1' }, spec.title, count),
        h('p', { class: 'listdlg-hint' }, spec.hint)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar lista', onClick: closeStatusList }, icon('x', { size: 20 }))),
    scroll));
  render();

  // Si cambias el estado o las notas desde una ficha, la lista se actualiza.
  let frame = 0;
  current.cleanup.push(on('tracking', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }));

  if (!dlg.open) dlg.showModal();
  document.documentElement.classList.add('has-dialog');
  dlg.querySelector('#list-title').focus({ preventScroll: true });
}
