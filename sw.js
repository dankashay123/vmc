// ═══════════════════════════════════════════════════════════════
// Void Matrix Cipher — Service Worker
// Strategy:
//   navigations      → network-first (so updates always land)
//   same-origin      → stale-while-revalidate
//   cross-origin fonts → cache-first, refreshed in background
// Bump BUILD on every deploy. That is the only required step.
// ═══════════════════════════════════════════════════════════════

// The build number lives in version.js so the cache key, the on-screen
// version stamp and the dossier header cannot drift apart. Bumping that one
// line is the whole deploy ritual.
importScripts('./version.js');
const BUILD = self.VMC_BUILD;
const CACHE = `vmc-${BUILD}`;

// App shell. Local assets are required; CDN assets are best-effort.
const LOCAL_ASSETS = [
  './',
  './index.html',
  './cipher.html',
  './how-it-works.html',
  './about.html',
  './tokens.css',
  './style.css',
  './cipher.css',
  './version.js',
  './site.js',
  './hero-rain.js',
  './cipher.js',
  './qrcode.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Fonts only. The QR library used to live here; it is vendored now, so it
// is a required local asset and no longer best-effort.
const REMOTE_ASSETS = [
  'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap'
];

// ── INSTALL ────────────────────────────────────────────────────
// No skipWaiting(). The new worker waits until the page tells it to
// activate, which lets the app show a "NEW BUILD" prompt instead of
// swapping the app out from under someone mid-message.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Local assets are required, so report the ones that did not make it.
    // allSettled used to swallow these silently, which is how the app
    // shipped for several builds referencing two icons that did not exist.
    const local = await Promise.allSettled(LOCAL_ASSETS.map(u => cache.add(u)));
    const missing = LOCAL_ASSETS.filter((u, i) => local[i].status === 'rejected');
    if (missing.length) {
      console.error('[vmc sw] precache failed for required assets:', missing);
    }
    // Remote assets stay best-effort: no network on first load is normal.
    await Promise.allSettled(REMOTE_ASSETS.map(u => cache.add(u)));
  })());
});

// ── ACTIVATE ───────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

// ── MESSAGE ────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'GET_BUILD' && e.source) e.source.postMessage({ build: BUILD });
});

// ── FETCH ──────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations: network first. This is what makes deploys reachable.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        if (preload) { cachePut(req, preload.clone()); return preload; }
        const fresh = await fetch(req);
        cachePut(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached
            || await caches.match('./cipher.html')
            || new Response('Offline and not cached.', {
                 status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Same-origin assets: serve cache immediately, refresh behind it.
  if (sameOrigin) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const network = fetch(req).then(res => {
        if (res && res.status === 200) cachePut(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || new Response('', { status: 504 });
    })());
    return;
  }

  // Cross-origin (fonts only): cache first, refresh quietly.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      fetch(req).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) cachePut(req, res.clone());
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && (res.status === 200 || res.type === 'opaque')) cachePut(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});

function cachePut(req, res) {
  caches.open(CACHE).then(c => c.put(req, res)).catch(() => {});
}
