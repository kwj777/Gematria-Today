import test from 'node:test';
import assert from 'node:assert/strict';
import { digitalRoot, englishGematriaWithDigitalRoot } from '../netlify/functions/englishGematria.mjs';

test('englishGematriaWithDigitalRoot computes deterministic values', () => {
  const result = englishGematriaWithDigitalRoot('abc');
  assert.equal(result.total, '36');
  assert.equal(result.digitalRoot, 9);
});

test('digitalRoot reduces multi-digit numbers', () => {
  assert.equal(digitalRoot(999), 9);
  assert.equal(digitalRoot(12345), 6);
});
