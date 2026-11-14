const CACHE_NAME = 'cantilena-v4'; // <-- Меняйте цифру при каждом обновлении!

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Заставляет браузер сразу принять новые файлы
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim()); // Захватывает контроль над страницей
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
