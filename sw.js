// Void Matrix Cipher — Service Worker
// Caches the app shell for full offline use

const CACHE = 'vmc-v1';

// Everything needed to run offline
const ASSETS = [
  './void_matrix_cipher.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// Install: cache everything
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cache local assets strictly, external ones best-effort
      return cache.addAll([
        './void_matrix_cipher.html',
        './manifest.json'
      ]).then(() => {
        // Best-effort for CDN assets
        return Promise.allSettled(
          ['https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
           'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap']
          .map(url => cache.add(url).catch(() => {}))
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first, fall back to network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful GET responses
        if(e.request.method === 'GET' && response.status === 200){
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // If completely offline and not cached, return the main app
        if(e.request.mode === 'navigate'){
          return caches.match('./void_matrix_cipher.html');
        }
      });
    })
  );
});
