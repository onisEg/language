/* تحدي الـ 90 يوم — service worker
   Bump CACHE_VERSION whenever index.html changes so users pull the new build. */
const CACHE_VERSION = 'eng90-v3';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg'
];
// Optional: only cached if present in the repo.
const EXTRA = ['./icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      // cache: 'reload' bypasses the HTTP cache, so a precache can never
      // capture a stale copy that the browser is still holding.
      .then(c => c.addAll(CORE.map(u => new Request(u, {cache: 'reload'}))).then(() =>
        // A missing optional icon must not abort the whole precache.
        Promise.allSettled(EXTRA.map(u => c.add(u)))
      ))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

  // Google Fonts: serve from cache, refresh in background.
  if (isFont) {
    e.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(req).then(hit => {
          const net = fetch(req).then(res => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // The page itself: network first, so a fresh deploy wins; cache is the offline
  // fallback. cache: 'reload' skips the browser's 10-minute HTTP cache on Pages.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(new Request(req.url, {cache: 'reload', credentials: 'same-origin'}))
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  // Everything else same-origin: cache first.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
