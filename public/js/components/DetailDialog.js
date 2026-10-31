// Panel de detalle de un negocio: datos, mapa, notas y seguimiento.
import { h, dateTime, formatHours, prefersReducedMotion, safeUrl, stampForNote, todayIso } from '../utils.js';
import { icon } from '../icons.js';
import {
  category, cityById, flushAllSaves, logCall, on, state, statusLabel, statusOf, updateTracking, webReviewLabel,
} from '../store.js';
import { StatusGroup, Segmented } from './StatusControls.js';
import { webBadge, socialLinks } from './BusinessCard.js';
import { toast } from './Toast.js';

const QUICK_LOG = [
  { label: 'No contestaron', status: 'no_contesto' },
  { label: 'Buzón de voz', status: 'no_contesto' },
  { label: 'Les interesa', status: 'interesado' },
  { label: 'No les interesa', status: 'no_interesado' },
  { label: 'Volver a llamar', status: 'volver_a_llamar' },
  { label: 'Número incorrecto', status: null },
];

let dialog;
let current = null; // { item, cleanup: [], onClose }
let onClosedCallback = () => {};

export function initDetail({ onClosed }) {
  dialog = document.getElementById('detail');
  onClosedCallback = onClosed || onClosedCallback;
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDetail();
  });
  // Clic en el fondo oscuro (fuera del panel) cierra.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDetail();
  });
  dialog.addEventListener('close', () => {
    const closed = current;
    current = null;
    closed?.cleanup.forEach((fn) => fn());
    flushAllSaves();
    dialog.replaceChildren();
    // Puede quedar otra ventana abierta debajo (la lista de un recuento).
    if (!document.querySelector('dialog[open]')) document.documentElement.classList.remove('has-dialog');
    if (closed) {
      if (closed.onClose) closed.onClose();
      else {
        const target = document.querySelector(`[data-id="${closed.item.id}"] .card-open`);
        (target || document.getElementById('main'))?.focus({ preventScroll: Boolean(target) });
      }
      onClosedCallback(closed.item);
    }
  });
}

export const isDetailOpen = () => Boolean(dialog?.open);

export function closeDetail() {
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

/** `onClose` (opcional) sustituye a la vuelta normal del foco al cerrar. */
export function openDetail(item, { focusNotes = false, onClose = null } = {}) {
  if (dialog.open) {
    current?.cleanup.forEach((fn) => fn());
    flushAllSaves();
  }
  current = { item, cleanup: [], onClose };
  dialog.classList.remove('is-closing');
  dialog.replaceChildren(renderDetail(item, current.cleanup));
  if (!dialog.open) dialog.showModal();
  document.documentElement.classList.add('has-dialog');
  dialog.querySelector('.detail-scroll').scrollTop = 0;
  const target = focusNotes ? dialog.querySelector('#detail-notes') : dialog.querySelector('#detail-title');
  target?.focus({ preventScroll: !focusNotes });
}

/** Llamada desde una ficha: registra el intento y abre las notas. */
export function startCall(item, phone, options = {}) {
  logCall(item, phone.tel);
  // Dejamos que el navegador abra el enlace tel: antes de mostrar el panel.
  setTimeout(() => openDetail(item, { ...options, focusNotes: true }), 250);
}

function mapsLinks(item, cityName) {
  const hasCoords = item.lat != null && item.lon != null;
  const query = [item.name, item.address, item.locality || cityName].filter(Boolean).join(', ');
  return {
    hasCoords,
    directions: hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`,
    osmMap: hasCoords ? `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lon}#map=18/${item.lat}/${item.lon}` : item.osmUrl,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    webSearch: `https://www.google.com/search?q=${encodeURIComponent(`"${item.name || item.type}" ${item.locality || cityName}`.trim())}`,
    embed: hasCoords
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${item.lon - 0.0045},${item.lat - 0.0025},${item.lon + 0.0045},${item.lat + 0.0025}&layer=mapnik&marker=${item.lat},${item.lon}`
      : null,
  };
}

const ext = (href, ...children) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'link' }, ...children, icon('external', { size: 13, className: 'ext' }));

function infoRow(label, iconName, content, missing) {
  return h('div', { class: ['info-row', missing && 'is-missing'] },
    h('dt', {}, icon(iconName, { size: 16 }), label),
    h('dd', {}, content),
  );
}

function renderDetail(item, cleanup) {
  const rec = () => state.tracking.get(item.id);
  const cat = category(item.category);
  const name = item.name || `Sin nombre · ${item.type}`;
  const city = cityById(item.cityId);
  const cityName = city?.name || item.cityName || '';
  const links = mapsLinks(item, cityName);
  const hours = formatHours(item.hours);
  const phone = item.phones[0];

  // ---------------------------------------------------------------- cabecera
  const head = h('header', { class: 'detail-head' },
    h('div', { class: 'detail-heading' },
      h('p', { class: 'detail-type' }, icon(cat.icon, { size: 15 }), item.type, item.detail ? ` · ${item.detail}` : ''),
      h('h2', { id: 'detail-title', tabindex: '-1' }, name),
      h('div', { class: 'detail-tags' },
        webBadge(item, rec()),
        item.chain && h('span', { class: 'tag' }, `Cadena: ${item.chain}`),
        cityName && h('span', { class: 'tag tag-city' }, icon('pin', { size: 13 }), cityName),
      ),
    ),
    h('button', { type: 'button', class: 'icon-btn detail-close', 'aria-label': 'Cerrar ficha', onClick: closeDetail }, icon('x', { size: 20 })),
  );

  const actions = h('div', { class: 'detail-actions' },
    phone && h('a', {
      class: 'btn btn-primary btn-lg', href: `tel:${phone.tel}`,
      onClick: () => {
        logCall(item, phone.tel);
        setTimeout(() => dialog.querySelector('#detail-notes')?.focus(), 300);
      },
    }, icon('phone', { size: 18 }), `Llamar · ${phone.display}`),
    h('a', { class: 'btn btn-secondary', href: links.directions, target: '_blank', rel: 'noopener noreferrer' }, icon('directions', { size: 17 }), 'Cómo llegar'),
    h('a', { class: 'btn btn-secondary', href: links.osmMap, target: '_blank', rel: 'noopener noreferrer' }, icon('map', { size: 17 }), 'Ver en mapa'),
  );

  // ------------------------------------------------------------------ datos
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Teléfono copiado', { type: 'success', duration: 1800 });
    } catch {
      toast('No se pudo copiar', { type: 'error' });
    }
  };
  const phones = h('ul', { class: 'phone-list' },
    item.phones.map((p) => h('li', {},
      h('a', { href: `tel:${p.tel}`, class: 'phone-link', onClick: () => logCall(item, p.tel) }, p.display),
      p.mobile && h('span', { class: 'tag tag-soft' }, 'Móvil'),
      h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': `Copiar ${p.display}`, title: 'Copiar', onClick: () => copy(p.display) }, icon('copy', { size: 15 })),
    )),
  );

  const address = [item.address, [item.postcode, item.locality].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const social = socialLinks(item, { size: 18 });
  const socialList = (item.social || []).filter((s) => safeUrl(s.url));
  const listingLinks = (item.listings || []).filter((l) => safeUrl(l.url));

  const info = h('dl', { class: 'info' },
    infoRow(item.phones.length > 1 ? 'Teléfonos' : 'Teléfono', 'phone', phones),
    infoRow('Dirección', 'pin', address || 'No disponible en OpenStreetMap', !address),
    infoRow('Horario', 'clock',
      hours.length ? h('ul', { class: 'hours', title: item.hours }, hours.map((line) => h('li', {}, line))) : 'No disponible en OpenStreetMap',
      !hours.length),
    item.email && infoRow('Correo', 'mail', h('a', { href: `mailto:${item.email}`, class: 'link' }, item.email)),
    infoRow('Redes sociales', 'instagram',
      socialList.length
        ? h('ul', { class: 'link-list' }, socialList.map((s, i) => h('li', {}, social[i], ext(s.url, s.label))))
        : 'La fuente no incluye redes sociales para este negocio.',
      !socialList.length),
    infoRow('Fichas públicas', 'link',
      h('ul', { class: 'link-list' },
        listingLinks.map((l) => h('li', {}, ext(l.url, `Ficha en ${l.label}`))),
        h('li', {}, ext(item.osmUrl, 'Ficha en OpenStreetMap')),
        h('li', {}, ext(links.googleMaps, 'Buscar en Google Maps (fotos y reseñas)')),
      )),
  );

  const map = links.embed
    ? h('figure', { class: 'detail-map' },
        h('iframe', { src: links.embed, title: `Mapa de ${name}`, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' }),
        h('figcaption', {}, 'Mapa © colaboradores de OpenStreetMap'))
    : h('p', { class: 'muted small' }, 'Este negocio no tiene coordenadas en la fuente.');

  // ----------------------------------------------------------- seguimiento
  const saveState = h('span', { class: 'save-state', 'aria-live': 'polite' });
  const setSave = (s) => {
    saveState.dataset.state = s;
    saveState.textContent = { pending: 'Guardando…', saving: 'Guardando…', saved: 'Guardado', error: 'Sin guardar · reintentando' }[s] || '';
  };
  cleanup.push(on('saving', (e) => e.bizId === item.id && setSave(e.state)));

  const notes = h('textarea', {
    id: 'detail-notes', class: 'notes', rows: '5', maxlength: '20000',
    placeholder: 'Ej.: Habló con la dueña. Volver a llamar el viernes por la mañana.',
    value: rec()?.notes || '',
  });
  notes.addEventListener('input', () => updateTracking(item, { notes: notes.value }, { delay: 700 }));
  notes.addEventListener('blur', () => flushAllSaves());

  const callbackInput = h('input', {
    type: 'date', id: 'detail-callback', class: 'input input-date', value: rec()?.callbackAt || '', min: todayIso(),
    onChange: (e) => updateTracking(item, { callbackAt: e.target.value || null }),
  });
  const setCallback = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    callbackInput.value = iso;
    updateTracking(item, { callbackAt: iso });
  };
  const callbackRow = h('div', { class: 'callback-row' },
    h('label', { for: 'detail-callback' }, icon('calendar', { size: 16 }), 'Volver a llamar el'),
    callbackInput,
    h('button', { type: 'button', class: 'chip', onClick: () => setCallback(1) }, 'Mañana'),
    h('button', { type: 'button', class: 'chip', onClick: () => setCallback(7) }, 'En una semana'),
  );
  const syncCallback = () => {
    callbackRow.hidden = statusOf(item.id) !== 'volver_a_llamar';
  };

  const statusGroup = StatusGroup(item, { onChange: syncCallback });
  syncCallback();

  const quick = h('div', { class: 'quick-log', role: 'group', 'aria-label': 'Registro rápido' },
    QUICK_LOG.map((q) => h('button', {
      type: 'button', class: 'chip',
      title: q.status ? `Añade «${q.label}» con fecha y cambia el estado a «${statusLabel(q.status)}»` : `Añade «${q.label}» con fecha`,
      onClick: () => {
        const line = `${stampForNote()} — ${q.label}`;
        notes.value = notes.value.trim() ? `${notes.value.trimEnd()}\n${line}` : line;
        updateTracking(item, q.status ? { notes: notes.value, status: q.status } : { notes: notes.value });
        statusGroup.refresh();
        syncCallback();
        notes.focus();
        notes.setSelectionRange(notes.value.length, notes.value.length);
      },
    }, icon('plus', { size: 14 }), q.label)),
  );

  // Revisión de web
  const webUrl = h('input', {
    type: 'url', class: 'input', id: 'detail-weburl', placeholder: 'https://… (opcional)', value: rec()?.webUrl || '',
  });
  webUrl.addEventListener('input', () => updateTracking(item, { webUrl: webUrl.value }, { delay: 700 }));
  const webUrlRow = h('div', { class: 'field' }, h('label', { for: 'detail-weburl' }, 'Dirección de su web'), webUrl);
  const syncWeb = () => {
    webUrlRow.hidden = (rec()?.webReview || 'sin_verificar') !== 'tiene_web';
  };
  const webReview = Segmented({
    label: 'Revisión de la web',
    options: state.config.webReviews.map((w) => ({ id: w.id, label: w.id === 'sin_web' ? 'No tiene web' : w.label })),
    value: rec()?.webReview || 'sin_verificar',
    onChange: (value) => {
      updateTracking(item, { webReview: value });
      syncWeb();
      head.querySelector('.detail-tags').firstElementChild.replaceWith(webBadge(item, rec()));
      if (value === 'tiene_web') toast('Marcado como «Tiene web». Se ocultará de la lista activa.', { duration: 3500 });
    },
  });
  syncWeb();

  const webSection = h('section', { class: 'detail-section' },
    h('h3', {}, icon('globe', { size: 18 }), '¿Tiene página web?'),
    h('p', { class: 'hint' },
      item.webStatus === 'social'
        ? 'En OpenStreetMap solo aparecen redes sociales o fichas en directorios, no una web propia. '
        : 'OpenStreetMap no tiene ninguna web para este negocio. ',
      'Eso no demuestra que no exista: búscalo y confirma el resultado.'),
    h('div', { class: 'row-wrap' },
      h('a', { class: 'btn btn-secondary btn-sm', href: links.webSearch, target: '_blank', rel: 'noopener noreferrer' }, icon('search', { size: 15 }), 'Buscar en la web'),
      h('a', { class: 'btn btn-secondary btn-sm', href: links.googleMaps, target: '_blank', rel: 'noopener noreferrer' }, icon('map', { size: 15 }), 'Buscar en Google Maps'),
    ),
    webReview,
    webUrlRow,
  );

  // Historial
  const historyList = h('ol', { class: 'timeline' });
  const renderHistory = () => {
    const events = [...(rec()?.history || [])].reverse();
    historyList.replaceChildren(
      ...(events.length
        ? events.slice(0, 50).map((e) => {
            const text = e.kind === 'call'
              ? `Llamada iniciada${e.tel ? ` al ${e.tel}` : ''}`
              : e.kind === 'status' ? `Estado: ${statusLabel(e.value)}` : `Web: ${webReviewLabel(e.value)}`;
            return h('li', { class: `ev-${e.kind}` },
              icon(e.kind === 'call' ? 'phone' : e.kind === 'status' ? 'flag' : 'globe', { size: 14 }),
              h('span', {}, text), h('time', { datetime: new Date(e.at).toISOString() }, dateTime(e.at)));
          })
        : [h('li', { class: 'is-empty' }, 'Sin actividad todavía. Las llamadas y cambios de estado aparecerán aquí.')]),
    );
  };
  renderHistory();
  cleanup.push(on('tracking', (e) => {
    if (e.bizId !== item.id) return;
    if (e.fields.some((f) => f === 'history' || f === 'status' || f === 'webReview')) renderHistory();
  }));

  const tracking = h('section', { class: 'detail-section detail-track' },
    h('h3', {}, icon('flag', { size: 18 }), 'Seguimiento de la llamada'),
    statusGroup,
    callbackRow,
    h('div', { class: 'field' },
      h('div', { class: 'field-head' }, h('label', { for: 'detail-notes' }, 'Notas'), saveState),
      notes,
      quick,
    ),
  );

  const history = h('section', { class: 'detail-section' }, h('h3', {}, icon('history', { size: 18 }), 'Historial'), historyList);

  const footer = h('p', { class: 'detail-source' },
    'Datos: ', ext('https://www.openstreetmap.org/copyright', '© colaboradores de OpenStreetMap'),
    '. ¿Algún dato está mal? Puedes corregirlo en ', ext(item.osmUrl, 'su ficha de OSM'), '.');

  return h('div', { class: 'detail-panel' },
    head,
    h('div', { class: 'detail-scroll' }, actions, h('div', { class: 'detail-columns' },
      h('div', { class: 'detail-col' }, tracking, webSection, history),
      h('div', { class: 'detail-col' }, h('section', { class: 'detail-section' }, h('h3', {}, icon('info', { size: 18 }), 'Datos del negocio'), info), map),
    ), footer),
  );
}
