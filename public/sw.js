// Bump cache version để ép cập nhật SW
const CACHE_VERSION = 'v5';
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
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(PRECACHE_URLS);
      // Cập nhật SW ngay sau khi cài đặt
      await self.skipWaiting();
    })()
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
      // Nhận quyền điều khiển ngay
      await self.clients.claim();
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

  // Utility: chỉ cache phản hồi hợp lệ (tránh redirect)
  const putIfCacheable = async (cache, req, resp) => {
    try {
      if (resp && resp.ok && !resp.redirected && (resp.type === 'basic' || resp.type === 'default')) {
        await cache.put(req, resp.clone());
      }
    } catch (_e) {}
  };

  // Navigation: network-first, không trả về response.redirected; fallback offline.html
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      try {
        const preload = event.preloadResponse ? await event.preloadResponse : null;
        if (preload && !preload.redirected && !(preload.status >= 300 && preload.status < 400)) {
          return preload;
        }
        const net = await fetch(request);
        if (net && (net.redirected || (net.status >= 300 && net.status < 400))) {
          try {
            const direct = await fetch(net.url, { credentials: 'include', cache: 'no-store' });
            if (direct.ok && !direct.redirected && !(direct.status >= 300 && direct.status < 400)) {
              return direct;
            }
          } catch (_e) {}
          const offline = await caches.match('/offline.html');
          return offline || new Response('<h1>Offline</h1>', { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
        return net;
      } catch (_e) {
        const offline = await caches.match('/offline.html');
        return offline || new Response('<h1>Offline</h1>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // Ảnh/icon: cache-first (chỉ cache phản hồi hợp lệ)
  if (/\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME).then((cache) =>
        cache.match(request).then((response) => {
          if (response) return response;
          return fetch(request).then(async (networkResponse) => {
            await putIfCacheable(cache, request, networkResponse);
            return networkResponse;
          });
        })
      )
    );
    return;
  }

  // CSS/JS: stale-while-revalidate (chỉ cache phản hồi hợp lệ)
  if (/\.(?:css|js)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME).then((cache) =>
        cache.match(request).then((response) => {
          const fetchPromise = fetch(request).then(async (networkResponse) => {
            await putIfCacheable(cache, request, networkResponse);
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