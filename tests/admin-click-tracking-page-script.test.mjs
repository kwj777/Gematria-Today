import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../page-scripts/admin-click-tracking-1.js', import.meta.url), 'utf8');

// The page script is a classic script that touches the DOM at load, so pull
// out just the helpers under test and run them in a small sandbox.
function extractFunction(name) {
  const start = SOURCE.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing from admin-click-tracking-1.js`);
  let depth = 0;
  for (let index = SOURCE.indexOf('{', start); index < SOURCE.length; index += 1) {
    if (SOURCE[index] === '{') depth += 1;
    if (SOURCE[index] === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, index + 1);
    }
  }
  throw new Error(`Could not find the end of ${name}`);
}

function loadLinkHelpers(origin = 'https://gematria.today') {
  const context = vm.createContext({ URL, window: { location: { origin } } });
  vm.runInContext(['escapeHtml', 'toSameOriginHref', 'renderElementLinkCell'].map(extractFunction).join('\n'), context);
  return context;
}

test('same-origin element links render as links', () => {
  const { renderElementLinkCell } = loadLinkHelpers();
  assert.equal(
    renderElementLinkCell('https://gematria.today/calculator.html#calculateButton', 'Open'),
    '<a href="https://gematria.today/calculator.html#calculateButton" target="_blank" rel="noopener noreferrer">Open</a>',
  );
  assert.match(renderElementLinkCell('/calculator.html?word=love', 'Open element'), /^<a href="https:\/\/gematria\.today\/calculator\.html\?word=love"/);
});

test('off-site and script links from forged click rows are shown as text, not links', () => {
  // Anyone can write click rows through /api/public-button-report, so these
  // values are attacker-chosen.
  const { renderElementLinkCell } = loadLinkHelpers();
  for (const link of [
    'https://gematria-today.example/admin.html?session=expired',
    '//phish.example/admin.html',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ]) {
    const cell = renderElementLinkCell(link, 'Open');
    assert.doesNotMatch(cell, /<a\b/, `${link} must not become a link`);
    assert.doesNotMatch(cell, /<script/);
  }
});

test('an empty element link shows a dash', () => {
  const { renderElementLinkCell } = loadLinkHelpers();
  assert.equal(renderElementLinkCell('', 'Open'), '<span class="text-muted">—</span>');
});

test('every link cell in the click tables goes through the same-origin check', () => {
  // Both tables built their own <a href> from the row's elementLink before.
  const anchors = SOURCE.match(/<a href="/g) || [];
  assert.equal(anchors.length, 1, 'only renderElementLinkCell should build an <a href>');
  assert.match(extractFunction('renderElementLinkCell'), /<a href="' \+ escapeHtml\(href\)/);
});
