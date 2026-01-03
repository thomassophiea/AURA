// Service Worker for caching static assets with optimized strategies
const CACHE_NAME = 'aura-cache-v16-fixed';
const STATIC_CACHE = 'aura-static-v16';
const DYNAMIC_CACHE = 'aura-dynamic-v16';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - optimized caching strategies
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API requests (don't cache API responses here, use app-level cache instead)
  if (event.request.url.includes('/api/')) {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests (skip external URLs like Supabase)
  if (url.origin !== location.origin) {
    return;
  }

  // Stale-while-revalidate for static assets (JS, CSS, images, fonts)
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot|ico)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            // Update cache with fresh response
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((error) => {
            // If network fails and we have cache, return it
            if (cachedResponse) {
              return cachedResponse;
            }
            // Otherwise, re-throw to let the browser handle it
            throw error;
          });

          // Return cached response immediately, update in background
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Cache-first for HTML (with network fallback)
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Network-first for everything else (same-origin only)
  event.respondWith(
    fetch(request).catch((error) => {
      return caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // No cache available, re-throw to let browser handle it
        throw error;
      });
    })
  );
});
