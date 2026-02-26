const CACHE_NAME = 'portfolio-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/dca');
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy for API calls, cache-first for assets
  if (event.request.url.includes('/api/') || event.request.url.includes('/auth/')) {
    return; // Let network handle API requests
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetching = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetching;
    })
  );
});
