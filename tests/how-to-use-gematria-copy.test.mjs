import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digitalRoot, englishGematria } from '../netlify/functions/englishGematria.mjs';

// Same contract as site-copy-gematria-claims.test.mjs: this page hand-writes
// gematria values into prose, and prose does not recompute itself. Every claim
// is asserted twice -- that the copy still makes it, and that the engine
// agrees. A guide that teaches the method with wrong arithmetic is worse than
// no guide.
const PAGE = readFileSync(new URL('../src/how-to-use-gematria.html', import.meta.url), 'utf8');

function assertCopyContains(snippet) {
  assert.ok(
    PAGE.includes(snippet),
    `src/how-to-use-gematria.html no longer contains the pinned copy:\n  ${snippet}\nIf you changed the wording, update this test and recheck the arithmetic.`,
  );
}

test('the letter table is the cipher the site actually uses', () => {
  for (let index = 1; index <= 26; index += 1) {
    const letter = String.fromCharCode(64 + index);
    const value = index * 6;
    assert.equal(englishGematria(letter), String(value), `${letter} is not ${value}`);
    assertCopyContains(`<dt class="letter-value-grid__letter">${letter}</dt><dd class="letter-value-grid__value mb-0">${value}</dd>`);
  }
});

test('the worked example adds up', () => {
  const breakdown = [['L', 72], ['I', 54], ['G', 42], ['H', 48], ['T', 120]];
  const sum = breakdown.reduce((total, [, value]) => total + value, 0);

  assert.equal(sum, 336);
  assert.equal(englishGematria('light'), '336');
  assert.equal(digitalRoot(336), 3);

  for (const [letter, value] of breakdown) {
    assert.equal(englishGematria(letter), String(value));
    assertCopyContains(`<tr><th scope="row">${letter}</th>`);
  }
  assertCopyContains('<code>L 72 + I 54 + G 42 + H 48 + T 120 = 336</code>');
  assertCopyContains('336 &rarr; 3+3+6 = 12 &rarr; 1+2 = 3');
});

test('the anagram examples really are anagrams, and really do collide', () => {
  for (const [a, b] of [['earth', 'heart'], ['alter', 'later']]) {
    const letters = (word) => [...word].sort().join('');
    assert.equal(letters(a), letters(b), `${a} and ${b} are not anagrams`);
    assert.equal(englishGematria(a), englishGematria(b));
  }
  assert.equal(englishGematria('earth'), '312');
  assert.equal(englishGematria('alter'), '336');
  assertCopyContains('<code>EARTH</code> and <code>HEART</code> both total 312');
  assertCopyContains('<code>ALTER</code> and <code>LATER</code>, at 336');
});

test('the non-example is a genuine coincidence, not a mistake', () => {
  // The page offers faith/hope as a match that looks meaningful and isn't.
  // If these ever stop matching the whole section stops making sense.
  assert.equal(englishGematria('faith'), '264');
  assert.equal(englishGematria('hope'), '264');
  assertCopyContains('<code>FAITH</code> and <code>HOPE</code> both come to 264');
});

test('the claim about the size of the value space is arithmetic, not vibes', () => {
  // Every letter is its alphabet position times six, so every total is a
  // multiple of six -- which is what makes the space a sixth of its apparent
  // size, and the reason matches are the norm rather than the exception.
  for (let index = 1; index <= 26; index += 1) {
    assert.equal(Number(englishGematria(String.fromCharCode(64 + index))) % 6, 0);
  }

  // A five-letter word runs from AAAAA to ZZZZZ in steps of six.
  const min = Number(englishGematria('AAAAA'));
  const max = Number(englishGematria('ZZZZZ'));
  assert.equal(min, 30);
  assert.equal(max, 780);
  assert.equal((max - min) / 6 + 1, 126);

  assertCopyContains('between 30 (AAAAA) and 780 (ZZZZZ), in steps of six');
  assertCopyContains('<strong>126 possible totals, and no others</strong>');
  assertCopyContains('337 is not a gematria value');
  assert.notEqual(Number(englishGematria('light')) % 6, 1, 'sanity: totals are never 337-shaped');
});

test('the base root examples sit on the 54-step ladder', () => {
  const isBaseRoot = (total) => (total - 6) % 54 === 0;

  assert.equal(englishGematria('air'), '168');
  assert.ok(isBaseRoot(168), 'AIR should be a base root');
  assert.ok(!isBaseRoot(336), 'LIGHT should not be');
  for (const value of [6, 60, 114, 168, 222]) assert.ok(isBaseRoot(value));

  assertCopyContains('6, 60, 114, 168, 222 and so on');
  assertCopyContains('<code>AIR</code> = 168 is one. LIGHT is not.');
});

test('the cross-cipher claim matches the multi-cipher engine', async () => {
  const { CIPHERS } = await import('../page-scripts/multi-cipher-engine.mjs');
  const ordinal = CIPHERS.find((cipher) => cipher.id === 'english-ordinal');
  assert.ok(ordinal, 'english-ordinal cipher must exist');

  const value = [...'LIGHT'].reduce((total, char) => total + ordinal.valueFor(char.charCodeAt(0) - 64), 0);
  assert.equal(value, 56);
  assertCopyContains('<code>light</code> is 336 here and 56 in English Ordinal');
});

test('the page is wired into the site the way a new page has to be', async () => {
  const { ACTIVE_LINK_BY_FILE, FOOTER_SECTION_BY_FILE } = await import('../scripts/lib/page-chrome.mjs');
  const { STATIC_PATHS } = await import('../netlify/functions/sitemap-xml.mjs');

  assert.equal(ACTIVE_LINK_BY_FILE['how-to-use-gematria.html'], '/how-to-use-gematria.html');
  assert.equal(FOOTER_SECTION_BY_FILE['how-to-use-gematria.html'], 'learn');

  // /sitemap.xml is served by the function, not by the tracked sitemap.xml
  // file, so a page missing from STATIC_PATHS is a page Google never hears
  // about however tidy the checked-in file looks.
  assert.ok(STATIC_PATHS.includes('/how-to-use-gematria.html'), 'must be in the served sitemap');
  const tracked = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
  assert.match(tracked, /<loc>https:\/\/gematria\.today\/how-to-use-gematria\.html<\/loc>/);

  const nav = readFileSync(new URL('../src/_includes/nav.html', import.meta.url), 'utf8');
  assert.match(nav, /href="\/how-to-use-gematria\.html">How to Use Gematria</);

  assert.match(PAGE, /\{% nav %\}/);
  assert.match(PAGE, /\{% footer %\}/);
  assert.match(PAGE, /<link rel="canonical" href="https:\/\/gematria\.today\/how-to-use-gematria\.html" \/>/);
});

test('the two pages that used to compete for this query no longer do', () => {
  // gematria-basics.html was titled "How to Use the Calculator and Read
  // Results" -- the same intent as this page, from a lesson gated behind a
  // learning path. Two pages chasing one query split the signal for it.
  const basics = readFileSync(new URL('../src/gematria-basics.html', import.meta.url), 'utf8');
  const title = basics.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
  assert.ok(!/how to use/i.test(title), `gematria-basics still competes for the query: ${title}`);
  assert.match(basics, /href="\/how-to-use-gematria\.html"/, 'it should point at the guide instead');
});

test('inbound internal links exist from the pages that already get impressions', () => {
  for (const [file, label] of [
    ['../src/index.html', 'home'],
    ['../src/calculator.html', 'calculator'],
    ['../src/gematria-guide.html', 'gematria-guide'],
    ['../src/gematria-basics.html', 'gematria-basics'],
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /href="\/how-to-use-gematria\.html"/, `${label} should link to the guide`);
  }
});
