import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

// Accessibility contracts for interaction code that needs a browser to run in
// full. Where the behaviour fits in a small fake DOM, the script itself is run
// in a vm sandbox; otherwise the source-level invariant behind the fix is
// checked, with a note on the bug it keeps out.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function listener() {
  const handlers = {};
  return {
    handlers,
    addEventListener(type, fn) {
      (handlers[type] ||= []).push(fn);
    },
    fire(type, event = {}) {
      for (const fn of handlers[type] || []) fn(event);
    },
  };
}

function fakeElement(props = {}) {
  const attrs = {};
  const events = listener();
  return {
    nodeType: 1,
    tagName: 'BUTTON',
    isContentEditable: false,
    dataset: {},
    hidden: false,
    textContent: '',
    attrs,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => { attrs[name] = String(value); },
    removeAttribute: (name) => { delete attrs[name]; },
    addEventListener: events.addEventListener,
    fire: events.fire,
    ...props,
  };
}

// ---------- L34: the site-wide search shortcut ----------

function loadNavScroll({ platform = 'Linux x86_64', pathname = '/calculator.html' } = {}) {
  const doc = listener();
  const location = { pathname, search: '', href: `https://gematria.today${pathname}` };
  const sandbox = {
    document: {
      readyState: 'complete',
      addEventListener: doc.addEventListener,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
    },
    location,
    navigator: { platform },
    requestAnimationFrame: (fn) => fn(),
    URLSearchParams,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(read('nav-scroll.js'), sandbox);
  const press = (key, { target = fakeElement(), ...mods } = {}) => {
    const event = {
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...mods,
      target,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    doc.fire('keydown', event);
    return event;
  };
  return { location, press };
}

test('a bare "/" no longer navigates away from the page', () => {
  // Pressed -- or misheard by speech input -- with focus on a button, radio or
  // link, it left the page and dropped an unsent forum draft (WCAG 2.1.4).
  const { location, press } = loadNavScroll();
  const before = location.href;
  const event = press('/');
  assert.equal(location.href, before);
  assert.equal(event.defaultPrevented, false, '"/" must reach the page untouched');
});

test('Ctrl+K and Cmd+K open SiteSeeker search', () => {
  for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
    const { location, press } = loadNavScroll();
    const event = press('k', mod);
    assert.equal(location.href, '/searchbot.html?focus=knowbot');
    assert.equal(event.defaultPrevented, true);
  }
});

test('the shortcut leaves text fields and other chords alone', () => {
  const textarea = fakeElement({ tagName: 'TEXTAREA' });
  for (const [key, opts] of [['k', { ctrlKey: true, target: textarea }], ['K', { ctrlKey: true, shiftKey: true }], ['k', { ctrlKey: true, altKey: true }], ['k', {}]]) {
    const { location, press } = loadNavScroll();
    const before = location.href;
    press(key, opts);
    assert.equal(location.href, before, `${JSON.stringify({ key, ...opts, target: undefined })} must not navigate`);
  }
});

test('the nav advertises the shortcut that actually works', () => {
  const nav = read('src/_includes/nav.html');
  const link = nav.match(/<a class="nav-link nav-search-link"[^>]*>/)?.[0] || '';
  assert.match(link, /aria-keyshortcuts="Control\+K Meta\+K"/);
  assert.doesNotMatch(link, /press \//);
  assert.match(nav, /<kbd class="nav-search-link__kbd" aria-hidden="true">Ctrl K<\/kbd>/);
});

// ---------- L45: the theme toggle ----------

function loadPublicTheme() {
  const button = fakeElement();
  let theme = 'light';
  const sandbox = {
    document: {
      readyState: 'complete',
      addEventListener() {},
      documentElement: {
        getAttribute: () => theme,
        setAttribute: (_, value) => { theme = value; },
      },
      querySelectorAll: () => [button],
    },
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
  };
  sandbox.window = sandbox;
  vm.runInNewContext(read('public-theme.js'), sandbox);
  return button;
}

test('the theme toggle names what a click does and has no pressed state to contradict it', () => {
  // It flipped its label to the action while also reporting aria-pressed
  // ("Switch to light mode, pressed"), so the name and the state contradicted
  // each other (WCAG 4.1.2). Freezing the name at "Dark mode" fixed that but
  // left the tooltip saying "Dark mode" over the sun icon in dark mode.
  const button = loadPublicTheme();
  assert.equal(button.getAttribute('aria-label'), 'Switch to dark mode');
  assert.equal(button.getAttribute('title'), 'Switch to dark mode');
  assert.equal(button.getAttribute('aria-pressed'), null);
  button.fire('click');
  assert.equal(button.getAttribute('aria-label'), 'Switch to light mode');
  assert.equal(button.getAttribute('title'), 'Switch to light mode');
  assert.equal(button.getAttribute('aria-pressed'), null);
  button.fire('click');
  assert.equal(button.getAttribute('aria-label'), 'Switch to dark mode');
  const markup = read('src/_includes/nav.html').match(/<button[^>]*data-theme-toggle[^>]*>/)?.[0] || '';
  assert.match(markup, /aria-label="Switch to dark mode"/);
  assert.match(markup, /title="Switch to dark mode"/);
  assert.doesNotMatch(markup, /aria-pressed/);
});

function loadAdminTheme({ stored = null } = {}) {
  const button = fakeElement({ textContent: 'Dark mode' });
  button.setAttribute('aria-pressed', 'false');
  // What the admin pages' markup used to carry.
  button.setAttribute('aria-label', 'Switch to dark mode');
  const doc = listener();
  let theme = null;
  const sandbox = {
    document: {
      addEventListener: doc.addEventListener,
      documentElement: {
        getAttribute: () => theme,
        setAttribute: (_, value) => { theme = value; },
      },
      getElementById: (id) => (id === 'themeToggleButton' ? button : null),
      body: null,
    },
    localStorage: { getItem: () => stored, setItem() {} },
    addEventListener() {},
    setTimeout() {},
  };
  sandbox.window = sandbox;
  vm.runInNewContext(read('admin-theme.js'), sandbox);
  doc.fire('DOMContentLoaded');
  return button;
}

test('the admin theme toggle text changes with the mode and names what a click does', () => {
  // Its text was frozen at "Dark mode" with the state left to aria-pressed,
  // which only a screen reader announces, so sighted admins saw a label that
  // never changed. Before that it flipped its text while also reporting
  // aria-pressed, so the name and the state contradicted each other.
  const button = loadAdminTheme();
  assert.equal(button.textContent, 'Dark mode');
  assert.equal(button.getAttribute('aria-pressed'), null, 'an action button has no pressed state');
  assert.equal(button.getAttribute('aria-label'), null, 'the visible text is the name');
  button.fire('click');
  assert.equal(button.textContent, 'Light mode');
  assert.equal(button.getAttribute('aria-pressed'), null);
  assert.equal(button.getAttribute('aria-label'), null);
  button.fire('click');
  assert.equal(button.textContent, 'Dark mode');
  const stored = loadAdminTheme({ stored: 'dark' });
  assert.equal(stored.textContent, 'Light mode');
  assert.equal(stored.getAttribute('aria-pressed'), null);

  const pages = readdirSync(new URL('../', import.meta.url)).filter((name) => /^admin.*\.html$/.test(name));
  let toggles = 0;
  for (const page of pages) {
    const markup = read(page).match(/<button id="themeToggleButton"[^>]*>([^<]*)<\/button>/);
    if (!markup) continue;
    toggles += 1;
    assert.equal(markup[1], 'Dark mode', `${page}: visible text`);
    assert.doesNotMatch(markup[0], /aria-pressed/, `${page}: no pressed state`);
    assert.doesNotMatch(markup[0], /aria-label=/, `${page}: no label to contradict the text`);
  }
  assert.equal(toggles, 10);
});

// ---------- M31: visible labels inside accessible names ----------

const decode = (s) => s
  .replace(/&rarr;/g, '→')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/&rsquo;/g, '’')
  .replace(/&quot;/g, '"');
const words = (s) => decode(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

test('every aria-label on a page link or button contains its visible text', () => {
  // Speech-input users say what they see ("click This is the way"); a name
  // that drops those words matches nothing (WCAG 2.5.3).
  const dir = new URL('../src/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.html')).map((name) => `src/${name}`);
  files.push('src/_includes/nav.html');
  const mismatches = [];
  for (const file of files) {
    const html = read(file);
    for (const m of html.matchAll(/<(a|button)\b[^>]*?\saria-label="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g)) {
      const visible = words(m[3]
        .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
        .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, ' ')
        .replace(/<[^>]+>/g, ' '));
      if (visible && !words(m[2]).includes(visible)) mismatches.push(`${file}: "${visible}" vs aria-label "${m[2]}"`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('the scripted names keep the visible words too', () => {
  const home = read('home-page.js');
  assert.match(home, /setAttribute\('aria-label', `See it on the full calculator: /);
  assert.match(home, /setAttribute\('aria-label', `Compare as a name: /);
  assert.match(read('page-scripts/member-1.js'), /setAttribute\('aria-label', 'This is the way: /);
});

function loadSavePopover(text) {
  const button = fakeElement({ textContent: text });
  class Popover {
    hide() {}
    show() {}
    dispose() {}
  }
  const sandbox = { matchMedia: () => ({ matches: false }), bootstrap: { Popover }, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  vm.runInNewContext(read('members-only-save-popover.js'), sandbox);
  sandbox.createMembersOnlySavePopover(button);
  return button;
}

test('the guest "Save result" button is still named "Save result"', () => {
  assert.equal(loadSavePopover('Save result').getAttribute('aria-label'), 'Save result (members only)');
  assert.equal(loadSavePopover('\n  Save results ').getAttribute('aria-label'), 'Save results (members only)');
});

test('the mobile menu button is named by the "Menu" / "Close" it shows', () => {
  // aria-label="Toggle navigation" replaced the visible "Menu" label, so "tap
  // Menu" found nothing. The label is real text in the button, not ::after
  // content: generated content does not count toward the name in axe (and so
  // Lighthouse) or in some screen readers, which left the button nameless.
  const label = '<span class="navbar-toggler-label"><span class="navbar-toggler-label__closed">Menu</span><span class="navbar-toggler-label__open">Close</span></span>';
  const files = ['src/_includes/nav.html', ...readdirSync(new URL('../', import.meta.url)).filter((name) => /^admin.*\.html$/.test(name))];
  let togglers = 0;
  for (const file of files) {
    const button = read(file).match(/<button class="navbar-toggler[^>]*>[\s\S]*?<\/button>/)?.[0];
    if (!button) continue;
    togglers += 1;
    assert.doesNotMatch(button, /^<button[^>]*aria-label=/, `${file}: the toggler must take its name from its visible label`);
    assert.ok(button.includes(label), `${file}: the toggler must carry the Menu/Close label as text`);
  }
  assert.ok(togglers >= 2, 'expected the shared nav and the admin pages to have menu buttons');
  const css = read('theme.css');
  assert.doesNotMatch(css, /\.navbar-toggler(?:\[aria-expanded="true"\])?::after \{\s*content:/);
  assert.match(css, /\.navbar-toggler\[aria-expanded="true"\] \.navbar-toggler-label__closed,\s*\.navbar-toggler:not\(\[aria-expanded="true"\]\) \.navbar-toggler-label__open \{\s*display: none;/);
  // The narrowest phones hide the word, but it is the only name the button
  // has, so it must stay in the accessibility tree (clipped, not removed).
  const narrow = css.slice(css.indexOf('@media (max-width: 380px)'));
  assert.match(narrow, /\.navbar-toggler-label \{\s*position: absolute;[\s\S]*?clip-path: inset\(50%\);/);
});

test('the service worker starts a new cache generation for the new CSS and bundle', () => {
  // sw.js precaches theme.css and site-bundle.js, and caches.match finds that
  // install-time copy before the one stale-while-revalidate refreshes, so
  // without a new generation returning visitors kept the old theme.css --
  // whose `content: none` left the label-less menu button with no name at
  // all on the narrowest phones -- and the old nav-scroll.js, on which the
  // advertised Ctrl+K did nothing.
  const version = Number(read('sw.js').match(/const CACHE_VERSION = 'v(\d+)'/)?.[1]);
  assert.ok(version >= 8, `CACHE_VERSION v${version} still serves the v7 precache`);
});

// ---------- L33 / L42: the definitions page ----------

test('the definitions page popup is a disclosure the keyboard can enter', () => {
  // It was role="tooltip" (which may not hold a link) at the end of <body>:
  // Tab from a term skipped its "Jump to full definition" link and closed it.
  const src = read('page-scripts/definitions-1.js');
  assert.doesNotMatch(src, /setAttribute\('role', 'tooltip'\)/);
  assert.doesNotMatch(src, /setAttribute\('aria-describedby'/);
  assert.match(src, /btn\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(src, /btn\.setAttribute\('aria-controls', POPUP_ID\)/);
  assert.match(src, /btn\.insertAdjacentElement\('afterend', popup\)/);
  assert.match(src, /if \(focusIsInsidePopup\(\)\) return;/);
  assert.match(src, /popup\.setAttribute\('popover', 'manual'\)/);
  // Its text is never read as part of whichever definition it is parked in.
  assert.match(src, /querySelectorAll\('\.defn-example, \.defn-popup'\)/);
  // positionPopup works in viewport coordinates, so this script's panel is
  // fixed. A copy of the script from before this change can still be served
  // from a visitor's service-worker cache: it appends a bare .defn-popup to
  // <body> and places it in page coordinates, so the bare class stays
  // absolute, or that panel would land off-screen on a scrolled page.
  assert.match(src, /popup\.className = 'defn-popup defn-popup--anchored';/);
  const html = read('src/definitions.html');
  assert.match(html.match(/\.defn-popup \{[^}]*\}/)?.[0] || '', /position: absolute;/);
  assert.match(html, /\.defn-popup--anchored \{ position: fixed; \}/);
});

test('every glossary card is a valid <dl> group: <dt> then <dd>s', () => {
  // A <dt> nested in a header <div> beside a badge and a link is not a dl
  // group, so no term was exposed with its definition (WCAG 1.3.1).
  const html = read('src/definitions.html');
  const lists = [...html.matchAll(/<dl class="defn-grid">([\s\S]*?)<\/dl>/g)].map((m) => m[1]);
  assert.equal(lists.length, 5);
  let cards = 0;
  for (const inner of lists) {
    const rest = inner.replace(/<div class="defn-card"[^>]*>([\s\S]*?<\/dd>)\s*<\/div>/g, (_, body) => {
      cards += 1;
      const top = body
        .replace(/<dt\b[\s\S]*?<\/dt>/g, '<dt>')
        .replace(/<dd\b[\s\S]*?<\/dd>/g, '<dd>')
        .replace(/\s+/g, '');
      assert.equal(top, '<dt><dd><dd>', `card children must be dt, dd, dd: ${body.slice(0, 80)}`);
      assert.doesNotMatch(body, /<div\b/, 'no wrapper <div> inside a card');
      // The definition comes first (older cached scripts read the first
      // <dd>); the badge-and-link <dd> follows it.
      assert.deepEqual([...body.matchAll(/<dd\b[^>]*>/g)].map((m) => m[0]), ['<dd>', '<dd class="defn-card__meta">']);
      return '';
    });
    assert.equal(rest.trim(), '', 'a defn-grid holds only cards');
  }
  assert.equal(cards, 30);
  // ...and flex `order` still draws the badge and link beside the term, with
  // the definition on the row below.
  assert.match(html, /\.defn-card dt \{[^}]*order: 0;/);
  assert.match(html, /\.defn-card dd\.defn-card__meta \{[^}]*order: 1;/);
  assert.match(html, /\.defn-card dd:not\(\.defn-card__meta\) \{[^}]*flex: 1 1 100%;[^}]*order: 2;/);
});

test('the why-english letter chart is a definition list, not a table without rows', () => {
  const html = read('src/why-english-gematria.html');
  assert.doesNotMatch(html, /role="table"|role="cell"/);
  const chart = html.match(/<dl class="letter-value-grid[^"]*">([\s\S]*?)<\/dl>/)?.[1] || '';
  assert.equal([...chart.matchAll(/<dt class="letter-value-grid__letter">[A-Z]<\/dt><dd class="letter-value-grid__value[^"]*">\d+<\/dd>/g)].length, 26);
});

// ---------- L41: the home blog carousel ----------

function loadCarouselRotation({ slides = 3, reducedMotion = false } = {}) {
  const source = read('home-page.js');
  const start = source.indexOf('function initializeBlogCarouselRotation(');
  const end = source.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, 'initializeBlogCarouselRotation not found');
  const carouselEl = fakeElement({ contains: (node) => node?.insideCarousel === true });
  const toggle = fakeElement({ hidden: true });
  const inner = fakeElement();
  const calls = [];
  let created = null;
  const sandbox = {
    document: {
      getElementById: (id) => ({ blogPostsCarousel: carouselEl, blogPostsCarouselRotation: toggle, blogPostsCarouselInner: inner })[id] || null,
    },
    matchMedia: (query) => ({ matches: reducedMotion && query.includes('reduce') }),
    addEventListener() {},
    bootstrap: {
      Carousel: {
        getOrCreateInstance(el, config) {
          created = config;
          return { cycle: () => calls.push('cycle'), pause: () => calls.push('pause') };
        },
      },
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(`${source.slice(start, end + 2)}\ninitializeBlogCarouselRotation(${slides});`, sandbox);
  const last = () => calls[calls.length - 1];
  return { carouselEl, toggle, inner, last, config: () => created };
}

test('the carousel no longer autoplays through Bootstrap', () => {
  // data-bs-ride="carousel" restarts rotation on every mouseleave and control
  // click, so a Pause button could never hold.
  const tag = read('src/index.html').match(/<div id="blogPostsCarousel"[^>]*>/)?.[0] || '';
  assert.doesNotMatch(tag, /data-bs-ride="carousel"/);
  assert.match(tag, /data-bs-pause="false"/);
  const button = read('src/index.html').match(/<button type="button"[^>]*id="blogPostsCarouselRotation"[^>]*>Pause slideshow<\/button>/)?.[0] || '';
  assert.match(button, /aria-controls="blogPostsCarousel"/);
  assert.match(button, /\shidden>/, 'the button stays out of sight until the rotation is wired up');
  // Bootstrap's display utilities are !important and come after its
  // [hidden] { display: none !important } rule, so `d-block hidden` showed a
  // dead "Pause slideshow" button while posts loaded, after a failed load and
  // with fewer than two slides.
  assert.doesNotMatch(button, /class="[^"]*\bd-(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|table)\b/);
});

test('the carousel rotates until paused, and holds while focus or the pointer is inside', () => {
  const { carouselEl, toggle, inner, last, config } = loadCarouselRotation();
  assert.deepEqual({ ...config() }, { ride: false, pause: false });
  assert.equal(toggle.hidden, false);
  assert.equal(last(), 'cycle');
  assert.equal(toggle.textContent, 'Pause slideshow');
  assert.equal(inner.getAttribute('aria-live'), 'off');

  // A focused slide link was hidden by the next slide change (WCAG 2.4.3).
  carouselEl.fire('focusin');
  assert.equal(last(), 'pause');
  assert.equal(inner.getAttribute('aria-live'), 'polite');
  carouselEl.fire('focusout', { relatedTarget: { insideCarousel: true } });
  assert.equal(last(), 'pause', 'focus moving within the slider keeps it still');
  carouselEl.fire('focusout', { relatedTarget: null });
  assert.equal(last(), 'cycle');

  carouselEl.fire('mouseenter');
  assert.equal(last(), 'pause');
  carouselEl.fire('mouseleave');
  assert.equal(last(), 'cycle');

  // WCAG 2.2.2: a way to stop it that stays stopped.
  toggle.fire('click');
  assert.equal(last(), 'pause');
  assert.equal(toggle.textContent, 'Play slideshow');
  carouselEl.fire('mouseenter');
  carouselEl.fire('mouseleave');
  carouselEl.fire('focusin');
  carouselEl.fire('focusout', { relatedTarget: null });
  assert.equal(last(), 'pause');
  toggle.fire('click');
  assert.equal(last(), 'cycle');
  assert.equal(toggle.textContent, 'Pause slideshow');
});

test('the carousel starts stopped for reduced motion, and has no control with one slide', () => {
  const reduced = loadCarouselRotation({ reducedMotion: true });
  assert.equal(reduced.last(), 'pause');
  assert.equal(reduced.toggle.textContent, 'Play slideshow');
  const single = loadCarouselRotation({ slides: 1 });
  assert.equal(single.toggle.hidden, true);
  assert.equal(single.config(), null);
});

// ---------- L47: stacked link lists ----------

test('stacked text-link lists keep 24px between targets', () => {
  // 16-19px-tall links one per line with no gap (WCAG 2.5.8).
  const css = read('theme.css');
  const rule = css.match(/nav\.legal-copy ol > li \+ li,\s*\.blog-sidebar-series ol > li \+ li \{\s*margin-top: ([\d.]+)rem;/);
  assert.ok(rule, 'spacing rule for the stacked link lists is missing');
  assert.ok(Number(rule[1]) >= 0.5);
  for (const page of ['privacy', 'terms', 'disclaimer']) {
    assert.match(read(`src/${page}.html`), /<nav class="[^"]*legal-copy" aria-label="On this page">\s*<p[^>]*>On this page<\/p>\s*<ol/);
  }
  assert.match(read('src/blog.html'), /<aside class="blog-sidebar-series[^"]*"[\s\S]*?<ol/);
});
