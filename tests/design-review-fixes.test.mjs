import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { englishGematria } from '../netlify/functions/englishGematria.mjs';

// A browser design review found the calculators' inputs 950-1,290px down a
// 390x844 phone, sign-up buttons in Bootstrap blue or 1.5:1 yellow, the
// header "Join free" landing mid-page on a beginner-course screen, and the
// blog's email box unstyled. These pin the fixes.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const TOOL_PAGES = [
  ['src/calculator.html', 'lookup-form'],
  ['src/multi-cipher-calculator.html', 'multi-cipher-form'],
  ['src/name-calculator.html', 'name-form'],
];

test('tool pages use the compact hero and hide its art below lg', () => {
  for (const [page] of TOOL_PAGES) {
    const html = read(page);
    assert.match(html, /<section class="hero-panel hero-panel--compact /, page);
    assert.match(html, /<div class="col-lg-4 d-none d-lg-block">\s*<figure/, page);
  }
});

test('tool hero art is sized to the SVGs it shows, so it is not cropped', () => {
  for (const [page] of TOOL_PAGES) {
    const html = read(page);
    const img = html.match(/<img\s+class="blog-hero-image"\s+src="\/(assets\/[\w-]+\.svg)"[\s\S]*?width="(\d+)"\s+height="(\d+)"/);
    assert.ok(img, `${page} hero image not found`);
    const [, svgPath, width, height] = img;
    const [, , , vbWidth, vbHeight] = read(svgPath).match(/viewBox="(\d+) (\d+) (\d+) (\d+)"/).map(Number);
    assert.equal(Number(width) / Number(height), vbWidth / vbHeight, `${page}: ${svgPath} is ${vbWidth}x${vbHeight}`);
  }
});

test('the member box and learning-path nudge come after the form, not before it', () => {
  for (const [page, formId] of TOOL_PAGES) {
    const html = read(page);
    const formAt = html.indexOf(`id="${formId}"`);
    assert.ok(formAt > 0, `${page} lost #${formId}`);
    for (const id of ['member-save-shell', 'learningPathNudge']) {
      const at = html.indexOf(`id="${id}"`);
      if (at === -1) continue;
      assert.ok(at > formAt, `${page}: #${id} sits above the form again`);
    }
  }
});

test('the calculator lead describes the tool, not the layout', () => {
  assert.ok(!read('src/calculator.html').includes('consistent site form layout'));
});

test('the lookup placeholder examples are values the calculator accepts', () => {
  const html = read('src/calculator.html');
  const placeholder = html.match(/<input id="lookup-input"[^>]*placeholder="([^"]+)"/)?.[1] || '';
  const [, word, number] = placeholder.match(/^e\.g\. (\w+) or (\d+)$/) || [];
  assert.ok(word && number, `unexpected placeholder: "${placeholder}"`);
  assert.equal(Number(number) % 6, 0, 'a number example must be a multiple of 6');
  assert.equal(englishGematria(word), number, `${word} does not come to ${number}`);
});

test('the learning-path nudge counts a view only after half of it stays on screen for a second', () => {
  const source = read('page-scripts/learning-path-nudge.js');
  let callback = null;
  let options = null;
  const timers = new Map();
  let nextTimer = 1;
  const storage = () => {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  };
  const tracked = [];
  const nudge = { dataset: { nudgeSource: 'calculator_page' }, classList: { remove() {}, add() {} } };
  const window = {
    localStorage: storage(),
    sessionStorage: storage(),
    gematriaTracking: { track: (name) => tracked.push(name) },
    setTimeout: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    IntersectionObserver: class {
      constructor(cb, opts) { callback = cb; options = opts; }
      observe(el) { assert.equal(el, nudge); }
      disconnect() { callback = null; }
    },
  };
  const document = { readyState: 'complete', getElementById: (id) => (id === 'learningPathNudge' ? nudge : null) };
  const runTimers = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); };
  const shown = () => window.sessionStorage.getItem('learningPathNudgeShownThisSession');
  vm.runInNewContext(source, { window, document, Date });
  assert.ok(options.threshold.includes(0.5));

  // On screen at load, then pushed below the fold before a second passes.
  callback([{ intersectionRatio: 1 }]);
  callback([{ intersectionRatio: 0 }]);
  runTimers();
  assert.deepEqual(tracked, [], 'counted although it left the screen');
  assert.equal(shown(), null);

  // A sliver on screen is not a view.
  callback([{ intersectionRatio: 0.2 }]);
  runTimers();
  assert.deepEqual(tracked, []);

  // Half or more on screen for the whole second is.
  callback([{ intersectionRatio: 0.6 }]);
  runTimers();
  assert.deepEqual(tracked, ['beginner_path_nudge_view']);
  assert.equal(shown(), '1');
  assert.equal(callback, null, 'kept observing after counting the view');
});

test('a sidebar tag tapped on a phone scrolls the post list back into view', () => {
  // renderPosts() rebuilds the tag chips, detaching the one that was tapped,
  // so where the tap came from has to be read before the re-render.
  const source = read('page-scripts/blog-2.js');
  const branch = source.slice(source.indexOf("event.target.closest('[data-tag-filter]')"));
  const sidebarCheck = branch.indexOf("tagFilter.closest('#blogTagFilters')");
  const rerender = branch.indexOf('renderPosts(latestPosts)');
  const scroll = branch.indexOf("getElementById('blogListToolbar')?.scrollIntoView");
  assert.ok(sidebarCheck > 0 && sidebarCheck < rerender, 'the sidebar check must run before renderPosts()');
  assert.ok(scroll > rerender, 'the scroll must run after the list is re-rendered');
});

test('the calculator shows the nudge above the member box, so the box appearing cannot push it away', () => {
  const html = read('src/calculator.html');
  const resultsAt = html.indexOf('id="related-words-result"');
  const nudgeAt = html.indexOf('id="learningPathNudge"');
  const shellAt = html.indexOf('id="member-save-shell"');
  assert.ok(resultsAt < nudgeAt && nudgeAt < shellAt);
});

test('the pinned blog sidebar scrolls on its own on desktop', () => {
  const css = read('theme.css');
  assert.match(css, /@media \(min-width: 992px\) \{\s*\.blog-sidebar \{\s*max-height: calc\(100vh - 6\.5rem\);\s*overflow-y: auto;/);
});

test('blog: posts come first in the markup, the sidebar stays on the left from lg up', () => {
  const html = read('src/blog.html');
  const postsAt = html.indexOf('<div class="col-lg-8">\n            <aside id="learningPathCompletionBanner"');
  const sidebarAt = html.indexOf('<div class="col-lg-4 order-lg-first">');
  assert.ok(postsAt > 0 && sidebarAt > postsAt, 'the post column must precede the sidebar');
  assert.match(html, /<div class="container d-flex flex-column">/);
  assert.match(html, /id="blogEditorialTrustPanel" class="[^"]*\border-last order-lg-0\b/);
  assert.match(html, /<div class="col-lg-4 d-none d-lg-block">\s*<figure[^>]*blog-hero-figure/);
  assert.match(html, /<link rel="preload" as="image" href="\/assets\/blog-hero-insights-16x9\.svg"[^>]*media="\(min-width: 992px\)"/);
});

test('the blog email box styles match its markup', () => {
  const css = read('theme.css');
  const html = read('src/blog.html');
  assert.ok(!css.includes('[attr-a]'), 'stale follow.it attribute selectors are back');
  assert.match(html, /<div class="followit--follow-form-container followit-card followit-card--sidebar">/);
  assert.match(html, /<div class="preview-heading"[^>]*>\s*<h3 /);
  assert.match(css, /^\.followit--follow-form-container \.form-preview \.preview-heading h3 \{/m);
  assert.match(css, /^\.followit-card--sidebar \.form-preview \.preview-heading h3 \{/m);
});

function accountSetupVariant(href, referrer) {
  const documentElement = { dataset: {} };
  vm.runInNewContext(read('page-scripts/gematria-account-setup-variant.js'), {
    URL,
    location: { href },
    document: { referrer, documentElement },
  });
  return documentElement.dataset.l0Variant;
}

test('the header "Join free" opens the plain sign-up page', () => {
  const nav = read('src/_includes/nav.html');
  const href = nav.match(/nav-cta--join"[^>]*><a [^>]*href="([^"]+)">Join free</)?.[1];
  assert.equal(href, '/gematria-account-setup.html?from=nav');
  const page = `https://gematria.today${href}`;
  assert.equal(accountSetupVariant(page, 'https://gematria.today/'), 'default');
  assert.equal(accountSetupVariant(page, 'https://gematria.today/index.html'), 'default');
  assert.equal(accountSetupVariant(page, 'https://gematria.today/calculator.html'), 'calculator');
  // Links that ask for the beginner course still get it.
  assert.equal(accountSetupVariant('https://gematria.today/gematria-account-setup.html?return=/gematria-basics.html', ''), 'learning');
  assert.equal(accountSetupVariant('https://gematria.today/gematria-account-setup.html', 'https://gematria.today/'), 'learning');
});

test('the account setup page does not jump to the username field on load', () => {
  const input = read('src/gematria-account-setup.html').match(/<input id="lzRegUsername"[^>]*>/)[0];
  assert.doesNotMatch(input, /\sautofocus\b/);
});

test('the Membership sign-up form is short, amber and above the plan table', () => {
  const html = read('src/member.html');
  assert.ok(html.indexOf('<section id="authSection"') < html.indexOf('<section id="comparisonSection"'));
  const form = html.match(/<form id="registerForm"[\s\S]*?<\/form>/)[0];
  assert.doesNotMatch(form, /registerConfirmPassword/);
  assert.match(form, /for="registerDisplayName">Display name <span class="text-muted">\(optional\)<\/span>/);
  assert.match(form, /<button class="btn btn-warning fw-semibold" type="submit">Create my free account<\/button>/);
  assert.match(html, /<a id="membershipHeroCta" class="btn btn-warning btn-lg"/);
});

test('sign-up buttons are amber, never Bootstrap blue', () => {
  const checks = [
    ['src/calculator.html', /<a id="member-link" class="btn btn-outline-warning btn-sm"/],
    ['src/multi-cipher-calculator.html', /<a id="member-link" class="btn btn-outline-warning btn-sm"/],
    ['page-scripts/calculator-1.js', /memberLink\.classList\.add\('btn-outline-warning'\)/],
    ['page-scripts/forum-1.js', /signUpLink\.className = 'btn btn-warning fw-semibold'/],
    ['page-scripts/forum-1.js', /signInLink\.className = 'btn btn-outline-warning fw-semibold'/],
    ['page-scripts/calculator-1.js', /cta\.className = 'btn btn-sm btn-outline-warning mt-2'/],
    ['page-scripts/name-calculator-1.js', /cta\.className = 'btn btn-sm btn-outline-warning'/],
    ['page-scripts/multi-cipher-calculator-1.js', /memberLink\.classList\.remove\('btn-outline-warning'\)/],
    ['src/member.html', /<a id="comparisonCreateAccountButton" class="btn btn-outline-warning"/],
    ['src/member.html', /<button id="paymentButton" class="btn btn-warning /],
    ['src/definitions.html', /<a class="btn btn-warning fw-semibold" href="\/gematria-account-setup\.html\?return=\/gematria-basics\.html"/],
  ];
  for (const [file, pattern] of checks) assert.match(read(file), pattern, file);
  assert.doesNotMatch(read('page-scripts/calculator-1.js'), /memberLink\.classList\.add\('btn-primary'\)/);
});
