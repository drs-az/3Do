const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `three-slot-cache-${CACHE_VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k!==CACHE_NAME ? caches.delete(k) : null)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request; if(req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)); return res;
    }).catch(()=> caches.match('index.html')))
  );
});

self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'CLEAR_CACHE'){
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => caches.open(CACHE_NAME))
        .then(cache => cache.addAll(CORE_ASSETS))
        .then(() => event.ports[0] && event.ports[0].postMessage('UPDATED'))
    );
  }
});
