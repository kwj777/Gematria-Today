import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CIPHERS,
  digitalRoot,
  calculateCipher,
  calculateAllCiphers,
  buildSearchPayload,
} from '../page-scripts/multi-cipher-engine.mjs';

test('exposes the seven canonical ciphers', () => {
  assert.equal(CIPHERS.length, 7);
  assert.deepEqual(
    CIPHERS.map((c) => c.id),
    [
      'english-ordinal',
      'reverse-ordinal',
      'full-reduction',
      'reverse-full-reduction',
      'sumerian',
      'reverse-sumerian',
      'jewish-latin',
    ],
  );
});

test('English Ordinal: A=1, Z=26, ignores non-letters', () => {
  assert.equal(calculateCipher('a', 'english-ordinal').total, 1);
  assert.equal(calculateCipher('Z', 'english-ordinal').total, 26);
  assert.equal(calculateCipher('abc', 'english-ordinal').total, 6);
  assert.equal(calculateCipher('a-b-c!', 'english-ordinal').total, 6);
});

test('Reverse Ordinal: A=26, Z=1', () => {
  assert.equal(calculateCipher('A', 'reverse-ordinal').total, 26);
  assert.equal(calculateCipher('Z', 'reverse-ordinal').total, 1);
  // A+Z = 27
  assert.equal(calculateCipher('az', 'reverse-ordinal').total, 27);
});

test('Full Reduction: digital-root of ordinal, cycles 1..9', () => {
  assert.equal(calculateCipher('A', 'full-reduction').total, 1);
  assert.equal(calculateCipher('I', 'full-reduction').total, 9);
  assert.equal(calculateCipher('J', 'full-reduction').total, 1);
  assert.equal(calculateCipher('R', 'full-reduction').total, 9);
  assert.equal(calculateCipher('S', 'full-reduction').total, 1);
  assert.equal(calculateCipher('Z', 'full-reduction').total, 8);
});

test('Reverse Full Reduction: digital-root of reverse ordinal', () => {
  // Z is reverse-ordinal 1 -> reduction 1
  assert.equal(calculateCipher('Z', 'reverse-full-reduction').total, 1);
  // A is reverse-ordinal 26 -> 2+6 = 8
  assert.equal(calculateCipher('A', 'reverse-full-reduction').total, 8);
  // H is ordinal 8 -> reverse 19 -> 1+9=10 -> 1
  assert.equal(calculateCipher('H', 'reverse-full-reduction').total, 1);
});

test('Sumerian: ordinal × 6, matches the site default cipher', () => {
  assert.equal(calculateCipher('a', 'sumerian').total, 6);
  assert.equal(calculateCipher('z', 'sumerian').total, 156);
  // abc = (1+2+3)*6 = 36
  assert.equal(calculateCipher('abc', 'sumerian').total, 36);
});

test('Reverse Sumerian: reverse ordinal × 6', () => {
  assert.equal(calculateCipher('A', 'reverse-sumerian').total, 156);
  assert.equal(calculateCipher('Z', 'reverse-sumerian').total, 6);
});

test('Jewish/Latin: A=1, J=10, S=100, Z=800', () => {
  assert.equal(calculateCipher('A', 'jewish-latin').total, 1);
  assert.equal(calculateCipher('I', 'jewish-latin').total, 9);
  assert.equal(calculateCipher('J', 'jewish-latin').total, 10);
  assert.equal(calculateCipher('R', 'jewish-latin').total, 90);
  assert.equal(calculateCipher('S', 'jewish-latin').total, 100);
  assert.equal(calculateCipher('Z', 'jewish-latin').total, 800);
  // Sum of an example word: GOD = 7 + 60 + 4 = 71
  assert.equal(calculateCipher('god', 'jewish-latin').total, 71);
});

test('calculateAllCiphers returns one entry per cipher with totals + digital roots', () => {
  const results = calculateAllCiphers('abc');
  assert.equal(results.length, 7);
  const ordinal = results.find((r) => r.cipherId === 'english-ordinal');
  assert.equal(ordinal.total, 6);
  assert.equal(ordinal.digitalRoot, 6);
  assert.equal(ordinal.letterCount, 3);
  assert.deepEqual(
    ordinal.perLetter,
    [
      { letter: 'A', value: 1 },
      { letter: 'B', value: 2 },
      { letter: 'C', value: 3 },
    ],
  );
});

test('calculateAllCiphers returns zeros for empty / non-letter input', () => {
  const results = calculateAllCiphers('!!! 123');
  assert.equal(results.length, 7);
  for (const r of results) {
    assert.equal(r.total, 0);
    assert.equal(r.letterCount, 0);
    assert.equal(r.digitalRoot, 0);
  }
});

test('digitalRoot reduces multi-digit numbers correctly', () => {
  assert.equal(digitalRoot(0), 0);
  assert.equal(digitalRoot(9), 9);
  assert.equal(digitalRoot(38), 2); // 3+8=11 -> 1+1=2
  assert.equal(digitalRoot(800), 8);
});

test('case insensitive', () => {
  for (const cipher of CIPHERS) {
    assert.equal(
      calculateCipher('AbCdEf', cipher.id).total,
      calculateCipher('abcdef', cipher.id).total,
    );
  }
});

test('throws on non-string input', () => {
  assert.throws(() => calculateCipher(null, 'english-ordinal'), TypeError);
  assert.throws(() => calculateAllCiphers(123), TypeError);
});

test('throws on unknown cipher id', () => {
  assert.throws(() => calculateCipher('abc', 'nonexistent'), /Unknown cipher/);
});

test('buildSearchPayload puts Sumerian in typed columns and all 7 in result_payload', () => {
  const allResults = calculateAllCiphers('truth');
  const payload = buildSearchPayload({ query: 'truth', mode: 'all', cipherId: null, allResults });

  // Typed columns mirror the Sumerian result (site default cipher).
  const sumerian = allResults.find((r) => r.cipherId === 'sumerian');
  assert.equal(payload.queryText, 'truth');
  assert.equal(payload.queryType, 'word');
  assert.equal(payload.calculatorSource, 'multi-cipher-calculator');
  assert.equal(payload.gematriaTotal, sumerian.total);
  assert.equal(payload.digitalRoot, sumerian.digitalRoot);

  // result_payload carries all 7 cipher values + mode.
  assert.equal(payload.resultPayload.mode, 'all');
  assert.equal(payload.resultPayload.selectedCipherId, null);
  assert.equal(payload.resultPayload.ciphers.length, 7);
  const ids = payload.resultPayload.ciphers.map((c) => c.cipherId);
  assert.ok(ids.includes('english-ordinal'));
  assert.ok(ids.includes('jewish-latin'));
});

test('buildSearchPayload single-mode preserves the chosen cipher id', () => {
  const allResults = calculateAllCiphers('truth');
  const payload = buildSearchPayload({
    query: 'truth', mode: 'single', cipherId: 'english-ordinal', allResults,
  });
  assert.equal(payload.resultPayload.mode, 'single');
  assert.equal(payload.resultPayload.selectedCipherId, 'english-ordinal');
});

test('buildSearchPayload computes isBaseRoot using the Sumerian (total - 6) % 54 rule', () => {
  // Pick a word whose Sumerian total is known to be a base-root multiple.
  // (6 - 6) % 54 === 0, so a single "A" qualifies (Sumerian total 6).
  const aResults = calculateAllCiphers('a');
  const aPayload = buildSearchPayload({ query: 'a', mode: 'all', cipherId: null, allResults: aResults });
  assert.equal(aPayload.gematriaTotal, 6);
  assert.equal(aPayload.isBaseRoot, true);

  // "ab" Sumerian = 18; (18 - 6) % 54 = 12 → not a base root.
  const abResults = calculateAllCiphers('ab');
  const abPayload = buildSearchPayload({ query: 'ab', mode: 'all', cipherId: null, allResults: abResults });
  assert.equal(abPayload.gematriaTotal, 18);
  assert.equal(abPayload.isBaseRoot, false);
});

test('buildSearchPayload returns isBaseRoot=false for empty input', () => {
  const results = calculateAllCiphers('!!! 123');
  const payload = buildSearchPayload({ query: '!!! 123', mode: 'all', cipherId: null, allResults: results });
  assert.equal(payload.gematriaTotal, 0);
  assert.equal(payload.isBaseRoot, false);
});
