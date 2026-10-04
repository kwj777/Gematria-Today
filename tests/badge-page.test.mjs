import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// badge-1.js is a classic browser script, so it runs here in a vm scope with
// just enough DOM for the elements it touches. AbortSignal is deliberately
// given no timeout(): that is Safari 15, Chrome before 103 and Firefox before
// 100, all of which the browser gate in early-bootstrap.js lets through.
const BADGE_SCRIPT = readFileSync(new URL('../page-scripts/badge-1.js', import.meta.url), 'utf8');
const BADGE_HTML = readFileSync(new URL('../src/badge.html', import.meta.url), 'utf8');

function makeElement() {
  const classes = new Set(['d-none']);
  const attributes = new Map();
  return {
    textContent: '',
    href: '',
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name) ?? null,
    addEventListener() {},
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function runBadgePage({ search = '', routes = {} } = {}) {
  const elements = new Map();
  const fetches = [];
  let onReady = null;

  const document = {
    title: '',
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
  };
  const window = {
    location: { search, origin: 'https://gematria.today' },
    addEventListener(type, handler) {
      if (type === 'DOMContentLoaded') onReady = handler;
    },
    setTimeout,
    clearTimeout,
    prompt() {},
  };
  const fetch = async (url, options = {}) => {
    fetches.push({ url, options });
    const path = String(url).split('?')[0];
    const route = routes[path];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return typeof route === 'function' ? route(url) : route;
  };

  const scope = {
    window,
    document,
    fetch,
    navigator: {},
    URLSearchParams,
    AbortController,
    AbortSignal: {},
    console,
  };
  vm.createContext(scope);
  vm.runInContext(BADGE_SCRIPT, scope);
  assert.ok(onReady, 'the script waits for DOMContentLoaded');
  await onReady();

  const el = (id) => document.getElementById(id);
  return {
    fetches,
    cardShown: !el('badgeCard').classList.contains('d-none'),
    errorShown: !el('badgeErrorShell').classList.contains('d-none'),
    errorMessage: el('badgeErrorMessage').textContent,
    holderName: el('badgeHolderName').textContent,
  };
}

const ALICE_BADGE = jsonResponse(200, {
  username: 'alice',
  displayName: 'Alice',
  badge: { slug: 'beginner-path-graduate', earnedAt: '2026-09-01T00:00:00Z' },
});

test('a shared badge loads on browsers without AbortSignal.timeout', async () => {
  const page = await runBadgePage({
    search: '?u=alice',
    routes: { '/api/public-badge': ALICE_BADGE },
  });

  assert.equal(page.errorShown, false, page.errorMessage);
  assert.equal(page.cardShown, true);
  assert.equal(page.holderName, 'Alice');
  assert.equal(page.fetches.length, 1);
  assert.equal(page.fetches[0].url, '/api/public-badge?user=alice');
  assert.ok(page.fetches[0].options.signal, 'the request still has a timeout signal');
});

test('"your badges" with no ?u shows the signed-in member their own badge', async () => {
  // forum-reputation-scale.html links to a bare /badge.html.
  const page = await runBadgePage({
    routes: {
      '/api/member-session': jsonResponse(200, { authenticated: true, user: { username: 'alice' }, member: { username: 'alice' } }),
      '/api/public-badge': ALICE_BADGE,
    },
  });

  assert.equal(page.cardShown, true, page.errorMessage);
  assert.deepEqual(page.fetches.map(({ url }) => url), ['/api/member-session', '/api/public-badge?user=alice']);
});

test('a signed-in member without the badge is told how to earn it', async () => {
  const page = await runBadgePage({
    routes: {
      '/api/member-session': jsonResponse(200, { authenticated: true, member: { username: 'bob' } }),
      '/api/public-badge': jsonResponse(404, { error: 'Badge not found for that user' }),
    },
  });

  assert.equal(page.errorShown, true);
  assert.match(page.errorMessage, /haven't earned/);
});

test('a signed-out visitor with no ?u is asked to sign in', async () => {
  const page = await runBadgePage({
    routes: { '/api/member-session': jsonResponse(200, { authenticated: false }) },
  });

  assert.equal(page.errorShown, true);
  assert.match(page.errorMessage, /Sign in/);
  assert.deepEqual(page.fetches.map(({ url }) => url), ['/api/member-session']);
});

test('the badge shell is not offered to search engines', () => {
  // Every /badge.html?u=<user> declared the bare /badge.html canonical, which
  // without ?u renders only an error -- a soft 404 marked index,follow.
  assert.match(BADGE_HTML, /<meta name="robots" content="noindex,follow" \/>/);
  assert.ok(!/content="index,follow"/.test(BADGE_HTML));
});
