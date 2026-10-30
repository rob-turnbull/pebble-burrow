// Offline support. Bump VERSION whenever you deploy changes so phones pick them up.
const VERSION = 'pebble-burrow-v2.0.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/engine.js', './js/data.js', './js/art.js', './js/sky.js', './js/weather.js', './js/sync.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
// Live data must never come from cache.
const NETWORK_ONLY = ['api.github.com', 'gist.githubusercontent.com', 'api.open-meteo.com', 'geocoding-api.open-meteo.com', 'api.bigdatacloud.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (NETWORK_ONLY.includes(url.hostname)) return;

  // Stale-while-revalidate: open instantly from cache, refresh it in the background.
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: url.origin === location.origin });
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
    return cached || network;
  }));
});
