/**
 * Service Worker with Version-Based Cache Invalidation
 *
 * This service worker:
 * 1. Deletes ALL caches on activation (clean slate on every deploy)
 * 2. Claims all clients immediately
 * 3. Uses network-first strategy for HTML to ensure fresh content
 * 4. Uses stale-while-revalidate for hashed static assets
 */

// Cache version - increment this on every deploy to force cache invalidation
// This should match CACHE_VERSION in versionGate.ts
const CACHE_VERSION = 19;
const CACHE_NAME = `aura-cache-v${CACHE_VERSION}`;
const STATIC_CACHE = `aura-static-v${CACHE_VERSION}`;

// Minimal list - don't cache HTML, let it always be fetched fresh
const STATIC_ASSETS = [
  '/manifest.json',
];

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing v${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - DELETE ALL CACHES and claim clients
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating v${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        console.log(`[SW] Found ${cacheNames.length} cache(s)`);
        // Delete ALL caches that don't match current version
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!cacheName.includes(`v${CACHE_VERSION}`)) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
            return Promise.resolve();
          })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
      .then(() => {
        // Notify all clients that the service worker has updated
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'SW_ACTIVATED',
              version: CACHE_VERSION,
            });
          });
        });
      })
  );
});

// Fetch event - optimized caching strategies
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests (API calls, Supabase, etc.)
  if (url.origin !== location.origin) {
    return;
  }

  // Skip API requests - these should never be cached by SW
  if (url.pathname.includes('/api/') || url.pathname.includes('/v1/')) {
    return;
  }

  // NETWORK-FIRST for HTML - always try to get fresh HTML
  // This ensures users get the latest index.html with new asset hashes
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache HTML - let browser handle with no-store headers
          return response;
        })
        .catch(() => {
          // Only use cache as absolute fallback (offline)
          return caches.match(request).then(
            (cached) => cached || new Response('App offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        })
    );
    return;
  }

  // Stale-while-revalidate for hashed static assets (JS, CSS with hash in filename)
  // These files are immutable once deployed
  if (url.pathname.match(/\.[a-f0-9]{8,}\.(js|css)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse || new Response('', { status: 503 }));

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for other static assets (images, fonts)
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot|ico|webp)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse || new Response('', { status: 503 }));

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Network-first for everything else
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((cached) => cached || new Response('Network error', { status: 503 }))
    )
  );
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    console.log('[SW] Received CLEAR_ALL_CACHES message');
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[SW] Clearing cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      event.source.postMessage({
        type: 'CACHES_CLEARED',
        version: CACHE_VERSION,
      });
    });
  }
});
