// Service worker: de app werkt ook zonder bereik langs het veld.
// Verhoog VERSION bij elke nieuwe versie, dan halen telefoons de nieuwe bestanden op.
const VERSION = 'coach-v0.2.0';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'vendor/preact-htm.js',
  'js/app.js',
  'js/store.js',
  'js/planner.js',
  'js/match.js',
  'js/ui.js',
  'js/screens/home.js',
  'js/screens/live.js',
  'js/screens/plan.js',
  'js/screens/afloop.js',
  'js/screens/seizoen.js',
  'js/screens/team.js',
  'js/screens/spelers.js',
  'fonts/nunito-latin-500-normal.woff2',
  'fonts/nunito-latin-600-normal.woff2',
  'fonts/nunito-latin-700-normal.woff2',
  'fonts/nunito-latin-800-normal.woff2',
  'fonts/nunito-latin-900-normal.woff2',
  'fonts/inter-latin-600-normal.woff2',
  'fonts/inter-latin-700-normal.woff2',
  'fonts/inter-latin-800-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
