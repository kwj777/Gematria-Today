import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// glossary-popup.js needs a real DOM (TreeWalker, DOMParser, layout boxes), so
// its behaviour is verified in a browser rather than here. These are the
// source-level invariants behind that behaviour: each one, if reverted, puts
// back a specific bug, and each is cheap to check without a browser.
const SOURCE = readFileSync(new URL('../glossary-popup.js', import.meta.url), 'utf8');
const BUNDLE = readFileSync(new URL('../site-bundle.js', import.meta.url), 'utf8');

test('the panel is parented to the term that opened it', () => {
  // Appended to <body> it was the last element in the document, so Tab from a
  // term never reached the "See full definition" link inside it (WCAG 1.4.13).
  assert.match(
    SOURCE,
    /btn\.insertAdjacentElement\('afterend', popup\)/,
    'the panel must be inserted next to its trigger so it is the next tab stop',
  );
});

test('the panel is phrasing content, not a block element', () => {
  // Terms are substituted into text nodes, so the panel usually lands inside a
  // <p>. A <div> or <p> there is invalid nesting.
  assert.match(SOURCE, /popup = document\.createElement\('span'\)/);
  assert.doesNotMatch(SOURCE, /popup = document\.createElement\('div'\)/);
  for (const part of ['defn-popup__title', 'defn-popup__body']) {
    const decl = new RegExp(`createElement\\('(\\w+)'\\);\\s*\\n\\s*\\w+\\.className = '${part}'`);
    const match = SOURCE.match(decl);
    assert.ok(match, `could not find the element created for .${part}`);
    assert.equal(match[1], 'span', `.${part} must be a span so it nests inside a paragraph`);
  }
});

test('the term is a disclosure, not a tooltip', () => {
  // ARIA's tooltip pattern forbids interactive content, and this panel holds a
  // link. aria-describedby also pointed at an element that is `hidden` almost
  // all the time, so it described nothing.
  assert.match(SOURCE, /setAttribute\('aria-expanded', 'false'\)/);
  assert.match(SOURCE, /setAttribute\('aria-controls', POPUP_ID\)/);
  assert.doesNotMatch(SOURCE, /setAttribute\('role', 'tooltip'\)/);
  // Matched as a call, not as a word -- the comment above the replacement
  // explains why aria-describedby was dropped and would trip a bare search.
  assert.doesNotMatch(SOURCE, /setAttribute\(\s*'aria-describedby'/);
});

test('positioning is viewport-based and corrects for any containing block', () => {
  // The panel now sits under an arbitrary ancestor, and a transform, filter or
  // contain anywhere above it silently moves the origin of position: fixed.
  assert.match(SOURCE, /\.defn-popup\{position:fixed/);
  assert.match(SOURCE, /popup\.getBoundingClientRect\(\)/);
  assert.match(SOURCE, /var dx = left - landed\.left/);
  assert.match(SOURCE, /var dy = top - landed\.top/);
  // Page-scroll offsets belong to the old absolute positioning; mixing them
  // with fixed placement puts the panel a scroll-height away from its term.
  assert.doesNotMatch(SOURCE, /window\.scroll[XY] \+ r\./);
});

test('the panel is drawn in the top layer, above the stacking context it sits in', () => {
  // Parented to its term, the panel was trapped in that term's stacking
  // context: in a hero (every child z-index:1) the artwork painted over the
  // definition and its link, and on the guides the sticky "On this page"
  // panel did. z-index cannot climb out of a stacking context; a popover can.
  assert.match(SOURCE, /popup\.setAttribute\('popover', 'manual'\)/);
  assert.match(SOURCE, /popup\.showPopover\(\)/);
  assert.match(SOURCE, /popup\.hidePopover\(\)/);
  // Shown after the move next to the term: removing a popover from the
  // document closes it, so showing first would leave it in flow.
  const showFor = SOURCE.slice(SOURCE.indexOf('function showFor('), SOURCE.indexOf('function scheduleHide('));
  assert.ok(
    showFor.indexOf("insertAdjacentElement('afterend', popup)") < showFor.indexOf('setTopLayer(true)'),
    'the panel must enter the top layer after it is moved next to its term',
  );
  // The UA's [popover] defaults centre it in the viewport with a border and a
  // scrollbar; the panel's own rule has to undo them.
  const rule = SOURCE.match(/'\.defn-popup\{[^}]*\}'/)?.[0] || '';
  for (const decl of ['inset:auto', 'margin:0', 'border:0', 'overflow:visible']) {
    assert.ok(rule.includes(decl), `.defn-popup must set ${decl}`);
  }
});

test('the definitions parser takes the definition, not the badge-and-link <dd>', () => {
  // Each definitions.html card is <dt>, <dd>, <dd class="defn-card__meta">.
  assert.match(SOURCE, /querySelector\('dd:not\(\.defn-card__meta\)'\)/);
  // Copies of this script from before the meta <dd> existed take a card's
  // first <dd>, and a visitor's service worker keeps serving the precached
  // site-bundle.js after a deploy. With the badge-and-link <dd> first, every
  // popup on the site read "Beginner #" where the definition belongs.
  const html = readFileSync(new URL('../src/definitions.html', import.meta.url), 'utf8');
  const cards = [...html.matchAll(/<div class="defn-card"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.equal(cards.length, 30);
  for (const card of cards) {
    const dds = [...card.matchAll(/<dd\b[^>]*>/g)].map((m) => m[0]);
    assert.deepEqual(dds, ['<dd>', '<dd class="defn-card__meta">'], `the definition must be the card's first <dd>: ${card.slice(0, 80)}`);
  }
});

test('closing keeps focus on the term instead of stranding it', () => {
  assert.match(SOURCE, /function hidePopup\(restoreFocus\)/);
  assert.match(SOURCE, /suppressFocusOpen = true;[\s\S]{0,200}btn\.focus\(\)/);
});

test('restoring focus does not reopen the panel it just closed', () => {
  // Focus opens the panel, so hidePopup's own focus() call would reopen it and
  // Escape would appear to do nothing.
  assert.match(SOURCE, /if \(suppressFocusOpen\) return;/);
});

test('the panel survives the keyboard entering it', () => {
  // Without this the hide timer fired as soon as the pointer left, closing the
  // panel under someone who had tabbed to the link inside it.
  assert.match(SOURCE, /function focusIsInsidePopup\(\)/);
  assert.match(SOURCE, /if \(focusIsInsidePopup\(\)\) return;/);
});

test('a click is not undone by the hover or focus that preceded it', () => {
  // Hovering opened the panel and the click then closed it, so a deliberate
  // click made the definition flash and vanish; on a touch device, where
  // nothing opens it first, a tap did nothing visible at all.
  assert.match(SOURCE, /openedThisInteraction/);
  assert.match(SOURCE, /!openedThisInteraction\) \{\s*\n\s*hidePopup\(false\)/);
});

test('site-bundle.js carries the current glossary source', () => {
  // glossary-popup.js is concatenated into the bundle every page loads. Editing
  // the source without rebuilding ships the old behaviour; `npm run lint`
  // catches it too, but this says which file drifted.
  assert.ok(
    BUNDLE.includes(SOURCE.replace(/\s+$/, '')),
    'run `npm run build:bundle` -- site-bundle.js is out of date with glossary-popup.js',
  );
});
