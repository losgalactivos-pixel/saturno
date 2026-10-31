// Barra lateral: marca, navegación, buscador de ciudades y lista de ciudades.
import { h } from '../utils.js';
import { icon } from '../icons.js';
import { isTracked, on, state } from '../store.js';
import { CitySearch } from './CitySearch.js';

export const SUGGESTED_CITIES = [
  'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Murcia', 'Palma', 'Las Palmas de Gran Canaria',
  'Bilbao', 'Alicante', 'Córdoba', 'Valladolid', 'Vigo', 'Gijón', 'L\'Hospitalet de Llobregat', 'Vitoria-Gasteiz',
  'A Coruña', 'Granada', 'Elche', 'Oviedo', 'Badalona', 'Cartagena', 'Terrassa', 'Jerez de la Frontera', 'Sabadell',
  'Móstoles', 'Santa Cruz de Tenerife', 'Pamplona', 'Almería', 'Alcalá de Henares', 'Fuenlabrada', 'Leganés',
  'San Sebastián', 'Getafe', 'Burgos', 'Albacete', 'Santander', 'Castellón de la Plana', 'Alcorcón', 'Logroño',
  'Badajoz', 'Salamanca', 'Huelva', 'Marbella', 'Lleida', 'Tarragona', 'León', 'Cádiz', 'Jaén', 'Ourense', 'Girona',
  'Lugo', 'Cáceres', 'Toledo', 'Santiago de Compostela', 'Pontevedra', 'Segovia', 'Guadalajara', 'Ciudad Real',
];

/**
 * @param onPickCandidate(candidate)  añadir una ciudad devuelta por el buscador
 * @param onSuggestion(name)          añadir una ciudad de la lista sugerida
 * @param onRemove(cityId)            quitar una ciudad de la lista
 * @param onExport() / onImport(file)
 */
export function Sidebar({ onPickCandidate, onSuggestion, onRemove, onExport, onImport }) {
  const nav = h('nav', { class: 'side-nav', 'aria-label': 'Secciones' });
  const lists = h('div', { class: 'city-groups' });
  const suggestions = h('details', { class: 'suggestions' });

  const renderNav = () => {
    const tracked = [...state.tracking.values()].filter(isTracked).length;
    const route = state.route.name;
    nav.replaceChildren(
      h('a', { href: '#/', class: 'side-link', 'aria-current': route === 'home' ? 'page' : null }, icon('sparkle', { size: 17 }), 'Inicio'),
      h('a', { href: '#/seguimiento', class: 'side-link', 'aria-current': route === 'tracking' ? 'page' : null },
        icon('note', { size: 17 }), 'Seguimiento', tracked ? h('span', { class: 'side-count' }, tracked.toLocaleString('es')) : null),
    );
  };

  const cityProgress = () => {
    const contacted = {};
    for (const rec of state.tracking.values()) {
      if (rec.cityId && rec.status !== 'pendiente') contacted[rec.cityId] = (contacted[rec.cityId] || 0) + 1;
    }
    return contacted;
  };

  const cityItem = (city, contacted) => {
    const active = state.route.name === 'city' && state.route.cityId === city.id;
    const total = city.total;
    const pct = total ? Math.min(100, Math.round((contacted / total) * 100)) : 0;
    return h('li', { class: ['city-item', city.done && 'is-done', active && 'is-active'] },
      h('a', { href: `#/ciudad/${city.id}`, class: 'city-link', 'aria-current': active ? 'page' : null },
        h('span', { class: 'city-check', 'aria-hidden': 'true' }, city.done ? icon('check', { size: 13 }) : null),
        h('span', { class: 'city-text' },
          h('span', { class: 'city-name' }, city.name, city.done ? h('span', { class: 'sr-only' }, ' (terminada)') : null),
          h('span', { class: 'city-sub' },
            total == null ? (city.region || 'Sin cargar todavía') : `${contacted.toLocaleString('es')} de ${total.toLocaleString('es')} contactados`)),
        total ? h('span', { class: 'city-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${pct}%` } })) : null,
      ),
      h('button', {
        type: 'button', class: 'icon-btn icon-btn-sm city-remove', 'aria-label': `Quitar ${city.name} de la lista`, title: 'Quitar de la lista',
        onClick: () => onRemove(city.id),
      }, icon('x', { size: 14 })),
    );
  };

  const renderCities = () => {
    const contacted = cityProgress();
    const pending = state.cities.filter((c) => !c.done);
    const done = state.cities.filter((c) => c.done);
    const group = (title, list, emptyText, cls) => h('section', { class: ['city-group', cls] },
      h('h2', { class: 'side-heading' }, title, h('span', { class: 'side-heading-count' }, String(list.length))),
      list.length
        ? h('ul', { class: 'city-list' }, list.map((c) => cityItem(c, contacted[c.id] || 0)))
        : h('p', { class: 'side-empty' }, emptyText));
    lists.replaceChildren(
      group('Pendientes', pending, state.cities.length ? 'No te quedan ciudades pendientes. ¡Bien hecho!' : 'Aún no has añadido ciudades.', 'is-pending'),
      group('Terminadas', done, 'Marca una ciudad como terminada cuando acabes sus llamadas.', 'is-done'),
    );
  };

  const renderSuggestions = () => {
    const added = new Set(state.cities.map((c) => c.name.toLowerCase()));
    const list = SUGGESTED_CITIES.filter((n) => !added.has(n.toLowerCase()));
    suggestions.open = suggestions.open || !state.cities.length;
    suggestions.replaceChildren(
      h('summary', {}, icon('chevronRight', { size: 15, className: 'summary-chevron' }), 'Ciudades de España'),
      h('ul', { class: 'suggestion-list' }, list.map((name) => h('li', {},
        h('button', {
          type: 'button', class: 'suggestion',
          onClick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.classList.add('is-busy');
            try {
              await onSuggestion(name);
            } finally {
              btn.disabled = false;
              btn.classList.remove('is-busy');
            }
          },
        }, name, icon('plus', { size: 14 }))))),
    );
  };

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onChange: (e) => {
      const file = e.target.files?.[0];
      if (file) onImport(file);
      e.target.value = '';
    },
  });

  const el = h('div', { class: 'sidebar-inner' },
    h('a', { href: '#/', class: 'brand' },
      h('img', { src: 'icons/saturno.svg', alt: '', width: '36', height: '36' }),
      h('span', { class: 'brand-text' }, h('strong', {}, 'Saturno'), h('small', {}, 'Negocios sin web'))),
    nav,
    h('div', { class: 'side-block' }, CitySearch({ onPick: onPickCandidate, label: 'Añadir ciudad' })),
    lists,
    suggestions,
    h('footer', { class: 'side-footer' },
      state.mode === 'standalone' && h('p', { class: 'device-note' },
        icon('info', { size: 14 }),
        h('span', {}, 'Tus ciudades y notas se guardan en este dispositivo. Usa Exportar e Importar para pasarlas a otro.')),
      h('div', { class: 'side-tools' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: onExport, title: 'Descarga una copia de tus ciudades, notas y estados' }, icon('download', { size: 15 }), 'Exportar'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => fileInput.click(), title: 'Recupera una copia exportada' }, icon('upload', { size: 15 }), 'Importar'),
        fileInput),
      h('p', { class: 'attribution' },
        'Datos de ', h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener noreferrer' }, '© colaboradores de OpenStreetMap'),
        ' (ODbL)')),
  );

  const renderAll = () => {
    renderNav();
    renderCities();
    renderSuggestions();
  };
  renderAll();
  on('cities', () => {
    renderCities();
    renderSuggestions();
  });
  on('route', () => {
    renderNav();
    renderCities();
  });
  let pendingFrame = 0;
  on('tracking', () => {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(() => {
      renderNav();
      renderCities();
    });
  });
  return el;
}
