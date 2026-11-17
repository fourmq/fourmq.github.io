const CACHE_NAME = 'cantilena-v48'; // <-- Версия обновлена
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/tasks.js',
  './js/surveys.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
  e.waitUntil(caches.keys().then((keys) => {
    return Promise.all(keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); }));
  }));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
