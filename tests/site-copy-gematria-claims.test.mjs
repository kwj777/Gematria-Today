import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digitalRoot, englishGematria } from '../netlify/functions/englishGematria.mjs';
import { CIPHERS } from '../page-scripts/multi-cipher-engine.mjs';

// tools.html hand-writes gematria values into marketing copy -- the tool-card
// previews and the sample GemaBot answer. Nothing recomputed them, and four of
// them were wrong: it claimed light's Reverse Ordinal was 106 (it is 79), and
// offered "creator"/"sunrise" as 336 matches and "truth"/"kingdom" as 324
// matches when those words are 480, 630, 522 and 438. Every claim below is
// asserted twice: that the copy still says it, and that the engines agree.
const TOOLS_HTML = readFileSync(new URL('../src/tools.html', import.meta.url), 'utf8');

function cipherValue(cipherId, word) {
  const cipher = CIPHERS.find((entry) => entry.id === cipherId);
  assert.ok(cipher, `unknown cipher ${cipherId}`);
  let total = 0;
  for (const char of word.toUpperCase()) {
    const index = char.charCodeAt(0) - 64;
    if (index >= 1 && index <= 26) total += cipher.valueFor(index);
  }
  return total;
}

function assertCopyContains(snippet) {
  assert.ok(
    TOOLS_HTML.includes(snippet),
    `src/tools.html no longer contains the pinned copy:\n  ${snippet}\nIf you changed the wording, update this test and recheck the arithmetic.`,
  );
}

// ---------- tool card previews ----------

test('the calculator card preview quotes real English gematria values', () => {
  assertCopyContains('<code>light</code> = 336 &middot; <code>truth</code> = 522');
  assert.equal(englishGematria('light'), '336');
  assert.equal(englishGematria('truth'), '522');
});

test('the multi-cipher card preview quotes real per-cipher values for "light"', () => {
  assertCopyContains('<code>light</code> &rarr; Ordinal 56 &middot; Reverse Ordinal 79 &middot; Sumerian 336');
  assert.equal(cipherValue('english-ordinal', 'light'), 56);
  assert.equal(cipherValue('reverse-ordinal', 'light'), 79);
  assert.equal(cipherValue('sumerian', 'light'), 336);
});

test('no cipher on the site produces the 106 the preview used to claim', () => {
  const values = CIPHERS.map((cipher) => cipherValue(cipher.id, 'light'));
  assert.ok(!values.includes(106), `106 is now reachable for "light": ${values.join(', ')}`);
});

// ---------- sample GemaBot answer ----------

test('the sample answer table matches the calculator', () => {
  for (const [word, total, root] of [['light', 336, 3], ['love', 324, 9]]) {
    assert.equal(englishGematria(word), String(total));
    assert.equal(digitalRoot(total), root);
    assertCopyContains(`<th scope="row">${word}</th><td class="text-end">${total}</td><td class="text-end">${root}</td>`);
  }
});

test('the sample answer per-letter breakdowns add up', () => {
  const breakdowns = {
    light: [['L', 72], ['I', 54], ['G', 42], ['H', 48], ['T', 120]],
    love: [['L', 72], ['O', 90], ['V', 132], ['E', 30]],
  };
  for (const [word, letters] of Object.entries(breakdowns)) {
    const sum = letters.reduce((total, [, value]) => total + value, 0);
    assert.equal(String(sum), englishGematria(word));
    for (const [letter, value] of letters) {
      assert.equal(englishGematria(letter), String(value), `${letter} is not ${value}`);
    }
    assertCopyContains(`${letters.map(([l, v]) => `${l} ${v}`).join(' + ')} = ${sum}`);
  }
});

test('the anchor words offered as shared-value matches really share those values', () => {
  assertCopyContains('336 also matches words like <em>alter</em> and <em>later</em>; 324 matches <em>voice</em> and <em>float</em>');
  for (const word of ['alter', 'later']) assert.equal(englishGematria(word), '336');
  for (const word of ['voice', 'float']) assert.equal(englishGematria(word), '324');
});

test('the smallest non-zero gap this cipher can produce is 6, not 12', () => {
  // Every letter is index x 6, so the tightest possible difference is one step.
  const letterValues = Array.from({ length: 26 }, (_, index) =>
    Number(englishGematria(String.fromCharCode(65 + index))));
  const gaps = new Set();
  for (const a of letterValues) {
    for (const b of letterValues) {
      if (a !== b) gaps.add(Math.abs(a - b));
    }
  }
  assert.equal(Math.min(...gaps), 6);
  assertCopyContains('the smallest non-zero gap it can produce is 6');
});
