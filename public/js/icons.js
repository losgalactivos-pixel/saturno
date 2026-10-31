// Iconos de trazo (24×24) dibujados para Saturno. Se generan como SVG en el DOM.
const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  search: ['c:11,11,7', 'M16.5 16.5 21 21'],
  phone: ['M5.5 3.5h3l1.8 4.6-2.3 1.5a11.5 11.5 0 0 0 6.4 6.4l1.5-2.3 4.6 1.8v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.7a2 2 0 0 1 2-2.2z'],
  pin: ['M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z', 'c:12,9,2.5'],
  clock: ['c:12,12,9', 'M12 7v5l3.2 2'],
  x: ['M6 6l12 12M18 6 6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  checkCircle: ['c:12,12,9', 'M8 12.4l2.8 2.8L16.2 9.6'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  arrowLeft: ['M19 12H5', 'M11 6l-6 6 6 6'],
  sliders: ['M4 7h9', 'M17 7h3', 'c:15,7,2', 'M4 17h3', 'M11 17h9', 'c:9,17,2'],
  refresh: ['M20 11.5A8 8 0 1 0 17.7 17', 'M20 4.5v7h-7'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  directions: ['M3.5 11 20.5 3.5 13 20.5l-2-7.5z'],
  map: ['M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z', 'M9 4v14', 'M15 6v14'],
  note: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 13h7', 'M9 17h5'],
  plus: ['M12 5v14M5 12h14'],
  trash: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  upload: ['M12 20V9', 'M7 14l5-5 5 5', 'M5 4h14'],
  globe: ['c:12,12,9', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'],
  globeOff: ['M5.6 5.6A9 9 0 0 0 18.4 18.4M8 3.9A9 9 0 0 1 20.1 16', 'M3 12h9M16 12h5', 'M12 3c1.5 1.6 2.6 3.6 3.1 5.8', 'M3 3l18 18'],
  alert: ['M12 3.5 21.5 20h-19z', 'M12 10v4.5', 'M12 17.5v.01'],
  info: ['c:12,12,9', 'M12 11v5.5', 'M12 7.8v.01'],
  inbox: ['M3 13l3-8h12l3 8v6H3z', 'M3 13h5l1 3h6l1-3h5'],
  calendar: ['r:4,5,16,15,2', 'M8 3v4M16 3v4M4 10h16'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5', 'M3.5 3.5v5h5', 'M12 7.5v5l3 2'],
  utensils: ['M6 3v6a3 3 0 0 0 6 0V3', 'M9 3v18', 'M18 21V3c-2.5 1-3.5 4-3.5 8.5H18'],
  coffee: ['M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z', 'M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16', 'M8 3.5v2.5M12 3.5v2.5'],
  scissors: ['c:6.5,7,2.5', 'c:6.5,17,2.5', 'M8.6 8.4 20 18', 'M8.6 15.6 20 6'],
  stethoscope: ['M6 3.5v5.5a5 5 0 0 0 10 0V3.5', 'M11 14v1.5a4.5 4.5 0 0 0 9 0V13', 'c:20,11,2'],
  bag: ['M5 8h14l-1 13H6z', 'M9 8V6.5a3 3 0 0 1 6 0V8'],
  basket: ['M3 10h18l-2 10H5z', 'M8 10l3-6', 'M16 10l-3-6', 'M9 14v3M15 14v3'],
  car: ['M4 16.5V12l2.2-5.2A1.5 1.5 0 0 1 7.6 6h8.8a1.5 1.5 0 0 1 1.4.8L20 12v4.5z', 'M4 12h16', 'M6.5 16.5v2.5M17.5 16.5v2.5', 'M7.5 14.2h.01M16.5 14.2h.01'],
  bed: ['M3 19V6', 'M3 15h18v4', 'M21 15v-2.5a3 3 0 0 0-3-3h-7V15', 'c:7,11.5,1.6'],
  dumbbell: ['M6.5 7v10M17.5 7v10', 'M3.5 9.5v5M20.5 9.5v5', 'M6.5 12h11'],
  briefcase: ['r:3,7,18,13,2', 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M3 12.5h18'],
  book: ['M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z', 'M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3'],
  dots: ['M6 12h.01M12 12h.01M18 12h.01'],
  mail: ['r:3,5,18,14,2', 'M3.5 7 12 13l8.5-6'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  copy: ['r:8,8,12,12,2', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'],
  flag: ['M5 21V4', 'M5 4h12l-2.5 4.5L17 13H5'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  list: ['M9 6h11M9 12h11M9 18h11', 'M4.5 6h.01M4.5 12h.01M4.5 18h.01'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'],
  facebook: ['M14.5 8.5H16V5h-2a4 4 0 0 0-4 4v2.5H8V15h2v6h3.5v-6H16l.5-3.5h-3V9.3a.8.8 0 0 1 .8-.8z'],
  instagram: ['r:3.5,3.5,17,17,5', 'c:12,12,4', 'M17.3 6.7h.01'],
  tiktok: ['M14 3.5V15a3.5 3.5 0 1 1-3.5-3.5', 'M14 3.5c.4 2.6 2.4 4.6 5.5 5'],
  twitter: ['M4.5 4h4L19.5 20h-4z', 'M19 4l-6 6.8', 'M5 20l6-6.8'],
  youtube: ['r:2.5,6,19,12,4', 'M10.5 9.5v5l4.2-2.5z'],
  linkedin: ['r:3.5,3.5,17,17,3', 'M8 10.5V16.5', 'M8 7.5v.01', 'M11.5 16.5v-6', 'M11.5 13a2.5 2.5 0 0 1 5 0v3.5'],
  whatsapp: ['M4 20l1.2-3.8A8.2 8.2 0 1 1 8 19z', 'M9.3 8.8c0 3.2 2.7 5.9 5.9 5.9l.9-1.6-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z'],
  telegram: ['M20.5 4.5 3.5 11l5.5 2 2 5.5 3-3.8 4.5 3.3z', 'M9 13l11.5-8.5'],
  pinterest: ['c:12,12,9', 'M11 20l1.7-8.5', 'M10 13.5c-.8-.6-1.2-1.5-1.2-2.6A3.6 3.6 0 0 1 12.6 7c2 0 3.4 1.4 3.4 3.4 0 2.4-1.3 4.4-3 4.4-.9 0-1.5-.7-1.3-1.5'],
};

/** Devuelve un <svg> con el icono `name`. */
export function icon(name, { size = 18, label, className = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon ${className}`.trim());
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.setAttribute('focusable', 'false');
  for (const spec of PATHS[name] || PATHS.dots) {
    let node;
    if (spec.startsWith('c:')) {
      const [cx, cy, r] = spec.slice(2).split(',');
      node = document.createElementNS(SVG_NS, 'circle');
      node.setAttribute('cx', cx);
      node.setAttribute('cy', cy);
      node.setAttribute('r', r);
    } else if (spec.startsWith('r:')) {
      const [x, y, w, hgt, rx] = spec.slice(2).split(',');
      node = document.createElementNS(SVG_NS, 'rect');
      node.setAttribute('x', x);
      node.setAttribute('y', y);
      node.setAttribute('width', w);
      node.setAttribute('height', hgt);
      node.setAttribute('rx', rx);
    } else {
      node = document.createElementNS(SVG_NS, 'path');
      node.setAttribute('d', spec);
    }
    svg.append(node);
  }
  return svg;
}

/** Logo de Saturno en línea (mismo diseño que /icons/saturno.svg). */
export function logo(size = 32) {
  const img = document.createElement('img');
  img.src = 'icons/saturno.svg';
  img.alt = '';
  img.width = size;
  img.height = size;
  img.className = 'logo';
  return img;
}
