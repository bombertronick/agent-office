/*
 * Service worker dell'Agent Office.
 *
 * Prima la RETE, cache solo come riserva quando si è offline: così un rilascio
 * arriva al telefono al primo ricaricamento, senza restare bloccati sul codice
 * vecchio. Solo three.js (vendor/) si serve prima dalla cache: pesa 700 KB e
 * non cambia mai fra un rilascio e l'altro. Le API (/api/) non si toccano.
 */
const CACHE = 'agent-office-v2';
const PRECARICA = [
  './', './index.html', './assets/ui.css', './icona.svg', './manifest.webmanifest',
  './src/main.js', './src/config.js', './src/store.js', './src/orchestrator.js', './src/backends.js', './src/ui.js',
  './src/three/world.js', './src/three/office.js', './src/three/character.js', './src/three/utils.js',
  './vendor/three.module.min.js', './vendor/three.core.min.js', './vendor/controls/OrbitControls.js',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECARICA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((chiavi) => Promise.all(chiavi.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const { request } = ev;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;          // API di terzi, GitHub, ecc.
  if (url.pathname.includes('/api/')) return;                // il relè non si mette mai in cache

  const primaCache = url.pathname.includes('/vendor/');
  ev.respondWith(primaCache ? cachePoiRete(request) : retePoiCache(request));
});

async function retePoiCache(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresca = await fetch(request);
    if (fresca.ok) cache.put(request, fresca.clone()).catch(() => {});
    return fresca;
  } catch {
    const salvata = await cache.match(request);
    if (salvata) return salvata;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw new Error('offline e non in cache');
  }
}

async function cachePoiRete(request) {
  const cache = await caches.open(CACHE);
  const salvata = await cache.match(request);
  if (salvata) return salvata;
  const fresca = await fetch(request);
  if (fresca.ok) cache.put(request, fresca.clone()).catch(() => {});
  return fresca;
}
