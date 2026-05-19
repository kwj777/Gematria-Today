import test from 'node:test';
import assert from 'node:assert/strict';

import {
  englishGematria,
  digitalRoot,
  englishGematriaWithDigitalRoot,
} from '../netlify/functions/englishGematria.mjs';

test('englishGematria returns "0" for empty input', () => {
  assert.equal(englishGematria(''), '0');
});

test('englishGematria computes A = 6 (base-6 scaling of ordinal 1)', () => {
  assert.equal(englishGematria('a'), '6');
  assert.equal(englishGematria('A'), '6');
});

test('englishGematria computes Z = 156 (26 * 6)', () => {
  assert.equal(englishGematria('z'), '156');
  assert.equal(englishGematria('Z'), '156');
});

test('englishGematria sums multiple letters', () => {
  // a + b + c = 6 + 12 + 18 = 36
  assert.equal(englishGematria('abc'), '36');
});

test('englishGematria is case-insensitive', () => {
  assert.equal(englishGematria('AbCdEf'), englishGematria('abcdef'));
});

test('englishGematria ignores non-letter characters', () => {
  assert.equal(englishGematria('a b c'), '36');
  assert.equal(englishGematria('a-b-c'), '36');
  assert.equal(englishGematria('abc123!?'), '36');
});

test('englishGematria handles unicode letters by ignoring non-ASCII', () => {
  // Only ASCII A-Z scored; accented chars should be ignored.
  assert.equal(englishGematria('café'), englishGematria('caf'));
});

test('englishGematria throws TypeError for non-string input', () => {
  assert.throws(() => englishGematria(null), TypeError);
  assert.throws(() => englishGematria(undefined), TypeError);
  assert.throws(() => englishGematria(123), TypeError);
  assert.throws(() => englishGematria({}), TypeError);
});

test('digitalRoot reduces single-digit values to themselves', () => {
  assert.equal(digitalRoot(0), 0);
  assert.equal(digitalRoot(7), 7);
  assert.equal(digitalRoot(9), 9);
});

test('digitalRoot reduces multi-digit values iteratively', () => {
  // 156 -> 1+5+6 = 12 -> 1+2 = 3
  assert.equal(digitalRoot(156), 3);
  // 999 -> 27 -> 9
  assert.equal(digitalRoot(999), 9);
  // 1234 -> 10 -> 1
  assert.equal(digitalRoot(1234), 1);
});

test('digitalRoot handles negative and fractional inputs via abs/trunc', () => {
  assert.equal(digitalRoot(-156), 3);
  assert.equal(digitalRoot(156.9), 3);
});

test('englishGematriaWithDigitalRoot returns total as string and root as number', () => {
  const result = englishGematriaWithDigitalRoot('abc');
  assert.deepEqual(result, { total: '36', digitalRoot: 9 });
});

test('englishGematriaWithDigitalRoot computes a known base-root word', () => {
  // "gematria" => g(42)+e(30)+m(78)+a(6)+t(120)+r(108)+i(54)+a(6) = 444
  // digitalRoot(444) = 4+4+4 = 12 -> 3
  const result = englishGematriaWithDigitalRoot('gematria');
  assert.equal(result.total, '444');
  assert.equal(result.digitalRoot, 3);
});
