const CACHE_VERSION = 'v3';
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
  '/assets/gematria-logo-navbar.svg',
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
  if (SENSITIVE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return true;
  }
  // Site adaptation guides are served by an auth-gated function; never cache them.
  if (pathname.endsWith('-site-adaptation-guide.html')) {
    return true;
  }
  return false;
}

function shouldCacheResponse(response) {
  if (!response || response.status !== 200 || response.type === 'opaque') {
    return false;
  }

  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/no-store|private/i.test(cacheControl);
}

async function navigationFallback(request) {
  const directMatch = await caches.match(request);
  if (directMatch) {
    return directMatch;
  }

  const appShell = await caches.match('/index.html');
  if (appShell) {
    return appShell;
  }

  const offlinePage = await caches.match('/offline.html');
  return offlinePage || Response.error();
}


async function refreshRuntimeCaches() {
  await Promise.all([
    caches.delete(PAGE_CACHE),
    caches.delete(ASSET_CACHE),
    caches.delete(STATIC_CACHE)
  ]);

  const staticCache = await caches.open(STATIC_CACHE);
  await staticCache.addAll(PRECACHE_URLS).catch(() => Promise.resolve());
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'REFRESH_CACHE') {
    return;
  }

  const replyPort = event.ports && event.ports[0];

  event.waitUntil((async () => {
    try {
      await refreshRuntimeCaches();
      if (replyPort) {
        replyPort.postMessage({ ok: true });
      }
    } catch (error) {
      if (replyPort) {
        replyPort.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Cache refresh failed.' });
      }
    }
  })());
});

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
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (!isSensitivePath(pathname) && shouldCacheResponse(networkResponse)) {
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return navigationFallback(request);
      }
    })());
    return;
  }

  if (isSensitivePath(pathname)) {
    event.respondWith(fetch(request));
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
