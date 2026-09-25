const CACHE = 'botlr-automation-v4.5.3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/images/botlr.png',
  '/images/botlr_face.png',
  '/images/botlr_working.png',
  '/images/botlr_app_logo.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)),
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE)
          .map(cacheName => caches.delete(cacheName)),
      ),
    ),
  );

  self.clients.claim();
});

/** Shares the active cache name so the dashboard can display its version. */
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_CACHE_VERSION') {
    event.source?.postMessage({ type: 'CACHE_VERSION', cacheName: CACHE });
  }
});

self.addEventListener('fetch', event => {
  if (new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    }),
  );
});
