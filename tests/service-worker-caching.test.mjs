import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// sw.js runs in a ServiceWorkerGlobalScope, so it cannot simply be imported.
// This builds a scope faithful enough to exercise the fetch handler: a Cache
// that records puts, a fetch that records calls, and the event shape the
// handler reads. The behaviour under test is that a cached static asset is
// served immediately *and* revalidated in the background -- the previous
// cache-first-forever policy left returning visitors on stale CSS and JS
// against new markup for as long as CACHE_VERSION stayed put.
const SW_SOURCE = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function makeResponse(body, { status = 200, headers = {} } = {}) {
  const store = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    body,
    status,
    type: 'basic',
    headers: { get: (name) => store.get(String(name).toLowerCase()) ?? null },
    clone() { return makeResponse(body, { status, headers }); },
  };
}

function createScope({ cachedAsset = null, networkAsset = null, networkFails = false } = {}) {
  const listeners = new Map();
  const puts = [];
  const fetches = [];
  const waited = [];

  const cache = {
    async put(request, response) { puts.push({ url: request.url, body: response.body }); },
    async addAll() {},
    async match() { return undefined; },
  };

  const scope = {
    location: { origin: 'https://gematria.today' },
    caches: {
      async open() { return cache; },
      async match(request) {
        const url = typeof request === 'string' ? request : request.url;
        return cachedAsset && url.endsWith(cachedAsset.path) ? makeResponse(cachedAsset.body) : undefined;
      },
      async keys() { return []; },
      async delete() { return true; },
    },
    fetch: async (request) => {
      fetches.push(typeof request === 'string' ? request : request.url);
      if (networkFails) throw new Error('offline');
      return makeResponse(networkAsset ?? 'network-body', {
        headers: { 'Cache-Control': 'public, max-age=31536000' },
      });
    },
    Response: { error: () => makeResponse('error', { status: 0 }) },
    URL,
    Promise,
    console,
    setTimeout,
    clearTimeout,
  };
  scope.self = scope;
  scope.addEventListener = (type, handler) => { listeners.set(type, handler); };
  scope.skipWaiting = () => {};
  scope.clients = { claim: () => {} };

  vm.createContext(scope);
  vm.runInContext(SW_SOURCE, scope);

  return {
    scope,
    puts,
    fetches,
    waited,
    async dispatchFetch(url, destination) {
      let responded = null;
      const event = {
        request: { url, method: 'GET', destination, mode: destination ? 'no-cors' : 'navigate' },
        respondWith: (p) => { responded = p; },
        waitUntil: (p) => { waited.push(p); },
      };
      listeners.get('fetch')(event);
      return responded ? await responded : null;
    },
    hasMessageHandlerFor(type) {
      const handler = listeners.get('message');
      let replied = false;
      handler({
        data: { type },
        ports: [{ postMessage: () => { replied = true; } }],
        waitUntil: (p) => { waited.push(p); },
      });
      return replied;
    },
  };
}

const ASSET = 'https://gematria.today/theme.css';

test('a cached static asset is served from cache without waiting on the network', async () => {
  const h = createScope({ cachedAsset: { path: '/theme.css', body: 'cached-css' } });
  const response = await h.dispatchFetch(ASSET, 'style');
  assert.equal(response.body, 'cached-css');
});

test('serving from cache still revalidates in the background', async () => {
  const h = createScope({ cachedAsset: { path: '/theme.css', body: 'cached-css' }, networkAsset: 'fresh-css' });
  await h.dispatchFetch(ASSET, 'style');
  await Promise.all(h.waited);
  assert.deepEqual(h.fetches, [ASSET], 'the asset should be refetched exactly once');
  assert.deepEqual(h.puts, [{ url: ASSET, body: 'fresh-css' }], 'the fresh copy should replace the cached one');
});

test('a failed background revalidation still serves the cached copy', async () => {
  const h = createScope({ cachedAsset: { path: '/theme.css', body: 'cached-css' }, networkFails: true });
  const response = await h.dispatchFetch(ASSET, 'style');
  assert.equal(response.body, 'cached-css');
  // Must not reject: an unhandled rejection here would surface as an SW error
  // on every asset request while offline.
  await Promise.all(h.waited);
  assert.deepEqual(h.puts, []);
});

test('an uncached static asset falls through to the network and is cached', async () => {
  const h = createScope({ networkAsset: 'fresh-css' });
  const response = await h.dispatchFetch(ASSET, 'style');
  assert.equal(response.body, 'fresh-css');
  assert.deepEqual(h.puts, [{ url: ASSET, body: 'fresh-css' }]);
});

test('sensitive paths are never cached', async () => {
  for (const url of [
    'https://gematria.today/api/member-session',
    'https://gematria.today/admin.html',
    'https://gematria.today/member.html',
    'https://gematria.today/account-recovery.html',
  ]) {
    const h = createScope({ networkAsset: 'secret' });
    await h.dispatchFetch(url, 'script');
    assert.deepEqual(h.puts, [], `${url} must not be written to any cache`);
  }
});

test('GET_VERSION still answers and the dead REFRESH_CACHE branch is gone', () => {
  const h = createScope();
  assert.equal(h.hasMessageHandlerFor('GET_VERSION'), true);
  assert.equal(h.hasMessageHandlerFor('REFRESH_CACHE'), false, 'nothing in the repo posts REFRESH_CACHE');
});

test('CACHE_VERSION is ahead of the version that shipped the stale caches', () => {
  const match = SW_SOURCE.match(/const CACHE_VERSION = 'v(\d+)'/);
  assert.ok(match, 'CACHE_VERSION should be a v<number> string');
  assert.ok(Number(match[1]) >= 6, 'bump CACHE_VERSION when precached assets change');
});
