const urlsToCache = [
  '/',
  '/styles.css',
  '/script.js',
  '/manifest.json',
  '/favicon.ico',
  '/icons-192.png',
  '/icons-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('v1').then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => caches.open('v1').then(cache => cache.put(event.request, response.clone()).then(() => response)))
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});