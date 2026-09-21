// ═══════════════════════════════════════════════════════════════
// Void Matrix Cipher — Service Worker
// Strategy:
//   navigations → network-first (so updates always land)
//   same-origin → stale-while-revalidate
// Every asset the app uses is same-origin now: the QR library and both
// web fonts used to be fetched from CDNs and are vendored, so there is
// no cross-origin case left to handle.
// Bump BUILD in version.js on every deploy. That is the only required step.
// ═══════════════════════════════════════════════════════════════

// The build number lives in version.js so the cache key, the on-screen
// version stamp and the dossier header cannot drift apart. Bumping that one
// line is the whole deploy ritual.
importScripts('./version.js');
const BUILD = self.VMC_BUILD;
const CACHE = `vmc-${BUILD}`;

// The complete app shell. All of it is required and all of it is local.
const ASSETS = [
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
  './fonts.css',
  './fonts/vt323-latin-400-normal.woff2',
  './fonts/share-tech-mono-latin-400-normal.woff2',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// ── INSTALL ────────────────────────────────────────────────────
// No skipWaiting(). The new worker waits until the page tells it to
// activate, which lets the app show a "NEW BUILD" prompt instead of
// swapping the app out from under someone mid-message.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Every asset is required, so report the ones that did not make it.
    // allSettled used to swallow these silently, which is how the app
    // shipped for several builds referencing two icons that did not exist.
    const results = await Promise.allSettled(ASSETS.map(u => cache.add(u)));
    const missing = ASSETS.filter((u, i) => results[i].status === 'rejected');
    if (missing.length) {
      console.error('[vmc sw] precache failed for required assets:', missing);
    }
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

  // Nothing cross-origin is part of the app any more. Anything that shows
  // up here from elsewhere is left to the network untouched.
  if (new URL(req.url).origin !== self.location.origin) return;

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
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && res.status === 200) cachePut(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504 });
  })());
});

function cachePut(req, res) {
  caches.open(CACHE).then(c => c.put(req, res)).catch(() => {});
}
