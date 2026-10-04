import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { DEFAULT_SITE_MODULES } from '../netlify/functions/_site-modules.mjs';

// site-modules.js is a browser script, so it runs here against a small DOM
// stand-in: just enough elements, attributes and selectors for what the script
// touches. The behaviours under test are the ones the module switches used to
// lack -- a switched-off module's own page, the GemaBot and SiteSeeker links,
// and a failed settings fetch falling back to "everything on".
const ROOT = new URL('../', import.meta.url);
const SOURCE = readFileSync(new URL('site-modules.js', ROOT), 'utf8');

const toDataAttribute = (prop) => `data-${prop.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;

function matchesCompound(element, compound) {
  const match = /^([a-z][a-z0-9]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/i.exec(compound.trim());
  if (!match) throw new Error(`Unsupported selector: ${compound}`);
  const [, tag, rest] = match;
  if (tag && element.tagName !== tag.toUpperCase()) return false;
  for (const part of rest.match(/\.[\w-]+|\[[^\]]+\]/g) || []) {
    if (part.startsWith('.')) {
      if (!element.classList.contains(part.slice(1))) return false;
      continue;
    }
    const attr = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
    if (!attr) throw new Error(`Unsupported attribute selector: ${part}`);
    if (!element.hasAttribute(attr[1])) return false;
    if (attr[2] !== undefined && element.getAttribute(attr[1]) !== attr[2]) return false;
  }
  return true;
}

class FakeElement {
  constructor(tagName, attributes = {}, children = []) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes).map(([key, value]) => [key, String(value)]));
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    const styleProps = new Map();
    this.style = {
      setProperty: (name, value, priority = '') => styleProps.set(name, { value, priority }),
      removeProperty: (name) => styleProps.delete(name),
      getPropertyValue: (name) => styleProps.get(name)?.value || '',
      getPropertyPriority: (name) => styleProps.get(name)?.priority || '',
    };
    const element = this;
    this.dataset = new Proxy({}, {
      get: (_target, prop) => (typeof prop === 'string' ? element.getAttribute(toDataAttribute(prop)) ?? undefined : undefined),
      set: (_target, prop, value) => { element.setAttribute(toDataAttribute(prop), value); return true; },
      deleteProperty: (_target, prop) => { element.removeAttribute(toDataAttribute(prop)); return true; },
    });
    children.forEach((child) => this.appendChild(child));
  }

  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }

  get classList() {
    const element = this;
    const read = () => element.className.split(/\s+/).filter(Boolean);
    return {
      add: (...names) => { element.className = [...new Set([...read(), ...names])].join(' '); },
      remove: (...names) => { element.className = read().filter((name) => !names.includes(name)).join(' '); },
      contains: (name) => read().includes(name),
    };
  }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }

  matches(selector) { return selector.split(',').some((compound) => matchesCompound(this, compound)); }
  closest(selector) {
    for (let element = this; element; element = element.parentElement) {
      if (element.matches(selector)) return element;
    }
    return null;
  }

  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelectorAll(selector) {
    const scoped = /^:scope > (.+)$/.exec(selector);
    if (scoped) return this.children.filter((child) => child.matches(scoped[1]));
    return this.descendants().filter((element) => element.matches(selector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const el = (tag, attributes, ...children) => new FakeElement(tag, attributes, children);

// The shared nav's Tools menu with its GemaBot and SiteSeeker entries, the
// nav search link, and a module page.
function buildPage(mainModule) {
  const gemabotItem = el('a', { class: 'nav-mega-item', href: '/ai-agent.html', 'data-module': 'gemabot', 'data-module-link-container': '' });
  const knowbotItem = el('a', { class: 'nav-mega-item', href: '/searchbot.html', 'data-module': 'knowbot', 'data-module-link-container': '' });
  const calculatorItem = el('a', { class: 'nav-mega-item', href: '/calculator.html' });
  const toolsMenu = el('li', { class: 'nav-item dropdown nav-mega' }, el('div', { class: 'nav-mega-grid' }, calculatorItem, gemabotItem, knowbotItem));
  const searchItem = el('li', { class: 'nav-item nav-search', 'data-module': 'knowbot' }, el('a', { class: 'nav-link', href: '/searchbot.html' }));
  const footerForum = el('li', {}, el('a', { href: '/forum.html' }));
  const footerScale = el('li', {}, el('a', { href: '/forum-reputation-scale.html' }));
  const pageContent = el('div', { class: 'container' });
  const main = el('main', { id: 'mainContent', ...(mainModule ? { 'data-module-page': mainModule } : {}) }, pageContent);
  const body = el('body', {}, el('nav', {}, el('ul', {}, toolsMenu, searchItem)), main, el('footer', {}, el('ul', {}, footerForum, footerScale)));
  return { body, main, pageContent, toolsMenu, gemabotItem, knowbotItem, calculatorItem, searchItem, footerForum, footerScale };
}

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    store,
  };
}

async function runSiteModules({ path = '/forum.html', mainModule = 'forum', modulesResponse = null, fetchFails = false, storage = createStorage() } = {}) {
  const page = buildPage(mainModule);
  const fetches = [];
  const document = {
    readyState: 'complete',
    body: page.body,
    querySelectorAll: (selector) => page.body.querySelectorAll(selector),
    querySelector: (selector) => page.body.querySelector(selector),
    getElementById: (id) => page.body.descendants().find((element) => element.getAttribute('id') === id) || null,
    createElement: (tag) => new FakeElement(tag),
    addEventListener: () => {},
  };
  const context = {
    document,
    localStorage: storage,
    location: { href: `https://gematria.today${path}` },
    URL,
    console,
    fetch: async (url) => {
      fetches.push(url);
      if (fetchFails) throw new Error('offline');
      return { ok: true, json: async () => modulesResponse };
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context);
  for (let tick = 0; tick < 5; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { ...page, fetches, storage, modules: context.GematriaModules };
}

const isHidden = (element) => element.classList.contains('d-none');
const isSetAside = (element) => element.style.getPropertyValue('display') === 'none'
  && element.style.getPropertyPriority('display') === 'important';

test('the client defaults match the server defaults (every module on)', async () => {
  const { modules } = await runSiteModules({ modulesResponse: { modules: {} } });
  const { google_analytics: _serverOnly, ...serverDefaults } = DEFAULT_SITE_MODULES;
  assert.deepEqual({ ...modules.defaults }, serverDefaults);
});

test('a switched-off module page shows a notice instead of its content', async () => {
  const { main, pageContent } = await runSiteModules({ modulesResponse: { modules: { forum: false } } });
  const notice = main.querySelector(':scope > [data-module-disabled-notice]');
  assert.ok(notice, 'the forum page should carry the unavailable notice');
  assert.equal(notice.getAttribute('data-module-disabled-notice'), 'forum');
  assert.equal(main.children[0], notice);
  assert.ok(isSetAside(pageContent), 'the forum content should be set aside');
  assert.equal(pageContent.getAttribute('aria-hidden'), 'true');
});

test('a module page that is on is left alone', async () => {
  const { main, pageContent } = await runSiteModules({ modulesResponse: { modules: { forum: true, blog: false } } });
  assert.equal(main.querySelector(':scope > [data-module-disabled-notice]'), null);
  assert.equal(isSetAside(pageContent), false);
});

test('switching GemaBot and SiteSeeker off hides their links but not the Tools menu', async () => {
  const page = await runSiteModules({ path: '/index.html', mainModule: null, modulesResponse: { modules: { gemabot: false, knowbot: false } } });
  assert.ok(isHidden(page.gemabotItem));
  assert.ok(isHidden(page.knowbotItem));
  assert.ok(isHidden(page.searchItem));
  assert.equal(isHidden(page.toolsMenu), false, 'the whole Tools dropdown must stay');
  assert.equal(isHidden(page.calculatorItem), false);
});

test('switching the forum off hides the forum and reputation-scale links', async () => {
  const page = await runSiteModules({ path: '/index.html', mainModule: null, modulesResponse: { modules: { forum: false } } });
  assert.ok(isHidden(page.footerForum));
  assert.ok(isHidden(page.footerScale));
});

test('a failed settings fetch keeps the switches the server last reported', async () => {
  const storage = createStorage();
  await runSiteModules({ modulesResponse: { modules: { forum: false } }, storage });
  assert.ok(storage.getItem('gematria.siteModules.lastKnown'), 'the reported switches should be remembered');

  const offline = await runSiteModules({ fetchFails: true, storage });
  assert.ok(offline.main.querySelector(':scope > [data-module-disabled-notice]'), 'the forum must not reappear because a fetch failed');
  assert.equal(offline.modules.isEnabled('forum'), false);
});

test('a module the server turns back on comes back', async () => {
  const storage = createStorage({ 'gematria.siteModules.lastKnown': JSON.stringify({ forum: false }) });
  const { main, pageContent } = await runSiteModules({ modulesResponse: { modules: { forum: true } }, storage });
  assert.equal(main.querySelector(':scope > [data-module-disabled-notice]'), null);
  assert.equal(isSetAside(pageContent), false);
  assert.equal(pageContent.getAttribute('aria-hidden'), null);
});

// ---------- wiring ----------

test('site-modules.js is bundled so it runs on every page', () => {
  const buildScript = readFileSync(new URL('scripts/build-site-bundle.mjs', ROOT), 'utf8');
  assert.match(buildScript, /'site-modules\.js',/);
  for (const page of ['src/index.html', 'src/member.html', 'src/gematria-account-setup.html', 'admin.html', 'admin-super-admin.html']) {
    const html = readFileSync(new URL(page, ROOT), 'utf8');
    assert.doesNotMatch(html, /src="\/site-modules\.js"/, `${page} would run the module script twice`);
  }
});

test('each module page declares the module it belongs to', () => {
  const pages = {
    'src/forum.html': 'forum',
    'src/forum-reputation-scale.html': 'forum',
    'src/blog.html': 'blog',
    'src/ai-agent.html': 'gemabot',
    'src/searchbot.html': 'knowbot',
    'src/gematria-account-setup.html': 'membership',
  };
  for (const [page, moduleName] of Object.entries(pages)) {
    const html = readFileSync(new URL(page, ROOT), 'utf8');
    assert.match(html, new RegExp(`<main id="mainContent"[^>]*data-module-page="${moduleName}"`), page);
  }
});

test('the nav GemaBot and SiteSeeker entries are their own link containers', () => {
  const nav = readFileSync(new URL('src/_includes/nav.html', ROOT), 'utf8');
  // Without the container attribute, hiding one entry hid the whole Tools menu.
  assert.match(nav, /href="\/ai-agent\.html" data-module="gemabot" data-module-link-container/);
  assert.match(nav, /href="\/searchbot\.html" data-module="knowbot" data-module-link-container/);
});
