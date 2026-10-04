import test from 'node:test';
import assert from 'node:assert/strict';

import { searchCacheControl } from '../netlify/functions/searchByGematria.mjs';

test('searchCacheControl keeps a member\'s newly earned badges out of shared caches', () => {
  const payload = { gematria: '666', count: 0, words: [], newlyEarnedBadges: [{ slug: 'number-searcher-1' }] };
  assert.equal(searchCacheControl(payload), 'private, no-store');
});

test('searchCacheControl caches the same answer for everyone publicly', () => {
  assert.equal(
    searchCacheControl({ gematria: '666', count: 0, words: [] }),
    'public, max-age=300, stale-while-revalidate=120',
  );
});
