import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The consent banner and the trackers only meet inside site-bundle.js, so these
// tests run the real source files, in bundle order, against a small fake DOM:
// just enough document, window and storage for them to install, show the
// banner, take clicks and report.
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const BUNDLE_SOURCES = ['analytics-bootstrap.js', 'cookie-consent.js', 'ui-feedback.js', 'conversion-tracking.js']
  .map((file) => [file, read(file)]);

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, fn, options) {
    const list = this.listeners.get(type) || [];
    list.push({ fn, once: Boolean(options && typeof options === 'object' && options.once) });
    this.listeners.set(type, list);
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((entry) => entry.fn !== fn));
  }

  dispatchEvent(event) {
    for (const entry of [...(this.listeners.get(event.type) || [])]) {
      if (entry.once) this.removeEventListener(event.type, entry.fn);
      entry.fn.call(this, event);
    }
    return true;
  }
}

const FOCUSABLE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);

class FakeElement extends FakeEventTarget {
  constructor(doc, tagName) {
    super();
    this.ownerDocument = doc;
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.checked = false;
    this.textContent = '';
    this.className = '';
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => ((force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name)),
    };
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get parentElement() { return this.parentNode instanceof FakeElement ? this.parentNode : null; }
  get isConnected() { return this.ownerDocument.documentElement.contains(this); }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((node) => node !== child);
    child.parentNode = null;
    return child;
  }

  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  closest(selector) {
    const selectors = selector.split(',').map((part) => part.trim());
    for (let node = this; node instanceof FakeElement; node = node.parentNode) {
      const matched = selectors.some((part) => (part.startsWith('[')
        ? node.hasAttribute(part.slice(1, -1))
        : node.tagName === part.toUpperCase()));
      if (matched) return node;
    }
    return null;
  }

  // Elements written through innerHTML only matter here when the scripts look
  // them up by id, so each tag with an id becomes a child element.
  set innerHTML(html) {
    for (const match of String(html).matchAll(/<(\w+)([^>]*)>/g)) {
      const id = /\bid="([^"]+)"/.exec(match[2]);
      if (!id) continue;
      const child = this.ownerDocument.createElement(match[1]);
      child.id = id[1];
      child.hidden = /\shidden(\s|$|\/)/.test(match[2]);
      this.appendChild(child);
    }
  }

  focus() {
    if (!FOCUSABLE_TAGS.has(this.tagName) && !this.hasAttribute('tabindex')) return;
    const previous = this.ownerDocument.activeElement;
    if (previous === this) return;
    this.ownerDocument.activeElement = this;
    if (previous) previous.dispatchEvent({ type: 'blur', target: previous });
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, preventDefault() {} });
  }
}

class FakeAnchorElement extends FakeElement {}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.documentElement = new FakeElement(this, 'html');
    this.head = this.documentElement.appendChild(new FakeElement(this, 'head'));
    this.body = this.documentElement.appendChild(new FakeElement(this, 'body'));
    this.activeElement = this.body;
    this.readyState = 'complete';
    this.cookie = '';
    this.referrer = '';
  }

  createElement(tagName) {
    return tagName.toLowerCase() === 'a' ? new FakeAnchorElement(this, tagName) : new FakeElement(this, tagName);
  }

  getElementById(id) {
    const search = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    return search(this.documentElement);
  }

  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

// dataLayer entries are `arguments` objects from the sandbox realm; a JSON
// round trip turns their payloads into plain objects that deepEqual accepts.
function consentCommands(sandbox, kind) {
  const commands = Array.from(sandbox.dataLayer || [], (entry) => Array.from(entry))
    .filter((args) => args[0] === 'consent' && args[1] === kind)
    .map((args) => args[2]);
  return JSON.parse(JSON.stringify(commands));
}

function loadSite({
  timeZone = 'America/New_York',
  storedConsent = null,
  cookie = '',
  gpc = false,
  url = 'https://gematria.today/index.html',
  referrer = '',
} = {}) {
  const document = new FakeDocument();
  document.cookie = cookie;
  document.referrer = referrer;
  const main = document.body.appendChild(document.createElement('main'));
  main.id = 'mainContent';

  const parsed = new URL(url);
  const windowEvents = new FakeEventTarget();
  const timers = [];
  const reports = [];
  const recordReport = (body) => reports.push(JSON.parse(body));

  const sandbox = {
    document,
    Element: FakeElement,
    HTMLAnchorElement: FakeAnchorElement,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) },
    URL,
    URLSearchParams,
    Blob: class FakeBlob {
      constructor(parts) { this.body = parts.join(''); }
    },
    CustomEvent: class FakeCustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    crypto: globalThis.crypto,
    navigator: {
      globalPrivacyControl: gpc,
      sendBeacon: (_endpoint, blob) => {
        recordReport(blob.body);
        return true;
      },
    },
    fetch: async (_endpoint, init = {}) => {
      if (init.body) recordReport(init.body);
      return { ok: true, json: async () => ({}) };
    },
    location: {
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      href: parsed.href,
      origin: parsed.origin,
    },
    localStorage: createStorage(storedConsent === null ? {} : { gematria_cookie_consent: storedConsent }),
    sessionStorage: createStorage(),
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => {},
    requestAnimationFrame: () => {},
    requestIdleCallback: () => {},
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const [file, source] of BUNDLE_SOURCES) {
    vm.runInContext(source, sandbox, { filename: file });
  }

  return {
    window: sandbox,
    document,
    main,
    reports,
    runTimers() {
      while (timers.length) timers.shift()();
    },
    banner: () => document.getElementById('cookieConsentBanner'),
    // A keyboard user: focus lands on the control, then Enter activates it.
    press(element) {
      element.focus();
      element.click();
    },
    clickPageButton(id = '') {
      const button = document.body.appendChild(document.createElement('button'));
      if (id) button.id = id;
      button.textContent = 'Calculate';
      document.dispatchEvent({ type: 'click', target: button, preventDefault() {} });
      return button;
    },
    consentUpdates: () => consentCommands(sandbox, 'update'),
    consentDefaults: () => consentCommands(sandbox, 'default'),
  };
}

// --- M17: the visitor's choice has to reach Google Consent Mode -------------

test('gtag is exposed so cookie-consent can call it', () => {
  const site = loadSite();
  assert.equal(typeof site.window.gtag, 'function');
});

test('a stored choice is sent to Consent Mode on every page load', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin', storedConsent: '{"a":1,"m":0}' });
  assert.deepEqual(site.consentUpdates(), [{
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  }]);
});

test('accepting in the banner grants Consent Mode straight away', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin' });
  assert.ok(site.banner(), 'the banner is shown in Europe when nothing is stored');
  assert.deepEqual(site.consentUpdates(), []);
  site.press(site.document.getElementById('cookieConsentAccept'));
  assert.equal(site.consentUpdates().at(-1).analytics_storage, 'granted');
  assert.equal(site.consentUpdates().at(-1).ad_storage, 'granted');
});

// --- L60: advertising signals and Global Privacy Control --------------------

test('advertising signals default to denied everywhere, analytics only in consent regions', () => {
  const site = loadSite();
  const [global, regional] = site.consentDefaults();
  assert.equal(global.region, undefined);
  assert.equal(global.analytics_storage, 'granted');
  assert.equal(global.ad_storage, 'denied');
  assert.equal(global.ad_user_data, 'denied');
  assert.equal(global.ad_personalization, 'denied');
  assert.equal(regional.analytics_storage, 'denied');
  assert.ok(regional.region.includes('DE'));
});

test('a GPC signal keeps advertising denied even after Accept all', () => {
  const site = loadSite({ timeZone: 'America/Los_Angeles', storedConsent: '{"a":1,"m":1}', gpc: true });
  const update = site.consentUpdates().at(-1);
  assert.equal(update.analytics_storage, 'granted');
  assert.equal(update.ad_storage, 'denied');
  assert.equal(update.ad_user_data, 'denied');
  assert.equal(update.ad_personalization, 'denied');
});

test('an opt-out outside Europe is not scoped to the European regions', () => {
  const site = loadSite({ timeZone: 'America/New_York', storedConsent: '{"a":0,"m":0}' });
  const update = site.consentUpdates().at(-1);
  assert.equal(update.analytics_storage, 'denied');
  assert.equal('region' in update, false, 'a region-scoped update would not apply to this visitor');
});

// --- M18: conversion tracking reads the current consent format --------------

test('conversion tracking installs for a returning visitor who accepted (JSON format)', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin', storedConsent: '{"a":1,"m":1}' });
  assert.equal(site.window.__gematriaConversionTrackingInstalled, true);
  assert.equal(typeof site.window.gematriaTracking?.track, 'function');
});

test('conversion tracking still honours the legacy accepted value', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin', storedConsent: 'accepted' });
  assert.equal(site.window.__gematriaConversionTrackingInstalled, true);
});

test('allowing advertising alone does not start analytics tracking', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin', storedConsent: '{"a":0,"m":1}' });
  assert.equal(site.window.__gematriaConversionTrackingInstalled, undefined);
});

test('accepting after an earlier decline on the same page starts tracking', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin' });
  site.press(site.document.getElementById('cookieConsentDecline'));
  site.runTimers();
  assert.equal(site.window.__gematriaConversionTrackingInstalled, undefined);

  site.window.gematriaCookieConsent.reopen();
  site.document.getElementById('cookieConsentAnalytics').checked = true;
  site.press(site.document.getElementById('cookieConsentSave'));
  assert.equal(site.window.__gematriaConversionTrackingInstalled, true);
});

// --- M35: declining stops the first-party click tracker ---------------------

test('Decline all stops every click report', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin' });
  site.press(site.document.getElementById('cookieConsentDecline'));
  site.runTimers();
  site.clickPageButton('calculateBtn');
  assert.deepEqual(site.reports, []);
  assert.equal(site.window.gematriaCookieConsent.analyticsAllowed(), false);
});

test('nothing is reported in Europe before the visitor has chosen', () => {
  const site = loadSite({ timeZone: 'Europe/Paris' });
  site.clickPageButton('calculateBtn');
  assert.deepEqual(site.reports, []);
});

test('outside Europe clicks are still reported by default, once each', () => {
  const site = loadSite({ timeZone: 'America/Chicago' });
  site.clickPageButton('calculateBtn');
  assert.equal(site.reports.length, 1);
  assert.equal(site.reports[0].action, 'sitewide_element_click');
});

test('withdrawing consent from Cookie settings stops reports without a reload', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin', storedConsent: '{"a":1,"m":1}' });
  site.clickPageButton('first');
  assert.equal(site.reports.length, 1);

  site.window.gematriaCookieConsent.reopen();
  site.document.getElementById('cookieConsentAnalytics').checked = false;
  site.press(site.document.getElementById('cookieConsentSave'));
  site.clickPageButton('second');
  assert.equal(site.window.gematriaTracking.track('cta_ladder_click', { source: 'test' }), null);
  assert.equal(site.reports.length, 1);
});

test('the page scripts that report share clicks themselves ask for consent first', () => {
  for (const file of ['page-scripts/calculator-1.js', 'page-scripts/name-calculator-1.js', 'page-scripts/ai-agent-1.mjs', 'page-scripts/blog-2.js']) {
    const source = read(file);
    const reporter = source.slice(source.indexOf('reportButtonEvent = (') >= 0
      ? source.indexOf('reportButtonEvent = (')
      : source.indexOf('function reportButtonEvent('));
    const body = reporter.slice(0, reporter.indexOf("fetch('/api/public-button-report'"));
    assert.match(body, /window\.gematriaCookieConsent\?\.analyticsAllowed\?\.\(\) !== true/, `${file} must check consent before reporting`);
  }
});

// --- L9: reported URLs never carry the query string --------------------------

test('click and conversion reports drop query strings from page URLs and the referrer', () => {
  const site = loadSite({
    storedConsent: '{"a":1,"m":0}',
    url: 'https://gematria.today/account-recovery.html?recovery_code=SECRET-CODE',
    referrer: 'https://gematria.today/account-recovery.html?recovery_code=OLD-CODE',
  });
  site.clickPageButton();
  site.window.gematriaTracking.track('cta_ladder_click', { source: 'test' });
  assert.equal(site.reports.length, 2);
  const serialized = JSON.stringify(site.reports);
  assert.doesNotMatch(serialized, /SECRET-CODE|OLD-CODE|recovery_code/);
  assert.equal(site.reports[0].metadata.pageUrl, 'https://gematria.today/account-recovery.html');
  assert.equal(site.reports[0].metadata.elementLink, 'https://gematria.today/account-recovery.html');
  assert.equal(site.reports[0].metadata.referrer, 'https://gematria.today/account-recovery.html');
});

test('the recovery page removes the code from the address bar after reading it', () => {
  const source = read('page-scripts/account-recovery-1.js');
  const handling = source.slice(source.indexOf("searchParams.get('recovery_code')"));
  assert.match(handling, /searchParams\.delete\('recovery_code'\)[\s\S]{0,200}window\.history\.replaceState\(/);
});

// --- L21: admins are recognised through the readable flag cookie ------------

test('the admin flag hides the banner and keeps conversion tracking off', () => {
  const site = loadSite({
    timeZone: 'Europe/Berlin',
    cookie: 'gematria_member_tier=lifetime; gematria_admin_flag=1',
  });
  assert.equal(site.banner(), null);

  const consenting = loadSite({ storedConsent: '{"a":1,"m":1}', cookie: 'gematria_admin_flag=1' });
  assert.equal(consenting.window.__gematriaConversionTrackingInstalled, undefined);
});

// --- L39: focus goes back where it came from ---------------------------------

test('choosing on first load moves focus to the main content, not off the page', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin' });
  assert.equal(site.document.activeElement, site.banner());
  site.press(site.document.getElementById('cookieConsentAccept'));
  assert.equal(site.document.activeElement, site.main);
  assert.equal(site.main.getAttribute('tabindex'), '-1');
  site.clickPageButton().focus();
  assert.equal(site.main.hasAttribute('tabindex'), false, 'the temporary tabindex is removed once focus moves on');
});

test('saving from Cookie settings returns focus to the button that opened it', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin', storedConsent: '{"a":0,"m":0}' });
  const trigger = site.document.body.appendChild(site.document.createElement('button'));
  trigger.setAttribute('data-cookie-settings', '');
  trigger.focus();
  site.document.dispatchEvent({ type: 'click', target: trigger, preventDefault() {} });
  assert.equal(site.document.activeElement, site.banner());

  site.press(site.document.getElementById('cookieConsentSave'));
  assert.equal(site.document.activeElement, trigger);
});

test('the privacy policy lists the tracking cookies and no longer calls the data anonymous', () => {
  const privacy = read('src/privacy.html');
  for (const cookieName of ['gematria_visitor_session', 'gematria_member_tier', 'gematria_admin_flag']) {
    assert.ok(privacy.includes(`<code>${cookieName}</code>`), `privacy.html must list ${cookieName}`);
  }
  // The click reports carry IP address, location and a fingerprint.
  assert.doesNotMatch(privacy, /anonymous usage/i);
  assert.doesNotMatch(read('cookie-consent.js'), /anonymous/i);
});

test('Escape also hands focus back', () => {
  const site = loadSite({ timeZone: 'Europe/Berlin', storedConsent: '{"a":1,"m":1}' });
  const trigger = site.document.body.appendChild(site.document.createElement('button'));
  trigger.focus();
  site.window.gematriaCookieConsent.reopen(trigger);
  site.banner().dispatchEvent({ type: 'keydown', key: 'Escape', stopPropagation() {} });
  assert.equal(site.document.activeElement, trigger);
});
