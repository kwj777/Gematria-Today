import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { baseRows, installFakeNeon } from './helpers/fake-neon.mjs';
import searchByGematriaRoute from '../netlify/functions/searchByGematria.mjs';
import wordPageRoute from '../netlify/functions/word-page.mjs';
import { MAX_GEMATRIA_VALUE, parseGematriaValue } from '../netlify/functions/_words.mjs';

// A /^\d+$/ check was the only validation in front of `gematria_value =
// ${Number(value)}`. Values past the integer range reached Postgres and came
// back as a 500 that echoed the database error, and each junk value wrote its
// own response-cache row ('042' and '42' separately, too).

const PRIOR_FETCH = globalThis.fetch;
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;

test.afterEach(() => {
  globalThis.fetch = PRIOR_FETCH;
});

test.after(() => {
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

const anonymous = (path) => new Request(`https://gematria.today${path}`, { headers: { 'x-forwarded-for': '203.0.113.11' } });
const wordsQueries = (queries) => queries.filter(({ query }) => /FROM words/.test(query));

test('parseGematriaValue accepts integer-range values and canonicalizes them', () => {
  assert.equal(parseGematriaValue('336'), 336);
  assert.equal(parseGematriaValue(' 042 '), 42);
  assert.equal(parseGematriaValue('0'), 0);
  assert.equal(parseGematriaValue('000'), 0);
  assert.equal(parseGematriaValue(String(MAX_GEMATRIA_VALUE)), MAX_GEMATRIA_VALUE);
  assert.equal(parseGematriaValue(`000${MAX_GEMATRIA_VALUE}`), MAX_GEMATRIA_VALUE);
});

test('parseGematriaValue refuses what is not a value any row can have', () => {
  for (const raw of [String(MAX_GEMATRIA_VALUE + 1), '99999999999', '1234567890123456789012345', '9007199254740993', '-6', '6.0', '1e3', 'abc', '', null, undefined]) {
    assert.equal(parseGematriaValue(raw), null, `${JSON.stringify(raw)} must be refused`);
  }
});

test('an out-of-range value is a 400 and never reaches the database', async () => {
  for (const raw of ['99999999999', '1234567890123456789012345']) {
    const { queries } = installFakeNeon((query) => baseRows(query) ?? (/FROM words/.test(query)
      ? new Error(`value "${raw}" is out of range for type integer`)
      : []));
    const response = await searchByGematriaRoute(anonymous(`/api/searchByGematria?gematria=${raw}`));
    assert.equal(response.status, 400, raw);
    const body = await response.json();
    assert.ok(!/out of range|integer:/.test(body.error), 'no database error text');
    assert.deepEqual(wordsQueries(queries), [], 'no words query for a value no row can have');
    assert.ok(!queries.some(({ query }) => /INSERT INTO function_response_cache/.test(query)), 'and no cache row for it');
  }
});

test('leading zeros are one value and one cache entry', async () => {
  const { queries } = installFakeNeon((query) => baseRows(query) ?? []);
  const response = await searchByGematriaRoute(anonymous('/api/searchByGematria?gematria=042'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).gematria, '42');
  const [select] = wordsQueries(queries);
  assert.deepEqual(select.params.map(String), ['42']);
});

test('an unexpected failure is a 500 with a generic message, not the database error', async (t) => {
  t.mock.method(console, 'error', () => {});
  installFakeNeon((query) => baseRows(query) ?? (/FROM words/.test(query)
    ? new Error('relation "words" does not exist')
    : []));
  const response = await searchByGematriaRoute(anonymous('/api/searchByGematria?gematria=336'));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.ok(!body.error.includes('relation'), 'the database message must not be returned');
  assert.match(body.error, /Gematria search failed/);
});

test('a /v/ page past the integer range is a 404, not a 500', async () => {
  const { queries } = installFakeNeon((query) => baseRows(query) ?? (/FROM words/.test(query)
    ? new Error('value "99999999999" is out of range for type integer')
    : []));
  const response = await wordPageRoute(anonymous('/v/99999999999'));
  assert.equal(response.status, 404);
  assert.deepEqual(wordsQueries(queries), []);
});

test('premium research bounds the value the same way', () => {
  const source = readFileSync(new URL('../netlify/functions/member-premium-research.mjs', import.meta.url), 'utf8');
  assert.match(source, /const gematriaValue = parseGematriaValue\(value\);/);
  assert.ok(!/Number\(value\)/.test(source), 'no unbounded Number() conversion left');
});
