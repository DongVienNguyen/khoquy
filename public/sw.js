const CACHE_VERSION = 'v2';
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-192x192-maskable.png',
  '/icons/icon-512x512.png',
  '/icons/icon-512x512-maskable.png',
  '/apple-touch-icon-180x180.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  const currentCaches = [PRECACHE, RUNTIME];
  event.waitUntil(
    (async () => {
      // Bật navigation preload nếu hỗ trợ
      if (self.registration && self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_e) {}
      }
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Chỉ xử lý GET
  if (request.method !== 'GET') return;

  // Bypass Supabase và API Next
  if (url.origin.includes('supabase.co') || url.pathname.startsWith('/api')) return;

  // Navigation: ưu tiên preload/network, fallback offline.html
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = event.preloadResponse ? await event.preloadResponse : null;
        if (preload) return preload;
        return await fetch(request);
      } catch (_e) {
        return await caches.match('/offline.html');
      }
    })());
    return;
  }

  // Ảnh/icon: cache-first
  if (/\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME).then((cache) =>
        cache.match(request).then((response) => {
          if (response) return response;
          return fetch(request).then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        })
      )
    );
    return;
  }

  // CSS/JS: stale-while-revalidate
  if (/\.(?:css|js)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME).then((cache) =>
        cache.match(request).then((response) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
          return response || fetchPromise;
        })
      )
    );
    return;
  }

  // Mặc định: network-first, fallback cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});