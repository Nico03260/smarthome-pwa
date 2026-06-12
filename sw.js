// SmartHome PWA — Service Worker v1.0
const CACHE_NAME = 'smarthome-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/fonts/tabler-icons.woff2',
];

// Installation : mise en cache des ressources essentielles
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(OFFLINE_URLS).catch(err => {
        console.warn('[SW] Certaines ressources non cachées:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch : stratégie Cache First pour les assets, Network First pour l'API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Requêtes API Tuya → toujours réseau (pas de cache)
  if (url.hostname.includes('tuya') || url.hostname.includes('openapi')) {
    return;
  }

  // Requêtes GET → Cache First avec fallback réseau
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request).then(response => {
          // Mettre en cache les nouvelles ressources valides
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Fallback offline pour les pages HTML
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
    );
  }
});

// Notifications push (optionnel — à activer si besoin)
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Alerte SmartHome',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'SmartHome', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
