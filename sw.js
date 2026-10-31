// Offline support. Bump VERSION whenever you deploy changes so phones pick them up.
const VERSION = 'pebble-burrow-v3.11.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/engine.js', './js/data.js', './js/art.js', './js/sky.js', './js/weather.js', './js/sync.js', './js/seasons.js', './js/helper.js', './js/personality.js', './js/sound.js', './js/games.js', './js/room.js', './js/post.js', './js/life.js', './js/conditions.js', './js/outfits.js', './js/diary.js', './js/friends.js', './js/garden.js', './js/visitors.js', './js/photo.js',
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
  // only cache the app itself and its fonts; everything else (sync, weather, your helper) goes straight to the network
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (NETWORK_ONLY.includes(url.hostname) || (url.origin !== location.origin && !fonts)) return;

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

// Nudges from your helper. Payload: {title, body, tag}
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'pebble burrow', {
    body: d.body || 'someone on the hill is thinking about you.',
    tag: d.tag || 'pebble-burrow', renotify: true,
    icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { url: './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow(self.registration.scope);
  }));
});
