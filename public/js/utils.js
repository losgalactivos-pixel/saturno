// Utilidades compartidas por todos los componentes.

/**
 * Crea un elemento DOM. `props` admite: class, dataset, style (objeto),
 * on<Evento> (manejadores), y cualquier atributo. Los hijos pueden ser
 * nodos, cadenas (siempre como texto, nunca HTML), arrays o null.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'hidden') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export function debounce(fn, ms) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

/** Minúsculas y sin tildes, para búsquedas tolerantes ("cafeteria" = "Cafetería"). */
export function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Resalta `query` dentro de `text` con <mark>, sin usar innerHTML. */
export function highlight(text, query) {
  const frag = document.createDocumentFragment();
  const q = fold(query).trim();
  if (!q) {
    frag.append(text);
    return frag;
  }
  // fold() conserva la longitud para el alfabeto latino habitual; si no, no resaltamos.
  const folded = fold(text);
  if (folded.length !== text.length) {
    frag.append(text);
    return frag;
  }
  let from = 0;
  let index = folded.indexOf(q, from);
  while (index !== -1) {
    frag.append(text.slice(from, index), h('mark', {}, text.slice(index, index + q.length)));
    from = index + q.length;
    index = folded.indexOf(q, from);
  }
  frag.append(text.slice(from));
  return frag;
}

export function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export function relativeTime(ts) {
  if (!ts) return '';
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'ahora mismo';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return rtf.format(Math.round(diff / (86400 * 30)), 'month');
}

const dtf = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function dateTime(ts) {
  return ts ? dtf.format(new Date(ts)) : '';
}

const df = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });
export function shortDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return df.format(new Date(y, m - 1, d));
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function stampForNote() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

const DAYS = { Mo: 'Lun', Tu: 'Mar', We: 'Mié', Th: 'Jue', Fr: 'Vie', Sa: 'Sáb', Su: 'Dom', PH: 'Festivos', SH: 'Vac. escolares' };
const MONTHS = { Jan: 'ene', Feb: 'feb', Mar: 'mar', Apr: 'abr', May: 'may', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dic' };

/** Traduce el formato opening_hours de OSM a líneas legibles en español. */
export function formatHours(raw) {
  if (!raw) return [];
  const text = raw.trim();
  if (text === '24/7') return ['Abierto 24 horas'];
  return text
    .split(/\s*;\s*|\s*\|\|\s*/)
    .filter(Boolean)
    .map((part) =>
      part
        // Meses antes que días: si no, «Tu» → «Mar» se confundiría con marzo.
        .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTHS[m])
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b/g, (d) => DAYS[d])
        .replace(/\b(off|closed)\b/gi, 'cerrado')
        .replace(/\bopen\b/gi, 'abierto')
        .replace(/\b24\/7\b/g, '24 horas')
        .replace(/(\d)-(\d)/g, '$1–$2')
        .replace(/([a-zé.])-([A-Z])/g, '$1–$2')
        .replace(/,(?=\S)/g, ', ')
        .replace(/"([^"]*)"/g, '($1)'),
    );
}

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`saturno:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`saturno:${key}`, JSON.stringify(value));
    } catch {
      /* almacenamiento no disponible: no es crítico */
    }
  },
};

export function plural(n, one, many) {
  return `${n.toLocaleString('es')} ${n === 1 ? one : many}`;
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
