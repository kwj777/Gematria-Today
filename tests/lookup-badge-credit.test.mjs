import test from 'node:test';
import assert from 'node:assert/strict';

import { baseRows, installFakeNeon, MEMBER_COOKIE } from './helpers/fake-neon.mjs';
import englishGematriaRoute from '../netlify/functions/englishGematria.mjs';
import searchByGematriaRoute from '../netlify/functions/searchByGematria.mjs';
import { BADGE_DEFINITIONS, recordWordSearchActivity } from '../netlify/functions/_badges.mjs';

// Badge credit for calculator lookups:
//   - "new word contributed" was credited whenever the payload said
//     source: 'calculated', which the unstorable branch also returned, so
//     '1a', '2a', '3a'... farmed Pioneer and Base Root badges without a row
//     ever being created;
//   - nothing was credited at all when the shared response cache answered,
//     so a member searching a popular word got no credit for it;
//   - every credited lookup re-inserted every badge already earned, one
//     round trip each.

const PRIOR_FETCH = globalThis.fetch;
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;

test.afterEach(() => {
  globalThis.fetch = PRIOR_FETCH;
});

test.after(() => {
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

const NO_STATS = { searches_total: 1, gematria_searches_total: 1, words_contributed: 0, base_root_finds: 0 };

function respondWith({ wordsInsert = [], cachedPayload = null } = {}) {
  return (query) => {
    const base = baseRows(query);
    if (base) return base;
    if (cachedPayload && /FROM function_response_cache/.test(query) && /SELECT status_code, payload/.test(query)) {
      return [{ status_code: 200, payload: cachedPayload, expires_at: '2099-01-01T00:00:00.000Z' }];
    }
    if (/INSERT INTO words/.test(query)) return wordsInsert;
    if (/INSERT INTO member_search_stats/.test(query)) return [NO_STATS];
    return [];
  };
}

function memberRequest(path) {
  return new Request(`https://gematria.today${path}`, {
    headers: { cookie: MEMBER_COOKIE, 'x-forwarded-for': '203.0.113.10' },
  });
}

// [searches, gematriaSearches, wordsContributed, baseRootFinds] from the stats
// upsert, or null when nothing was credited.
function creditedDeltas(queries) {
  const upsert = queries.find(({ query }) => /INSERT INTO member_search_stats/.test(query));
  return upsert ? upsert.params.slice(1, 5).map(Number) : null;
}

test('an input too loose to store is not a contributed word', async () => {
  // '1a' fails the storage gate, so no row is created -- and it is worth 6, a
  // base-root value, which used to credit that badge too.
  const { queries } = installFakeNeon(respondWith());
  const response = await englishGematriaRoute(memberRequest('/api/englishGematria?word=1a'));
  assert.equal(response.status, 200);
  assert.ok(!queries.some(({ query }) => /INSERT INTO words/.test(query)));
  assert.deepEqual(creditedDeltas(queries), [1, 0, 0, 0], 'a lookup, but no contribution');
});

test('a word this request inserted is a contribution, and a base-root one counts as a find', async () => {
  // "a" = 6, which is a base-root value.
  const { queries } = installFakeNeon(respondWith({
    wordsInsert: [{ word: 'a', gematria_value: 6, digital_root: 6, is_base_root: true, search_count: 1, source: 'calculated' }],
  }));
  const response = await englishGematriaRoute(memberRequest('/api/englishGematria?word=a'));
  assert.equal(response.status, 200);
  assert.deepEqual(creditedDeltas(queries), [1, 0, 1, 1]);
});

test('a word that already had a row is a lookup, not a contribution', async () => {
  const { queries } = installFakeNeon(respondWith({
    wordsInsert: [{ word: 'light', gematria_value: 336, digital_root: 3, is_base_root: false, search_count: 7, source: 'database' }],
  }));
  await englishGematriaRoute(memberRequest('/api/englishGematria?word=light'));
  assert.deepEqual(creditedDeltas(queries), [1, 0, 0, 0]);
});

test('a lookup answered from the shared cache still credits the member, but not as a new word', async () => {
  // The cached payload was computed for whoever inserted the word first.
  const cachedPayload = { word: 'light', gematria: { total: '336', digitalRoot: 3 }, isBaseRoot: false, searchCount: 1, source: 'calculated' };
  const { queries } = installFakeNeon(respondWith({ cachedPayload }));
  const response = await englishGematriaRoute(memberRequest('/api/englishGematria?word=light'));
  assert.equal(response.headers.get('x-cache-status'), 'hit');
  assert.deepEqual(creditedDeltas(queries), [1, 0, 0, 0]);
});

test('a page-load lookup (intent=view) credits nothing', async () => {
  const { queries } = installFakeNeon(respondWith());
  await englishGematriaRoute(memberRequest('/api/englishGematria?word=light&intent=view'));
  assert.equal(creditedDeltas(queries), null);
});

test('a gematria-value search answered from the cache still credits the member', async () => {
  const cachedPayload = { gematria: '336', count: 0, words: [] };
  const { queries } = installFakeNeon(respondWith({ cachedPayload }));
  const response = await searchByGematriaRoute(memberRequest('/api/searchByGematria?gematria=336'));
  assert.equal(response.headers.get('x-cache-status'), 'hit');
  assert.deepEqual(creditedDeltas(queries), [0, 1, 0, 0]);
});

test('every eligible badge is offered in one statement, and only new ones come back', async () => {
  const calls = [];
  const sql = (strings, ...values) => {
    const query = strings.join('?');
    calls.push({ query, values });
    if (/INSERT INTO member_search_stats/.test(query)) {
      // A long-time member: past every threshold.
      return Promise.resolve([{ searches_total: 9999, gematria_searches_total: 999, words_contributed: 999, base_root_finds: 99 }]);
    }
    if (/INSERT INTO member_badges/.test(query)) {
      return Promise.resolve([{ badge_slug: 'seeker-4', earned_at: '2026-10-01T00:00:00.000Z' }]);
    }
    return Promise.resolve([]);
  };

  const result = await recordWordSearchActivity(sql, 'member-1', { wasNewWord: false });
  const inserts = calls.filter(({ query }) => /INSERT INTO member_badges/.test(query));
  assert.equal(inserts.length, 1, 'one round trip, not one per badge');
  assert.match(inserts[0].query, /ON CONFLICT \(user_id, badge_slug\) DO NOTHING/);
  const slugs = inserts[0].values.find((value) => Array.isArray(value) && value.includes('seeker-1'));
  assert.deepEqual(slugs, BADGE_DEFINITIONS.map((badge) => badge.slug), 'every threshold passed is offered');
  assert.deepEqual(result.newBadges.map((badge) => badge.slug), ['seeker-4']);
  assert.equal(result.newBadges[0].name, 'Seeker IV');
  assert.equal(result.newBadges[0].earnedAt, '2026-10-01T00:00:00.000Z');
});

test('no badge statement runs when no threshold is met', async () => {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    if (/INSERT INTO member_search_stats/.test(strings.join('?'))) return Promise.resolve([{ searches_total: 1 }]);
    return Promise.resolve([]);
  };
  const result = await recordWordSearchActivity(sql, 'member-2', {});
  assert.deepEqual(result.newBadges, []);
  assert.ok(!calls.some(({ query }) => /INSERT INTO member_badges/.test(query)));
});
