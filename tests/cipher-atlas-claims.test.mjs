import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CIPHERS, calculateCipher, digitalRoot } from '../page-scripts/multi-cipher-engine.mjs';

// The English Gematria Cipher Atlas posts make arithmetic claims about how the
// ciphers relate. They used to say Full Reduction and Reverse Full Reduction
// can be computed from the Simple Ordinal total and letter count -- false: AS,
// BR and CQ all total 20 in Simple Ordinal and differ in both reductions -- and
// that the Simple and Kaye Baconian ciphers produce no totals. Each claim the
// corrected posts make is asserted twice: that the seeded text still makes it,
// and that the engine (or the published table) agrees.
const ATLAS_SEED = readFileSync(new URL('../sql/seed_english_gematria_cipher_atlas_series.sql', import.meta.url), 'utf8')
  .replaceAll("''", "'");

function assertAtlasSays(snippet) {
  assert.ok(
    ATLAS_SEED.includes(snippet),
    `the Cipher Atlas seed no longer contains the pinned claim:\n  ${snippet}\nIf you changed the wording, update this test and recheck the arithmetic.`,
  );
}

const total = (word, cipherId) => calculateCipher(word, cipherId).total;
const letters = (word) => [...word.toUpperCase()].filter((char) => char >= 'A' && char <= 'Z');
const countIn = (word, first, last) => letters(word).filter((char) => char >= first && char <= last).length;

function randomWords(count, seed = 7) {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state;
  };
  return Array.from({ length: count }, () => {
    const length = 1 + (next() % 12);
    return Array.from({ length }, () => String.fromCharCode(65 + (next() % 26))).join('');
  });
}

test('the old identities are gone from the seeded posts', () => {
  for (const claim of [
    'Because the reduction of a Simple Ordinal total equals the Full Reduction total of the same word',
    'Computable from Simple Ordinal plus letter count.',
    'Full Reduction</strong> = per-letter digital root of Simple Ordinal. Computable from Simple Ordinal alone.',
    'so it is determined by the same two ingredients, Simple Ordinal totals and letter count',
    'The profile carries no more information than (74, 7-letter count)',
    'three of them — 8, 4, 1 — appearing three times each',
    'There is no such thing; the cipher produces a sequence of a/b characters',
    '"Baconian total of 444." Not a thing',
    'The two ciphers are mathematically independent.',
  ]) {
    assert.ok(!ATLAS_SEED.includes(claim), `the atlas still claims: ${claim}`);
  }
});

test('Full Reduction depends on the letter mix, not just the Simple Ordinal total', () => {
  assertAtlasSays('AS, BR and CQ all total 20 in Simple Ordinal but 2, 11 and 11 in Full Reduction');
  assertAtlasSays('the same three words give 16, 16 and 7');
  assert.deepEqual(['AS', 'BR', 'CQ'].map((word) => total(word, 'english-ordinal')), [20, 20, 20]);
  assert.deepEqual(['AS', 'BR', 'CQ'].map((word) => total(word, 'full-reduction')), [2, 11, 11]);
  assert.deepEqual(['AS', 'BR', 'CQ'].map((word) => total(word, 'reverse-full-reduction')), [16, 16, 7]);
});

test('the Full Reduction formula the atlas gives holds for every word', () => {
  assertAtlasSays('Full Reduction = Simple Ordinal − 9 × (letters from J to R) − 18 × (letters from S to Z)');
  assertAtlasSays('J to R lose 9, S to Z lose 18');
  for (const word of [...randomWords(2000), 'ENGLISH', 'JESUS', 'DOMINION']) {
    const expected = total(word, 'english-ordinal') - 9 * countIn(word, 'J', 'R') - 18 * countIn(word, 'S', 'Z');
    assert.equal(total(word, 'full-reduction'), expected, word);
  }
});

test('only the digital roots carry over from Simple Ordinal to the reductions', () => {
  assertAtlasSays('a word\'s Full Reduction total always has the same digital root as its Simple Ordinal total');
  assertAtlasSays('Like Full Reduction, only its digital root is fixed by Simple Ordinal.');
  for (const word of randomWords(2000, 11)) {
    const ordinal = total(word, 'english-ordinal');
    assert.equal(digitalRoot(total(word, 'full-reduction')), digitalRoot(ordinal), word);
    // Reverse Full Reduction reduces like Reverse Ordinal, which is 27n - SO.
    assert.equal(total(word, 'reverse-full-reduction') % 9, (9 - (ordinal % 9)) % 9, word);
  }
});

test('Reverse Full Reduction mirrors Full Reduction as the atlas says', () => {
  assertAtlasSays('(9 × letter count) − Full Reduction + (9 × the number of I\'s and R\'s)');
  assertAtlasSays('a letter\'s two reduced values add to 9, except for I and R, which are 9 in both');
  for (const word of [...randomWords(2000, 13), 'ENGLISH', 'JESUS']) {
    const n = letters(word).length;
    const iAndR = letters(word).filter((char) => char === 'I' || char === 'R').length;
    assert.equal(total(word, 'reverse-full-reduction'), 9 * n - total(word, 'full-reduction') + 9 * iAndR, word);
  }
});

test('each digit from 1 to 8 stands for three letters in Reverse Full Reduction, and 9 for I and R', () => {
  assertAtlasSays('each digit from 1 to 8 stands for three letters, and 9 for just two, I and R');
  const reverseFullReduction = CIPHERS.find((cipher) => cipher.id === 'reverse-full-reduction');
  const lettersByValue = new Map();
  for (let index = 1; index <= 26; index += 1) {
    const value = reverseFullReduction.valueFor(index);
    lettersByValue.set(value, [...(lettersByValue.get(value) || []), String.fromCharCode(64 + index)]);
  }
  for (let digit = 1; digit <= 8; digit += 1) {
    assert.equal(lettersByValue.get(digit).length, 3, `digit ${digit}`);
  }
  assert.deepEqual(lettersByValue.get(9), ['I', 'R']);
});

test('the ENGLISH profile and the relationships quoted for it are right', () => {
  assertAtlasSays('ENGLISH = (74, 115, 38, 34)');
  assertAtlasSays('38 reduces to 2, as 74 does, and 34 is the mirror of 38 for a seven-letter word with one I');
  assertAtlasSays('ENGLISH is 74 in Simple Ordinal and 38 in Full Reduction, and both reduce to 2');
  assert.deepEqual(
    ['english-ordinal', 'reverse-ordinal', 'full-reduction', 'reverse-full-reduction'].map((id) => total('ENGLISH', id)),
    [74, 115, 38, 34],
  );
  assert.equal(digitalRoot(38), 2);
  assert.equal(digitalRoot(74), 2);
  assert.equal(9 * 7 - 38 + 9 * 1, 34);
});

test('Simple Ordinal and Jewish / Latin always share a digital root, as the corrected post 8 says', () => {
  assertAtlasSays('Neither total can be derived from the other, though the two always share a digital root.');
  for (const word of randomWords(2000, 17)) {
    assert.equal(digitalRoot(total(word, 'jewish-latin')), digitalRoot(total(word, 'english-ordinal')), word);
  }
});

test('the Simple and Kaye Baconian count ciphers are described with their real tables', () => {
  // 24-letter alphabet, I = J and U = V.
  const ALPHABET_24 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'];
  const merge = (char) => ({ J: 'I', V: 'U' }[char] || char);
  const simple = (char) => ALPHABET_24.indexOf(merge(char)) + 1;
  const kaye = (char) => (simple(char) >= 10 ? simple(char) : simple(char) + 26);
  const sum = (word, cipher) => letters(word).reduce((acc, char) => acc + cipher(char), 0);

  assertAtlasSays('A = 1, B = 2 … I/J = 9, K = 10 … U/V = 20, W = 21, X = 22, Y = 23, Z = 24.');
  assertAtlasSays('K = 10, L = 11 … U/V = 20 … Z = 24, then A = 27, B = 28 … I/J = 35.');
  assert.equal(simple('I'), 9);
  assert.equal(simple('J'), 9);
  assert.equal(simple('K'), 10);
  assert.equal(simple('V'), 20);
  assert.equal(simple('Z'), 24);
  assert.equal(kaye('K'), 10);
  assert.equal(kaye('Z'), 24);
  assert.equal(kaye('A'), 27);
  assert.equal(kaye('I'), 35);

  assertAtlasSays('BACON = 2 + 1 + 3 + 14 + 13 = <strong>33</strong>');
  assertAtlasSays('BACON = 28 + 27 + 29 + 14 + 13 = <strong>111</strong>');
  assertAtlasSays('BACON is 33 in Simple and 111 in Kaye');
  assert.equal(sum('BACON', simple), 33);
  assert.equal(sum('BACON', kaye), 111);
});

test('the Baconian post hero shows the 24- and 26-letter biliteral tables, not Simple and Kaye', () => {
  // The hero is the post's cover and share image, so it sits directly above
  // the corrected text. It used to label the two biliteral a/b tables "Simple"
  // and "Kaye", which are count ciphers, and gave the 26-letter Z a wrong code.
  const svg = readFileSync(new URL('../assets/english-gematria-cipher-atlas-baconian-hero-16x9.svg', import.meta.url), 'utf8');
  assert.doesNotMatch(svg, /kaye|simple/i);
  assert.match(svg, />24-LETTER</);
  assert.match(svg, />26-LETTER</);

  const biliteral = (index) => index.toString(2).padStart(5, '0').replaceAll('0', 'a').replaceAll('1', 'b');
  const code24 = (char) => biliteral('ABCDEFGHIKLMNOPQRSTUWXYZ'.indexOf({ J: 'I', V: 'U' }[char] || char));
  const code26 = (char) => biliteral('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(char));
  const column = (x) => [...svg.matchAll(new RegExp(`<text x="${x}" y="\\d+">([A-Z]) = ([ab]{5})</text>`, 'g'))]
    .map(([, char, code]) => [char, code]);

  const left = column(105);
  const right = column(315);
  assert.deepEqual(left.map(([char]) => char), ['A', 'I', 'J', 'U', 'V', 'Z']);
  assert.deepEqual(right.map(([char]) => char), ['A', 'I', 'J', 'U', 'V', 'Z']);
  for (const [char, code] of left) assert.equal(code, code24(char), `24-letter table, ${char}`);
  for (const [char, code] of right) assert.equal(code, code26(char), `26-letter table, ${char}`);
});
