// Buscador de ciudades (Nominatim). Solo busca al enviar, como pide su política de uso.
import { h } from '../utils.js';
import { icon } from '../icons.js';
import { api } from '../api.js';

const KINDS = {
  city: 'Ciudad', town: 'Municipio', village: 'Pueblo', municipality: 'Municipio', hamlet: 'Aldea',
  suburb: 'Barrio', borough: 'Distrito', quarter: 'Barrio', county: 'Comarca', state_district: 'Comarca',
};

let counter = 0;

export function CitySearch({ onPick, large = false, label = 'Buscar una ciudad', placeholder = 'Ciudad o municipio…' }) {
  counter += 1;
  const id = `city-search-${counter}`;
  const input = h('input', {
    id, type: 'search', class: 'input', placeholder, autocomplete: 'off', required: true, minlength: '2', enterkeyhint: 'search',
  });
  const submit = h('button', { type: 'submit', class: ['btn', 'btn-primary', large ? null : 'btn-sm'] }, icon('search', { size: 16 }), h('span', {}, 'Buscar'));
  const results = h('div', { class: 'city-results', 'aria-live': 'polite' });
  let lastQuery = '';

  const pick = async (candidate, button) => {
    button.disabled = true;
    try {
      await onPick(candidate);
      results.replaceChildren();
      input.value = '';
      lastQuery = '';
    } finally {
      button.disabled = false;
    }
  };

  const form = h('form', {
    class: ['city-search', large && 'is-large'], role: 'search',
    onSubmit: async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q.length < 2 || q === lastQuery) return;
      lastQuery = q;
      submit.disabled = true;
      submit.classList.add('is-busy');
      results.replaceChildren(h('p', { class: 'city-results-msg' }, h('span', { class: 'spinner spinner-sm', 'aria-hidden': 'true' }), 'Buscando ciudades…'));
      try {
        const { results: list } = await api.geocode(q);
        if (!list.length) {
          results.replaceChildren(h('p', { class: 'city-results-msg' }, `No se encontró «${q}». Prueba con otro nombre o añade la provincia.`));
          return;
        }
        results.replaceChildren(
          h('p', { class: 'city-results-msg' }, list.length === 1 ? '1 resultado' : `${list.length} resultados · elige uno`),
          h('ul', { class: 'city-results-list' },
            list.map((c) => h('li', {},
              h('button', { type: 'button', class: 'city-result', onClick: (ev) => pick(c, ev.currentTarget) },
                h('span', { class: 'city-result-name' }, c.name, h('span', { class: 'tag tag-soft' }, KINDS[c.kind] || 'Lugar')),
                h('span', { class: 'city-result-region' }, c.region || c.displayName),
                icon('plus', { size: 16, className: 'city-result-add' }))))),
        );
      } catch (err) {
        lastQuery = '';
        results.replaceChildren(h('p', { class: 'city-results-msg is-error' }, icon('alert', { size: 15 }), err.message));
      } finally {
        submit.disabled = false;
        submit.classList.remove('is-busy');
      }
    },
  },
  h('label', { for: id, class: large ? 'sr-only' : 'field-label' }, label),
  h('div', { class: 'city-search-row' }, input, submit),
  results);

  input.addEventListener('input', () => {
    if (!input.value.trim()) {
      results.replaceChildren();
      lastQuery = '';
    }
  });

  form.focus = () => input.focus();
  return form;
}
