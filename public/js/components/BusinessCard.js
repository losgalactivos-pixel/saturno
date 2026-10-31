// Ficha compacta de un negocio en la lista de resultados.
import { h, formatHours, highlight, relativeTime, safeUrl, shortDate, todayIso } from '../utils.js';
import { icon } from '../icons.js';
import { category, cityById, lastCall, state, statusOf } from '../store.js';
import { StatusSelect } from './StatusControls.js';

export function webBadge(item, rec) {
  const review = rec?.webReview || 'sin_verificar';
  if (review === 'sin_web') return h('span', { class: 'tag tag-ok', title: 'Lo revisaste y confirmaste que no tiene web' }, icon('checkCircle', { size: 14 }), 'Sin web confirmada');
  if (review === 'tiene_web') return h('span', { class: 'tag tag-bad', title: 'Lo marcaste como que sí tiene web' }, icon('globe', { size: 14 }), 'Tiene web');
  if (item.webStatus === 'social')
    return h('span', { class: 'tag tag-web', title: 'En OpenStreetMap solo figuran redes sociales o fichas en directorios, no una web propia. Pendiente de revisar.' }, icon('globeOff', { size: 14 }), 'Solo redes o directorios');
  return h('span', { class: 'tag tag-web', title: 'OpenStreetMap no tiene web para este negocio. Pendiente de revisar.' }, icon('globeOff', { size: 14 }), 'Sin web en OSM');
}

export function socialLinks(item, { size = 16 } = {}) {
  return (item.social || [])
    .map((s) => {
      const url = safeUrl(s.url);
      if (!url) return null;
      return h('a', {
        class: `social social-${s.network}`, href: url, target: '_blank', rel: 'noopener noreferrer',
        title: `${s.label} (se abre en otra pestaña)`, 'aria-label': `${s.label} de ${item.name || 'este negocio'}`,
      }, icon(s.network, { size }));
    })
    .filter(Boolean);
}

/**
 * @param item  negocio normalizado
 * @param ctx   { query, scope, showCity, onOpen(item, opts), onCall(item, phone) }
 */
export function BusinessCard(item, ctx) {
  const rec = state.tracking.get(item.id);
  const status = statusOf(item.id);
  const cat = category(item.category);
  const phone = item.phones[0];
  const hours = formatHours(item.hours);
  const notes = rec?.notes?.trim() || '';
  const call = lastCall(rec);
  const name = item.name || `Sin nombre · ${item.type}`;
  const overdue = rec?.callbackAt && status === 'volver_a_llamar' && rec.callbackAt <= todayIso();

  const openBtn = h('button', { type: 'button', class: 'card-open', onClick: () => ctx.onOpen(item) },
    ctx.scope === 'name' ? highlight(name, ctx.query) : name);

  const address = [item.address, item.postcode].filter(Boolean).join(' · ');

  return h('li', { class: 'card-wrap' },
    h('article', { class: ['card', `is-${status}`], dataset: { id: item.id }, 'aria-label': name },
      h('div', { class: 'card-top' },
        h('span', { class: 'card-type' }, icon(cat.icon, { size: 15 }), item.type, item.detail && h('span', { class: 'card-detail' }, ` · ${item.detail}`)),
        StatusSelect(item, { compact: true }),
      ),
      h('h3', { class: 'card-title' }, openBtn),
      h('ul', { class: 'card-meta' },
        h('li', { class: address ? null : 'is-missing' }, icon('pin', { size: 15 }), address || 'Dirección no disponible'),
        h('li', { class: hours.length ? null : 'is-missing', title: item.hours || null }, icon('clock', { size: 15 }),
          hours.length ? h('span', { class: 'truncate' }, hours[0], hours.length > 1 ? h('span', { class: 'muted' }, ` (+${hours.length - 1})`) : null) : 'Horario no disponible'),
      ),
      h('div', { class: 'card-tags' },
        webBadge(item, rec),
        item.chain && h('span', { class: 'tag', title: 'Pertenece a una cadena o franquicia: probablemente tenga web corporativa' }, 'Cadena'),
        ctx.showCity && h('span', { class: 'tag tag-city' }, icon('pin', { size: 13 }), cityById(item.cityId)?.name || item.cityName || 'Ciudad'),
        rec?.callbackAt && status === 'volver_a_llamar' &&
          h('span', { class: ['tag', overdue ? 'tag-due' : 'tag-callback'] }, icon('calendar', { size: 13 }), overdue ? `Llamar: ${shortDate(rec.callbackAt)} (pendiente)` : `Llamar: ${shortDate(rec.callbackAt)}`),
        h('span', { class: 'card-social' }, socialLinks(item)),
      ),
      notes
        ? h('p', { class: 'card-note' }, icon('note', { size: 15 }), h('span', {}, ctx.scope === 'notes' ? highlight(notes, ctx.query) : notes))
        : null,
      h('div', { class: 'card-actions' },
        phone
          ? h('a', {
              class: 'btn btn-primary btn-call', href: `tel:${phone.tel}`,
              'aria-label': `Llamar a ${name}: ${phone.display}`,
              onClick: () => ctx.onCall(item, phone),
            }, icon('phone', { size: 16 }), h('span', {}, phone.display))
          : null,
        item.phones.length > 1 && h('span', { class: 'muted small' }, `+${item.phones.length - 1} tel.`),
        h('span', { class: 'card-last' }, call ? `Llamado ${relativeTime(call.at)}` : ''),
      ),
    ),
  );
}
