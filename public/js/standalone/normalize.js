// Port a JavaScript de saturno/normalize.py y saturno/taxonomy.py para el modo
// sin servidor. Las tablas vienen de taxonomy.js (generado desde Python);
// aquí solo está la lógica, que debe comportarse igual que la de Python.
import { TAXONOMY as T } from './taxonomy.js';

const KEYS = T.keys.map((k) => ({ key: k.key, table: k.table, excluded: k.excluded === null ? null : new Set(k.excluded) }));
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const WORD = /^[\p{L}\p{N}_.-]+(\/[\p{L}\p{N}_.-]+)*$/u;

export function classify(tags) {
  if (tags.disused === 'yes' || tags.opening_hours === 'closed') return null;
  for (const { key, table, excluded } of KEYS) {
    let value = tags[key];
    if (!value) continue;
    value = value.split(';')[0].trim();
    if (has(table, value)) {
      const [category, label] = table[value];
      if (key === 'shop' && value === 'hairdresser' && (tags.hairdresser === 'barber' || (tags.male === 'yes' && tags.female === 'no'))) {
        return [category, 'Barbería'];
      }
      return [category, label];
    }
    if (excluded === null) continue;
    if (excluded.has(value)) return null;
    if (has(T.fallback, key)) {
      const [category, label] = T.fallback[key];
      if (['shop', 'craft', 'office'].includes(key) && value !== 'yes') return [category, `${label} · ${value.replaceAll('_', ' ')}`];
      return [category, label];
    }
  }
  return null;
}

export function cuisineLabel(tags) {
  if (!tags.cuisine) return null;
  const parts = [];
  for (let value of tags.cuisine.split(';')) {
    value = value.trim().toLowerCase();
    if (value && has(T.cuisine, value) && !parts.includes(T.cuisine[value])) parts.push(T.cuisine[value]);
  }
  return parts.slice(0, 3).join(' · ') || null;
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** URL http(s) válida o null (nunca javascript:, data:...). Igual que safe_url() en Python. */
export function safeUrl(value) {
  if (!value) return null;
  let v = value.trim();
  if (!v || /\s/.test(v) || v.length > 500) return null;
  if (v.toLowerCase().startsWith('www.')) v = `https://${v}`;
  else if (!v.includes('://') && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(v)) v = `https://${v}`;
  const parts = parseUrl(v);
  if (!parts || !['http:', 'https:'].includes(parts.protocol) || !parts.hostname) return null;
  return v;
}

function hostOf(url) {
  let host = (parseUrl(url)?.hostname || '').toLowerCase();
  for (const prefix of ['www.', 'm.', 'mobile.', 'es-es.', 'es.', 'web.']) {
    if (host.startsWith(prefix)) host = host.slice(prefix.length);
  }
  return host;
}

function matchHost(host, table) {
  if (!host) return null;
  const labels = host.split('.');
  for (const [key, value] of Object.entries(table)) {
    if (key.includes('.')) {
      if (host === key || host.endsWith(`.${key}`)) return value;
    } else if (labels.includes(key)) return value;
  }
  return null;
}

function socialUrl(network, rawValue) {
  const raw = rawValue.trim();
  if (!raw) return null;
  const url = safeUrl(raw);
  if (url && (parseUrl(url)?.hostname || '').includes('.') && (raw.toLowerCase().startsWith('http') || raw.toLowerCase().startsWith('www.') || raw.includes('/'))) {
    return url;
  }
  const handle = raw.replace(/^@+/, '').replace(/^\/+|\/+$/g, '');
  if (!WORD.test(handle) && network !== 'whatsapp') return null;
  switch (network) {
    case 'facebook': return `https://www.facebook.com/${handle}`;
    case 'instagram': return `https://www.instagram.com/${handle}`;
    case 'tiktok': return `https://www.tiktok.com/@${handle}`;
    case 'twitter': return `https://x.com/${handle}`;
    case 'youtube': return handle.includes('/') ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/@${handle}`;
    case 'linkedin': return `https://www.linkedin.com/company/${handle}`;
    case 'whatsapp': {
      const digits = raw.replace(/\D/g, '');
      return digits.length >= 8 ? `https://wa.me/${digits}` : null;
    }
    case 'telegram': return `https://t.me/${handle}`;
    case 'pinterest': return `https://www.pinterest.com/${handle}`;
    default: return null;
  }
}

export function extractPhones(tags) {
  const phones = [];
  const seen = new Set();
  for (const key of T.phoneKeys) {
    const raw = tags[key];
    if (!raw) continue;
    for (let part of raw.split(/\s*(?:;|,|\s\/\s)\s*/)) {
      part = part.trim();
      if ((part.match(/\d/g) || []).length < 6) continue;
      let tel = part.replace(/[^\d+]/g, '');
      if (tel.startsWith('00')) tel = `+${tel.slice(2)}`;
      if (tel) tel = tel[0] + tel.slice(1).replaceAll('+', '');
      const digits = tel.replace(/^\++/, '');
      const fingerprint = digits.slice(-9);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const national = digits.startsWith('34') && digits.length === 11 ? digits.slice(2) : digits;
      const spanish = (tel.startsWith('+34') && digits.length === 11) || (!tel.startsWith('+') && digits.length === 9);
      phones.push({ display: part, tel, mobile: Boolean(spanish && ['6', '7'].includes(national.slice(0, 1))) });
    }
  }
  return phones;
}

export function analyzeWeb(tags) {
  const own = [];
  const social = new Map();
  const listings = [];
  const addSocial = (network, url) => {
    if (!social.has(network)) social.set(network, { network, label: T.socialNetworks[network], url });
  };
  for (const key of T.webKeys) {
    for (const value of (tags[key] || '').split(/\s*;\s*/)) {
      const url = safeUrl(value);
      if (!url) continue;
      const host = hostOf(url);
      const network = matchHost(host, T.socialHosts);
      if (network) {
        addSocial(network, url);
        continue;
      }
      const listing = matchHost(host, T.listingHosts);
      if (listing) {
        if (listings.every((l) => l.url !== url)) listings.push({ label: listing, url });
        continue;
      }
      if (!own.includes(url)) own.push(url);
    }
  }
  for (const [network, keys] of Object.entries(T.socialTags)) {
    for (const key of keys) {
      for (const value of (tags[key] || '').split(/\s*;\s*/)) {
        const url = value ? socialUrl(network, value) : null;
        if (url) addSocial(network, url);
      }
    }
  }
  const status = own.length ? 'own' : social.size || listings.length ? 'social' : 'none';
  return { status, own, social: [...social.values()], listings };
}

function address(tags) {
  const street = tags['addr:street'] || tags['addr:place'];
  const number = tags['addr:housenumber'];
  if (street && number) return `${street}, ${number}`;
  if (street) return street;
  return tags['addr:full'] || null;
}

const round6 = (n) => (typeof n === 'number' ? Math.round(n * 1e6) / 1e6 : null);

/** Devuelve [ficha | null, motivo] con motivo: ok, no_business, no_phone, own_website. */
export function normalizeElement(element) {
  const tags = element.tags || {};
  const classified = classify(tags);
  if (!classified) return [null, 'no_business'];
  const phones = extractPhones(tags);
  if (!phones.length) return [null, 'no_phone'];
  const web = analyzeWeb(tags);
  if (web.status === 'own') return [null, 'own_website'];

  const kind = element.type || 'node';
  const center = element.center || {};
  const lat = 'lat' in element ? element.lat : center.lat;
  const lon = 'lat' in element ? element.lon : center.lon;
  const email = (tags.email || tags['contact:email'] || '').split(';')[0].trim();
  const name = tags.name || tags.brand || null;
  const chain = tags.brand || (tags['brand:wikidata'] ? name || 'Cadena' : null);
  const [category, type] = classified;
  return [{
    id: `${kind[0]}${element.id}`,
    osmUrl: `https://www.openstreetmap.org/${kind}/${element.id}`,
    name,
    category,
    type,
    detail: cuisineLabel(tags),
    address: address(tags),
    postcode: tags['addr:postcode'] || null,
    locality: tags['addr:city'] || null,
    lat: round6(lat),
    lon: round6(lon),
    phones,
    hours: tags.opening_hours || null,
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
    social: web.social,
    listings: web.listings,
    webStatus: web.status,
    chain,
  }, 'ok'];
}

export function normalizeElements(elements) {
  const items = [];
  const stats = { withPhone: 0, ownWebsite: 0, withoutWebsite: 0, socialOnly: 0, chains: 0 };
  const seen = new Set();
  for (const element of elements) {
    if (!['node', 'way', 'relation'].includes(element.type)) continue;
    const [item, reason] = normalizeElement(element);
    if (reason === 'ok' || reason === 'own_website') stats.withPhone += 1;
    if (reason === 'own_website') stats.ownWebsite += 1;
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    stats.withoutWebsite += 1;
    if (item.webStatus === 'social') stats.socialOnly += 1;
    if (item.chain) stats.chains += 1;
  }
  const key = (i) => (i.name || '~').toLowerCase();
  items.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { items, stats };
}
