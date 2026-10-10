/* Minimal offline shell for Home Screen installs */

// Bumping this name purges every older cache in `activate` below. Bump it when
// changing caching behaviour so devices holding bad entries recover on their
// own — v1 cached Supabase API responses and served them cache-first forever.
const CACHE = 'tetris-v2';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch cross-origin traffic. Supabase reads are plain GETs, so the
  // old catch-all cache-first rule pinned leaderboards/profiles to whatever
  // the device saw first — re-running migrations could never change the UI.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, cache only as an offline fallback. Cache-first
  // here meant a stale index.html kept pointing at a deleted JS bundle hash,
  // so new deploys never reached an installed PWA.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Static same-origin assets. Vite fingerprints these, so a cache hit is
  // always the right content for that URL; revalidate in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
