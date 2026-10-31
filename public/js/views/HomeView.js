// Portada: buscador de ciudad, sugerencias y explicación de la fuente de datos.
import { h } from '../utils.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { CitySearch } from '../components/CitySearch.js';
import { SUGGESTED_CITIES } from '../components/Sidebar.js';

export function HomeView({ onPickCandidate, onSuggestion }) {
  const added = new Set(state.cities.map((c) => c.name.toLowerCase()));
  const popular = SUGGESTED_CITIES.filter((n) => !added.has(n.toLowerCase())).slice(0, 10);
  const pending = state.cities.filter((c) => !c.done);
  const search = CitySearch({ onPick: onPickCandidate, large: true, placeholder: 'Escribe una ciudad: Valencia, Getafe, Lugo…' });

  const step = (n, title, text, iconName) => h('li', { class: 'step' },
    h('span', { class: 'step-icon' }, icon(iconName, { size: 20 })),
    h('div', {}, h('h3', {}, h('span', { class: 'step-n' }, `${n}.`), ` ${title}`), h('p', {}, text)));

  const el = h('div', { class: 'view view-home' },
    h('section', { class: 'hero' },
      h('img', { src: 'icons/saturno.svg', alt: '', width: '64', height: '64', class: 'hero-logo' }),
      h('h1', { tabindex: '-1', class: 'view-h1' }, 'Encuentra negocios sin web y organiza tus llamadas'),
      h('p', { class: 'hero-text' }, 'Elige una ciudad y Saturno te muestra los negocios locales con teléfono que no tienen página web en OpenStreetMap. Llama con un clic y apunta el resultado de cada llamada.'),
      search,
      popular.length
        ? h('div', { class: 'hero-popular' },
            h('span', { class: 'muted small' }, 'O empieza por:'),
            h('ul', { class: 'chips' }, popular.map((name) => h('li', {},
              h('button', {
                type: 'button', class: 'chip',
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
              }, name)))))
        : null),
    pending.length
      ? h('section', { class: 'home-section' },
          h('h2', { class: 'section-title' }, 'Continúa donde lo dejaste'),
          h('ul', { class: 'resume-list' }, pending.slice(0, 6).map((c) => h('li', {},
            h('a', { href: `#/ciudad/${c.id}`, class: 'resume-card' },
              h('span', { class: 'resume-name' }, c.name),
              h('span', { class: 'muted small' }, c.total == null ? 'Sin cargar todavía' : `${c.total.toLocaleString('es')} negocios`),
              icon('chevronRight', { size: 18 }))))))
      : null,
    h('section', { class: 'home-section' },
      h('h2', { class: 'section-title' }, 'Cómo funciona'),
      h('ol', { class: 'steps' },
        step(1, 'Elige una ciudad', 'Búscala o elígela de la lista. Puedes filtrar por restaurantes, peluquerías, clínicas, tiendas…', 'pin'),
        step(2, 'Revisa y llama', 'Comprueba si de verdad no tienen web y pulsa «Llamar». El panel de notas se abre solo.', 'phone'),
        step(3, 'Anota y sigue', 'Marca el resultado (no contestó, interesado…), busca en tus notas y cierra la ciudad al terminar.', 'checkCircle'))),
    h('section', { class: 'home-section source-note' },
      icon('info', { size: 18 }),
      h('p', {},
        h('strong', {}, 'Sobre los datos. '),
        'Los negocios vienen de OpenStreetMap, un mapa colaborativo con licencia abierta. Saturno no inventa teléfonos, horarios ni redes: si un dato falta en OSM, se indica. ',
        'Que un negocio no tenga web en OSM no garantiza que no la tenga, por eso cada ficha te permite verificarlo. ',
        state.config ? `Los resultados de cada ciudad se reutilizan durante ${state.config.cacheHours} h para no saturar los servidores públicos. ` : '',
        state.mode === 'standalone' ? 'Tus ciudades, notas y estados se guardan solo en este dispositivo.' : '')),
  );
  return { el, focusTitle: () => el.querySelector('h1')?.focus(), focusSearch: () => search.focus(), destroy() {} };
}
