const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PAGE_CACHE = `pages-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/theme.css',
  '/ui-feedback.js',
  '/pwa-register.js',
  '/manifest.webmanifest',
  '/offline.html',
  '/assets/endtimes-logo-navbar.svg',
  '/assets/icons/icon-192.svg',
  '/assets/icons/icon-512.svg'
];

const SENSITIVE_PREFIXES = [
  '/admin',
  '/member',
  '/account-recovery',
  '/api/',
  '/.netlify/functions/'
];

function isSensitivePath(pathname) {
  return SENSITIVE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function shouldCacheResponse(response) {
  if (!response || response.status !== 200 || response.type === 'opaque') {
    return false;
  }

  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/no-store|private/i.test(cacheControl);
}

async function refreshCachedRequest(cache, request) {
  try {
    const networkResponse = await fetch(request, { cache: 'reload' });
    if (shouldCacheResponse(networkResponse)) {
      await cache.put(request, networkResponse.clone());
      return;
    }
    await cache.delete(request);
  } catch {
    // Keep existing cached version when network refresh fails.
  }
}

async function refreshCacheContents(cacheName) {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  await Promise.all(requests.map((request) => refreshCachedRequest(cache, request)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => Promise.resolve())
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![STATIC_CACHE, PAGE_CACHE, ASSET_CACHE].includes(key))
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  const pathname = url.pathname;
  if (isSensitivePath(pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (shouldCacheResponse(networkResponse)) {
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        const offlinePage = await caches.match('/offline.html');
        return offlinePage || Response.error();
      }
    })());
    return;
  }

  const isStaticAsset = ['style', 'script', 'image', 'font'].includes(request.destination);

  if (isStaticAsset) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }

      const networkResponse = await fetch(request);
      if (shouldCacheResponse(networkResponse)) {
        const cache = await caches.open(ASSET_CACHE);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })());
    return;
  }

  event.respondWith(fetch(request));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PWA_REFRESH_CACHE') {
    return;
  }

  event.waitUntil((async () => {
    try {
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(PRECACHE_URLS);
      await Promise.all([
        refreshCacheContents(PAGE_CACHE),
        refreshCacheContents(ASSET_CACHE)
      ]);
      event.ports[0]?.postMessage({ ok: true });
    } catch (error) {
      event.ports[0]?.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to refresh cache.'
      });
    }
  })());
});
