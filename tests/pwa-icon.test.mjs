import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSize } from '../netlify/functions/pwa-icon.mjs';

test('normalizeSize accepts the documented allow-listed sizes', () => {
  assert.equal(normalizeSize('180'), 180);
  assert.equal(normalizeSize('192'), 192);
  assert.equal(normalizeSize('512'), 512);
});

test('normalizeSize defaults to 180 for unknown sizes', () => {
  // The PWA icon endpoint must never render an arbitrary size — only the
  // three documented icons. Any other input falls back to the Apple touch icon size.
  assert.equal(normalizeSize('64'), 180);
  assert.equal(normalizeSize('1024'), 180);
  assert.equal(normalizeSize('256'), 180);
});

test('normalizeSize defaults to 180 for non-numeric, empty, or nullish input', () => {
  assert.equal(normalizeSize(''), 180);
  assert.equal(normalizeSize('abc'), 180);
  assert.equal(normalizeSize(null), 180);
  assert.equal(normalizeSize(undefined), 180);
});

test('normalizeSize handles numeric input directly (not just strings)', () => {
  // Number.parseInt(String(value || '180'), 10) — passing a number still works.
  assert.equal(normalizeSize(192), 192);
});
