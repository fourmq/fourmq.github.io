const CACHE_NAME = 'cantilena-v64'; // <-- Версия обновлена
const ASSETS = ['click.mp3','timer-start.mp3','timer-end.mp3',
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
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (url.includes('supabase.co') || url.includes('/auth/') || e.request.headers.get('range')) return;
  if (url.includes('.mp3') && e.request.headers.get('range')) return;
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.status === 206 || !response.ok) return response;
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
