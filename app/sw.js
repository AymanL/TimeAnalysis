// Cache the app files so the page opens and works offline. Bump CACHE with the
// version label in ui/app.js whenever files change, so an installed copy updates.
const CACHE = 'temps-0.1.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'ui/styles.css', 'ui/app.js', 'ui/dom.js', 'ui/today.js', 'ui/backfill.js', 'ui/tasks.js', 'ui/settings.js', 'ui/viewmodel.js',
  'core/time.js', 'core/lifecycle.js', 'core/settings.js', 'core/timeline.js', 'core/store.js', 'core/tasks.js', 'core/export.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first, so a new version shows up as soon as the phone is online; cache when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
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
