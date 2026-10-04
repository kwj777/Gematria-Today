import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The forum and admin-forum page scripts are classic browser scripts, so they
// cannot be imported. They are run here against a DOM stub just rich enough
// to load them: elements record their innerHTML and listeners, and fetch never
// settles, so the page's own startup requests simply stay pending.
const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function makeElement() {
  const attributes = new Map();
  const listeners = {};
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    className: '',
    dataset: {},
    style: {},
    children: [],
    listeners,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    removeAttribute(name) { attributes.delete(name); },
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild(child) { this.children.push(child); return child; },
    append(...nodes) { this.children.push(...nodes); },
    dispatchEvent() { return true; },
    scrollIntoView() {},
    focus() {},
    reset() {},
  };
}

function loadPageScript(relativePath) {
  const elements = new Map();
  const fetches = [];
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  };
  const document = {
    getElementById: getElement,
    createElement: () => makeElement(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    body: makeElement(),
    documentElement: makeElement(),
  };
  const context = {
    document,
    console,
    URLSearchParams,
    Event: class { constructor(type) { this.type = type; } },
    setTimeout,
    clearTimeout,
    fetch: (url) => { fetches.push(String(url)); return new Promise(() => {}); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {},
    innerWidth: 1024,
    location: { href: '' },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read(relativePath), context, { filename: relativePath });
  return { context, element: getElement, fetches };
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)")?/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? '';
  }
  return attributes;
}

const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'wbr']);

function isInteractive(tag, attributes) {
  if (tag === 'button' || tag === 'select' || tag === 'textarea') return true;
  if (tag === 'input') return attributes.type !== 'hidden';
  if (tag === 'a') return 'href' in attributes;
  if (['button', 'link', 'checkbox', 'tab', 'menuitem'].includes(attributes.role)) return true;
  return 'tabindex' in attributes && attributes.tabindex !== '-1';
}

// Equivalent of axe's nested-interactive rule over a static HTML string.
function nestedInteractive(html) {
  const stack = [];
  const problems = [];
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const [, closing, rawTag, rawAttributes] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const index = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (index !== -1) stack.length = index;
      continue;
    }
    const attributes = parseAttributes(rawAttributes);
    const interactive = isInteractive(tag, attributes);
    const outer = stack.find((entry) => entry.interactive);
    if (interactive && outer) problems.push(`<${tag}> inside interactive <${outer.tag}>`);
    if (!VOID_TAGS.has(tag) && !rawAttributes.trim().endsWith('/')) stack.push({ tag, interactive });
  }
  return problems;
}

// Every form control needs a label it is actually associated with, and every
// visible <label> must name a control (for= an existing id, or wrap one).
function labelProblems(html) {
  const problems = [];
  const labelFor = new Set();
  const controlIds = new Set();
  const controls = [];
  const openLabels = [];
  for (const match of html.matchAll(/<(\/?)(label|input|select|textarea)\b([^>]*)>/gi)) {
    const [, closing, rawTag, rawAttributes] = match;
    const tag = rawTag.toLowerCase();
    if (tag === 'label') {
      if (closing) {
        const label = openLabels.pop();
        if (label && !label.forId && !label.wraps) problems.push('label neither has for= nor wraps a control');
      } else {
        const forId = parseAttributes(rawAttributes).for || '';
        if (forId) labelFor.add(forId);
        openLabels.push({ forId, wraps: false });
      }
      continue;
    }
    if (closing) continue;
    const attributes = parseAttributes(rawAttributes);
    if (attributes.type === 'hidden') continue;
    if (openLabels.length) openLabels[openLabels.length - 1].wraps = true;
    if (attributes.id) controlIds.add(attributes.id);
    controls.push({ tag, attributes, wrapped: openLabels.length > 0 });
  }
  for (const forId of labelFor) {
    if (!controlIds.has(forId)) problems.push(`label for="${forId}" points at no control`);
  }
  for (const { tag, attributes, wrapped } of controls) {
    const named = wrapped || 'aria-label' in attributes || 'aria-labelledby' in attributes
      || (attributes.id && labelFor.has(attributes.id));
    if (!named) problems.push(`<${tag} name="${attributes.name || ''}" class="${attributes.class || ''}"> has no label`);
  }
  return problems;
}

function luminance(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(hexA, hexB) {
  const [a, b] = [luminance(hexA), luminance(hexB)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const toHex = (channels) => `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const blend = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];

const sampleThread = {
  id: 42,
  title: 'Is 26 the <b>key</b>?',
  body: 'An excerpt that screen readers must still be able to reach.',
  isLocked: true,
  categoryName: 'General',
  categoryColorBadge: '#0dcaf0',
  authorUsername: 'seeker',
  authorDisplayName: 'Seeker',
  authorReputation: 12,
  authorBadges: ['Beginner Path Graduate', 'Contributor'],
  replyCount: 3,
  viewCount: 40,
  popularityScore: 7,
};

test('forum thread cards expose their content and do not nest controls in a button', () => {
  const page = loadPageScript('page-scripts/forum-1.js');
  page.context.renderThreads([sampleThread]);
  const html = page.element('threadList').innerHTML;

  const article = /<article\b([^>]*)>/.exec(html);
  assert.ok(article, 'a thread card is rendered');
  const articleAttributes = parseAttributes(article[1]);
  // role="button" made the excerpt, author, counts and Locked badge
  // presentational and replaced them all with the aria-label.
  assert.equal(articleAttributes.role, undefined, 'the card itself is not a button');
  assert.equal(articleAttributes.tabindex, undefined, 'the card itself is not a tab stop');
  assert.equal(articleAttributes['aria-label'], undefined, 'no label overrides the card content');

  assert.deepEqual(nestedInteractive(html), []);
  assert.match(html, /<a class="forum-badge[^"]*" href="\/b\/seeker"/, 'the badge link is still rendered');
  assert.match(html, /class="forum-author-trigger"/, 'the author profile control is still rendered');

  const opener = /<button type="button" class="forum-thread-open">([^<]*(?:<(?!\/button>)[^<]*)*)<\/button>/.exec(html);
  assert.ok(opener, 'the thread title is a real button');
  assert.equal(opener[1], 'Is 26 the &lt;b&gt;key&lt;/b&gt;?', 'the button is named by the escaped title');
});

// A click target as a chain of 'tag.class.class' steps from the clicked element
// up to the card, with an Element#closest for the simple selectors the card's
// handler uses: tag, .class, and tag:not(.class).
function clickTarget(...path) {
  const chain = path.map((step) => {
    const [tag, ...classes] = step.split('.');
    return { tag, classes };
  });
  const matches = ({ tag, classes }, selector) => {
    const parsed = /^([a-z]*)((?:\.[\w-]+)*)(?::not\(\.([\w-]+)\))?$/.exec(selector.trim());
    if (!parsed) throw new Error(`clickTarget cannot match selector "${selector}"`);
    const [, wantTag, wantClasses, notClass] = parsed;
    if (wantTag && wantTag !== tag) return false;
    if (wantClasses.split('.').filter(Boolean).some((name) => !classes.includes(name))) return false;
    return !(notClass && classes.includes(notClass));
  };
  return {
    closest: (selectorList) => chain.find((element) => selectorList.split(',').some((selector) => matches(element, selector))) || null,
  };
}

function renderOneCard() {
  const page = loadPageScript('page-scripts/forum-1.js');
  const card = makeElement();
  card.dataset.threadId = '42';
  page.element('threadList').querySelectorAll = (selector) => (selector === '[data-thread-id]' ? [card] : []);
  page.context.renderThreads([sampleThread]);
  const [onClick] = card.listeners.click;
  const opened = () => page.fetches.filter((url) => url.includes('action=thread&')).length;
  return { onClick, opened };
}

const CARD = ['div.d-flex.no-glossary', 'article.forum-thread-card'];
const MAIN = ['div.forum-thread-card-main', ...CARD];
const META = ['p.small.text-muted.forum-meta', ...MAIN];

test('the card opens the thread from its title and its plain text', () => {
  const { onClick, opened } = renderOneCard();
  onClick({ target: clickTarget('button.forum-thread-open', 'h3.forum-subtitle', ...MAIN) });
  assert.equal(opened(), 1, 'a click on the title button (or Enter/Space on it) opens the thread');
  onClick({ target: clickTarget('p.forum-body', ...MAIN) });
  assert.equal(opened(), 2, 'a mouse click on the excerpt still opens the thread');
});

test('controls inside the card and the popups they open do not also open the thread', () => {
  const { onClick, opened } = renderOneCard();
  const AUTHOR = ['span.forum-author', 'span.forum-meta-item', ...META];
  const POPOVER = ['div.forum-profile-popover', ...AUTHOR];
  const targets = {
    'badge link': clickTarget('span.forum-badge-label', 'a.forum-badge', ...AUTHOR),
    'author profile trigger': clickTarget('button.forum-author-trigger', ...AUTHOR),
    'author profile text': clickTarget('p.small.text-muted', ...POPOVER),
    'author profile close': clickTarget('button.forum-profile-popover-close', 'div.d-flex', ...POPOVER),
    // The glossary scans any added subtree that is not an interactive role, so
    // once the card stopped being role="button" a term in it was a click away.
    'glossary term': clickTarget('button.defn-term', 'p.forum-body', ...MAIN),
    'glossary term in the profile': clickTarget('button.defn-term', 'p.small', ...POPOVER),
    // showFor() inserts the definition panel right after its term, inside the card.
    'glossary definition text': clickTarget('span.defn-popup__body', 'span.defn-popup', 'p.forum-body', ...MAIN),
    'glossary definition title': clickTarget('span.defn-popup__title', 'span.defn-popup', 'p.forum-body', ...MAIN),
    'glossary definition link': clickTarget('a.defn-popup__link', 'span.defn-popup', 'p.forum-body', ...MAIN),
  };
  for (const [name, target] of Object.entries(targets)) {
    onClick({ target });
    assert.equal(opened(), 0, `a click on the ${name} does not open the thread`);
  }
});

test('thread cards stay out of the glossary, as they were while role="button"', () => {
  const page = loadPageScript('page-scripts/forum-1.js');
  page.context.renderThreads([{ ...sampleThread, body: 'I found a match using gematria on my name and the English Ordinal cipher.' }]);
  const html = page.element('threadList').innerHTML;
  // Every piece of card text sits under an element the glossary skips.
  const stack = [];
  const unshielded = [];
  let cursor = 0;
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const text = html.slice(cursor, match.index).trim();
    if (text && stack.length && !stack.some((entry) => entry.shielded)) unshielded.push(text);
    cursor = match.index + match[0].length;
    const [, closing, rawTag, rawAttributes] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const index = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (index !== -1) stack.length = index;
      continue;
    }
    // The card root itself is never checked (ancestorDisallowed stops below the
    // root), so the marker has to be on an element inside the <article>.
    const classes = (parseAttributes(rawAttributes).class || '').split(/\s+/);
    const shielded = tag !== 'article' && classes.includes('no-glossary');
    if (!VOID_TAGS.has(tag)) stack.push({ tag, shielded });
  }
  assert.deepEqual(unshielded, []);
  assert.match(html, /I found a match using gematria/, 'the excerpt is rendered');

  const glossary = read('glossary-popup.js');
  assert.match(glossary, /function ancestorDisallowed[\s\S]*?cls\.contains\('no-glossary'\)\) return true;/, 'the glossary honours no-glossary');
});

test('clickable thread cards keep the pointer cursor that role="button" used to give them', () => {
  // Bootstrap's reboot `[role=button]{cursor:pointer}` was what showed the
  // whole card as clickable; the card keeps its click handler, so it needs its own rule.
  const css = read('forum-theme.css');
  assert.match(css, /\.forum-thread-card\[data-thread-id\]\s*\{[^}]*cursor:\s*pointer/, 'real thread cards show a pointer');
  assert.doesNotMatch(css, /\.forum-thread-card\s*\{[^}]*cursor:/, 'skeleton cards (no thread id) do not');
  const page = loadPageScript('page-scripts/forum-1.js');
  page.context.renderThreads([sampleThread]);
  assert.match(page.element('threadList').innerHTML, /<article class="forum-thread-card" data-thread-id="42">/);
});

test('a lifted thread card stacks above the next card, so its author popover is not covered', () => {
  // The lift's transform makes the card a stacking context that traps the
  // popover's z-index:20. The card now lifts on :focus-within, i.e. while
  // focus sits on its author trigger with the popover open, so it has to
  // out-stack the next card's position:relative .forum-author badges.
  const css = read('forum-theme.css')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@[^{;]+\{/g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.split(',').map((selector) => selector.trim()),
    body,
  }));
  const zIndex = (body) => Number(/z-index:\s*(\d+)/.exec(body)?.[1]);

  const lifted = rules.filter(({ selectors, body }) => /transform\s*:/.test(body)
    && selectors.some((selector) => /\.forum-thread-card:(hover|focus-within)$/.test(selector)));
  assert.ok(lifted.length > 0, 'thread cards still lift on hover and focus');
  for (const { selectors, body } of lifted) {
    assert.match(body, /position:\s*relative/, `${selectors.join(', ')} is positioned`);
    assert.ok(zIndex(body) >= 1, `${selectors.join(', ')} raises the lifted card`);
  }

  const open = rules.find(({ selectors }) => selectors.includes('.forum-thread-card:has(.forum-profile-popover)'));
  assert.ok(open, 'the card holding an open author popover has its own stacking rule');
  assert.match(open.body, /position:\s*relative/);
  assert.ok(zIndex(open.body) > Math.max(...lifted.map(({ body }) => zIndex(body))), 'it stays above a hovered neighbour');
});

test('category chip text meets 4.5:1 on any admin-chosen color', () => {
  const { context } = loadPageScript('page-scripts/forum-1.js');
  const reported = ['#0dcaf0', '#fd7e14', '#20c997'];
  const grid = [];
  for (let r = 0; r <= 255; r += 51) {
    for (let g = 0; g <= 255; g += 51) {
      for (let b = 0; b <= 255; b += 51) grid.push(toHex([r, g, b]));
    }
  }
  const grays = Array.from({ length: 256 }, (_, v) => toHex([v, v, v]));
  for (const color of [...reported, ...grid, ...grays]) {
    const text = context.textColorForBackground(color);
    assert.ok(contrast(color, text) >= 4.5, `${text} on ${color} is ${contrast(color, text).toFixed(2)}:1`);
  }
  for (const color of reported) {
    assert.notEqual(context.textColorForBackground(color), '#ffffff', `white on ${color} is unreadable`);
  }
  // The default grey chip keeps its white text.
  assert.equal(context.textColorForBackground('#6c757d'), '#ffffff');
  assert.match(context.renderCategoryChip(sampleThread), /background:#0dcaf0;color:#212529;/);
});

test('light theme forum author popover and trigger keep readable contrast', () => {
  const html = read('src/forum.html');
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(?:^|[}\\s,])${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
    return match ? match[1] : null;
  };

  // The popover is dark in both themes; Bootstrap's light .text-muted is dark gray.
  const popover = rule('.forum-profile-popover');
  const popoverBg = /background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(popover).slice(1).map(Number);
  const popoverBgHex = toHex(blend(popoverBg, [255, 255, 255]));
  const muted = rule('.forum-profile-popover .text-muted');
  assert.ok(muted, 'the popover overrides .text-muted');
  const mutedColor = /color:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(muted).slice(1).map(Number);
  const mutedHex = toHex(blend(mutedColor, blend(popoverBg, [255, 255, 255])));
  assert.ok(contrast(mutedHex, popoverBgHex) >= 4.5, `popover muted text is ${contrast(mutedHex, popoverBgHex).toFixed(2)}:1`);

  // The base (light theme) hover/focus color sits on white thread cards.
  const trigger = /\.forum-author-trigger:hover,\s*\.forum-author-trigger:focus-visible\s*\{\s*color:\s*(#[0-9a-f]{6})/i.exec(css);
  assert.ok(trigger, 'the light theme trigger hover/focus color is set');
  assert.ok(contrast(trigger[1], '#ffffff') >= 4.5, `focused author name is ${contrast(trigger[1], '#ffffff').toFixed(2)}:1 on white`);
  assert.match(css, /:root\[data-bs-theme="dark"\] \.forum-author-trigger:focus-visible\s*\{\s*color:\s*#9ec5fe/i, 'dark cards keep the pale blue');
});

test('admin forum category editors associate every label with its field', () => {
  const page = loadPageScript('page-scripts/admin-forum-1.js');
  page.context.renderCategories([
    { id: 1, name: 'General', slug: 'general', accessTier: 'free', sortOrder: 1, postMode: 'members', defaultSortMode: 'newest', colorBadge: '#0d6efd' },
    { id: 2, name: 'Premium', slug: 'premium', accessTier: 'premium', sortOrder: 2, postMode: 'members', defaultSortMode: 'popular', colorBadge: '' },
  ]);
  const html = page.element('categoriesList').innerHTML;
  assert.deepEqual(labelProblems(html), []);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'field ids are unique across category forms');
  assert.ok(ids.length >= 22, 'both forms carry field ids');
});

test('admin hub site editor rows associate every label with its field', () => {
  const page = loadPageScript('page-scripts/admin-hub-2.js');
  const [addRow] = page.element('addSiteBtn').listeners.click;
  addRow();
  addRow();
  const rows = page.element('siteEditor').children;
  assert.equal(rows.length, 2);
  const html = rows.map((row) => row.innerHTML).join('\n');
  assert.deepEqual(labelProblems(html), []);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 10, 'five labelled fields per row');
  assert.equal(new Set(ids).size, ids.length, 'field ids are unique across rows');
});
