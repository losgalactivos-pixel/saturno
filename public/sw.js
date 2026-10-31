// Service worker mínimo: permite instalar la app y abrir la interfaz sin red.
// Estrategia "red primero" para que siempre se vea la última versión.
// No intercepta la API local ni las peticiones a OpenStreetMap.
const CACHE = 'saturno-shell-v3';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/splash.js', 'manifest.webmanifest',
  'icons/saturno.svg', 'icons/icon-192.png', 'favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html'))),
  );
});
