// Bump on any change to a precached or long-cached asset. This lagged behind
// theme.css and site-bundle.js, and because static assets were served
// cache-first with no revalidation, returning visitors ran new HTML against
// whichever CSS and JS they happened to cache first -- indefinitely.
// v8: static-v7 holds install-time copies that shadowed every revalidated
// update (see matchFreshest), so it has to go.
// v9: design fixes -- new page markup and scripts must not meet the previous
// theme.css (or the reverse) on a returning visitor's first load.
const CACHE_VERSION = 'v9';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PAGE_CACHE = `pages-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/theme.css',
  '/site-bundle.js',
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

// caches.match() searches caches in creation order, and STATIC_CACHE is
// created at install, before the caches that receive updates. Asking it first
// therefore returned the install-time precache of theme.css, site-bundle.js,
// pwa-register.js and the home page for good, while every revalidated copy
// was written to a cache that was never read first. Look in the cache that
// receives updates, and fall back to the precache only for what it lacks.
async function matchFreshest(request, updatedCacheName) {
  const updatedCache = await caches.open(updatedCacheName);
  const updated = await updatedCache.match(request);
  return updated || caches.match(request);
}

async function navigationFallback(request) {
  const directMatch = await matchFreshest(request, PAGE_CACHE);
  if (directMatch) {
    return directMatch;
  }

  // The app shell only stands in for the home page. Serving it for every
  // failed navigation meant an offline tap on /blog.html silently rendered the
  // home page at the blog's URL, with nothing to say the request had failed --
  // and offline.html, which exists to explain exactly that, was unreachable
  // because index.html is always precached.
  const url = new URL(request.url);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const appShell = await matchFreshest('/index.html', PAGE_CACHE);
    if (appShell) {
      return appShell;
    }
  }

  const offlinePage = await caches.match('/offline.html');
  return offlinePage || Response.error();
}


self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    // Hand control to the new worker only when the page asks — keeps the
    // "new version available" toast in control of when the swap happens so
    // users don't lose in-flight work mid-session.
    self.skipWaiting();
    return;
  }

  if (data.type === 'GET_VERSION') {
    const replyPort = event.ports && event.ports[0];
    if (replyPort) {
      replyPort.postMessage({ version: CACHE_VERSION });
    }
    return;
  }

  // Only SKIP_WAITING and GET_VERSION are ever posted (pwa-register.js:313,
  // :382). A REFRESH_CACHE branch used to sit here with nothing in the repo
  // sending it; stale assets are handled by revalidation in the fetch handler.
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => Promise.resolve())
  );
  // Do not auto-skipWaiting; the page surfaces a "Refresh to update" toast
  // and posts SKIP_WAITING when the user accepts.
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
      const cached = await matchFreshest(request, ASSET_CACHE);

      // Stale-while-revalidate. Cache-first with no revalidation meant a cached
      // stylesheet or script was never replaced within a cache generation, so a
      // deploy that did not also bump CACHE_VERSION left returning visitors on
      // old CSS against new markup with no way back.
      const networkUpdate = fetch(request)
        .then(async (networkResponse) => {
          if (shouldCacheResponse(networkResponse)) {
            const cache = await caches.open(ASSET_CACHE);
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cached) {
        // Swallow the background failure so being offline still serves the
        // cached copy rather than an unhandled rejection.
        event.waitUntil(networkUpdate);
        return cached;
      }

      const networkResponse = await networkUpdate;
      return networkResponse || Response.error();
    })());
    return;
  }

  event.respondWith(fetch(request));
});
