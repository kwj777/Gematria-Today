import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../page-scripts/premium-research-1.js', import.meta.url), 'utf8');

function createElement(id, classes = []) {
  const classNames = new Set(classes);
  return {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    get className() {
      return [...classNames].join(' ');
    },
    set className(value) {
      classNames.clear();
      for (const name of String(value).split(/\s+/).filter(Boolean)) classNames.add(name);
    },
    classList: {
      add: (...names) => names.forEach((name) => classNames.add(name)),
      remove: (...names) => names.forEach((name) => classNames.delete(name)),
      toggle: (name, force) => {
        const on = force === undefined ? !classNames.has(name) : Boolean(force);
        if (on) classNames.add(name);
        else classNames.delete(name);
        return on;
      },
      contains: (name) => classNames.has(name),
    },
    addEventListener() {},
    focus() {},
  };
}

// Runs the page script against a minimal DOM and the given API responses, then
// fires DOMContentLoaded the way the browser does.
async function loadPage(responses) {
  const elements = new Map([
    ['premiumLockedPanel', createElement('premiumLockedPanel', ['d-none'])],
    ['premiumErrorPanel', createElement('premiumErrorPanel', ['d-none'])],
    ['startupOverlay', createElement('startupOverlay')],
  ]);
  const premiumTools = [createElement('statsPanel'), createElement('lookupPanel')];
  const listeners = {};
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    querySelectorAll(selector) {
      return selector === '[data-premium-tools]' ? premiumTools : [];
    },
  };
  const window = {
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    setTimeout: () => 1,
    clearTimeout() {},
    location: { reload() {}, assign() {} },
  };
  const fetch = async (url) => {
    const path = String(url).split('?')[0];
    const action = new URL(String(url), 'https://gematria.today').searchParams.get('action');
    const response = responses[action ? `${path}?action=${action}` : path];
    assert.ok(response, `unexpected request ${url}`);
    return { ok: response.status < 400, status: response.status, json: async () => response.body };
  };

  vm.runInContext(SCRIPT, vm.createContext({ window, document, fetch, console }));
  await listeners.DOMContentLoaded();
  return {
    toolsHidden: premiumTools.every((node) => node.classList.contains('d-none')),
    toolsVisible: premiumTools.every((node) => !node.classList.contains('d-none')),
    element: (id) => document.getElementById(id),
  };
}

// /api/member-session answers a signed-in member with authenticated: true; the
// page treats anything else as signed out.
const PREMIUM_SESSION = { status: 200, body: { authenticated: true, member: { membershipLevel: 'premium' } } };

test('a failed stats call is reported in the stats panel and leaves the premium tools up', async () => {
  const page = await loadPage({
    '/api/member-session': PREMIUM_SESSION,
    '/api/member-premium-research?action=stats': { status: 500, body: { error: 'Unable to process premium research request' } },
  });
  assert.ok(page.toolsVisible, 'the Wordnik and gematria lookups must stay visible');
  assert.ok(page.element('premiumErrorPanel').classList.contains('d-none'), 'the page-level error panel must stay hidden');
  assert.match(page.element('statsCards').innerHTML, /Stats could not be loaded: Unable to process premium research request\./);
  assert.ok(page.element('startupOverlay').classList.contains('d-none'));
});

test('stats render when both requests succeed', async () => {
  const page = await loadPage({
    '/api/member-session': PREMIUM_SESSION,
    '/api/member-premium-research?action=stats': { status: 200, body: { payload: { totals: { totalWords: 42 } } } },
  });
  assert.ok(page.toolsVisible);
  assert.match(page.element('statsCards').innerHTML, /Total words[\s\S]*42/);
});

test('a non-premium member still sees the locked panel', async () => {
  const page = await loadPage({ '/api/member-session': { status: 200, body: { authenticated: true, member: { membershipLevel: 'free' } } } });
  assert.ok(page.toolsHidden);
  assert.ok(!page.element('premiumLockedPanel').classList.contains('d-none'));
});

test('a failed session check still hides the tools behind the error panel', async () => {
  const page = await loadPage({ '/api/member-session': { status: 500, body: { error: 'Database unavailable' } } });
  assert.ok(page.toolsHidden);
  assert.ok(!page.element('premiumErrorPanel').classList.contains('d-none'));
  assert.equal(page.element('premiumErrorMessage').textContent, 'Database unavailable');
  assert.ok(page.element('startupOverlay').classList.contains('d-none'));
});
