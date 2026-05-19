import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_WORDNIK_RELATIONSHIP_TYPES,
  FREE_LIMIT_PER_RELATIONSHIP_TYPE,
  PREMIUM_LIMIT_PER_RELATIONSHIP_TYPE,
  buildWordnikUrl,
  extractRequestOptionsFromEvent,
  getErrorStatusCode,
  getTierLimit,
  parseLimit,
  parseRelationshipType,
} from '../netlify/functions/wordnikRelatedWords.mjs';
import {
  buildWordnikDefinitionUrl,
  extractWordFromEvent,
  getStatusCode,
} from '../netlify/functions/wordnikDefinition.mjs';

const ENV_KEYS = ['WORDNIK_BASE_URL', 'WORDNIK_URL_BASE', 'WORDNIK_API_KEY'];
const PRIOR_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

test.after(() => {
  for (const [k, v] of Object.entries(PRIOR_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ---------- getTierLimit (premium gating) ----------

test('getTierLimit returns the premium cap for premium and lifetime members', () => {
  assert.equal(getTierLimit('premium'), PREMIUM_LIMIT_PER_RELATIONSHIP_TYPE);
  assert.equal(getTierLimit('lifetime'), PREMIUM_LIMIT_PER_RELATIONSHIP_TYPE);
});

test('getTierLimit returns the free cap for "free", unknown levels, null, and undefined', () => {
  assert.equal(getTierLimit('free'), FREE_LIMIT_PER_RELATIONSHIP_TYPE);
  assert.equal(getTierLimit(null), FREE_LIMIT_PER_RELATIONSHIP_TYPE);
  assert.equal(getTierLimit(undefined), FREE_LIMIT_PER_RELATIONSHIP_TYPE);
  assert.equal(getTierLimit('admin'), FREE_LIMIT_PER_RELATIONSHIP_TYPE);
  assert.equal(getTierLimit('PREMIUM'), FREE_LIMIT_PER_RELATIONSHIP_TYPE); // case-sensitive
});

test('getTierLimit never returns a value above the premium cap (defense-in-depth)', () => {
  // Whatever the input, the limit must not exceed the documented premium ceiling.
  for (const value of ['premium', 'free', '', null, 'unknown', 999]) {
    assert.ok(getTierLimit(value) <= PREMIUM_LIMIT_PER_RELATIONSHIP_TYPE);
  }
});

// ---------- parseLimit ----------

test('parseLimit defaults to the tier limit when input is null or empty', () => {
  assert.equal(parseLimit(null, { membershipLevel: 'free' }), FREE_LIMIT_PER_RELATIONSHIP_TYPE);
  assert.equal(parseLimit('', { membershipLevel: 'premium' }), PREMIUM_LIMIT_PER_RELATIONSHIP_TYPE);
});

test('parseLimit accepts integer strings within the tier cap', () => {
  assert.equal(parseLimit('25', { membershipLevel: 'free' }), 25);
  assert.equal(parseLimit('200', { membershipLevel: 'premium' }), 200);
});

test('parseLimit rejects values above the free-tier cap for free users', () => {
  // A free user asking for premium-tier volume must be rejected.
  assert.throws(
    () => parseLimit('200', { membershipLevel: 'free' }),
    /must not exceed/,
  );
});

test('parseLimit permits values up to the premium cap for premium users', () => {
  assert.equal(parseLimit('250', { membershipLevel: 'premium' }), 250);
  assert.throws(
    () => parseLimit('251', { membershipLevel: 'premium' }),
    /must not exceed/,
  );
});

test('parseLimit rejects non-integer and non-positive values', () => {
  assert.throws(() => parseLimit('abc'), /positive integer/);
  assert.throws(() => parseLimit('0'), /positive integer/);
  assert.throws(() => parseLimit('-5'), /positive integer/);
});

test('parseLimit treats an unspecified membership level as the free tier', () => {
  assert.equal(parseLimit(null), FREE_LIMIT_PER_RELATIONSHIP_TYPE);
  assert.throws(() => parseLimit('200'), /must not exceed/);
});

// ---------- parseRelationshipType ----------

test('parseRelationshipType defaults to "synonym" when omitted', () => {
  assert.equal(parseRelationshipType(null), 'synonym');
  assert.equal(parseRelationshipType(''), 'synonym');
  assert.equal(parseRelationshipType(undefined), 'synonym');
});

test('parseRelationshipType accepts every documented value', () => {
  for (const value of ALLOWED_WORDNIK_RELATIONSHIP_TYPES) {
    assert.equal(parseRelationshipType(value), value);
  }
});

test('parseRelationshipType normalizes to lowercase before validating', () => {
  assert.equal(parseRelationshipType('SYNONYM'), 'synonym');
  assert.equal(parseRelationshipType('  Antonym  '), 'antonym');
});

test('parseRelationshipType rejects unknown relationship types', () => {
  assert.throws(() => parseRelationshipType('rhyme'), /must be one of/);
  assert.throws(() => parseRelationshipType('javascript:alert(1)'), /must be one of/);
});

// ---------- buildWordnikUrl ----------

test('buildWordnikUrl throws when WORDNIK_BASE_URL is missing', () => {
  clearEnv();
  process.env.WORDNIK_API_KEY = 'k';
  assert.throws(() => buildWordnikUrl('hello', 25, 'synonym'), /WORDNIK_BASE_URL/);
});

test('buildWordnikUrl throws when WORDNIK_API_KEY is missing', () => {
  clearEnv();
  process.env.WORDNIK_BASE_URL = 'https://api.wordnik.com/v4/word.json/';
  assert.throws(() => buildWordnikUrl('hello', 25, 'synonym'), /WORDNIK_API_KEY/);
});

test('buildWordnikUrl composes the expected URL with API key and relationship params', () => {
  clearEnv();
  process.env.WORDNIK_BASE_URL = 'https://api.wordnik.com/v4/word.json/';
  process.env.WORDNIK_API_KEY = 'test-key';
  const url = buildWordnikUrl('hello', 25, 'synonym');
  assert.equal(url.pathname, '/v4/word.json/hello/relatedWords');
  assert.equal(url.searchParams.get('useCanonical'), 'false');
  assert.equal(url.searchParams.get('relationshipTypes'), 'synonym');
  assert.equal(url.searchParams.get('limitPerRelationshipType'), '25');
  assert.equal(url.searchParams.get('api_key'), 'test-key');
});

test('buildWordnikUrl appends a trailing slash to the base URL when missing', () => {
  clearEnv();
  process.env.WORDNIK_BASE_URL = 'https://api.wordnik.com/v4/word.json'; // no trailing slash
  process.env.WORDNIK_API_KEY = 'k';
  const url = buildWordnikUrl('hello', 25, 'synonym');
  assert.equal(url.pathname, '/v4/word.json/hello/relatedWords');
});

test('buildWordnikUrl URL-encodes the term path segment', () => {
  clearEnv();
  process.env.WORDNIK_BASE_URL = 'https://api.wordnik.com/v4/word.json/';
  process.env.WORDNIK_API_KEY = 'k';
  const url = buildWordnikUrl('hello world & friends', 10, 'synonym');
  // Path segment must be percent-encoded so spaces and "&" don't break the URL.
  assert.ok(url.pathname.includes('hello%20world%20%26%20friends'));
});

// ---------- getErrorStatusCode (wordnikRelatedWords) ----------

test('getErrorStatusCode maps missing-word errors to 400', () => {
  assert.equal(getErrorStatusCode(new Error('Missing required query parameter: word')), 400);
});

test('getErrorStatusCode maps validation errors to 400', () => {
  assert.equal(getErrorStatusCode(new Error('Query parameter "limit" must be a positive integer')), 400);
  assert.equal(getErrorStatusCode(new Error('Query parameter "relationshipType" must be one of: synonym')), 400);
});

test('getErrorStatusCode maps upstream Wordnik failures to 502', () => {
  assert.equal(getErrorStatusCode(new Error('Wordnik request failed: timeout')), 502);
});

test('getErrorStatusCode honors an explicit error.statusCode when no message rule matches', () => {
  const err = Object.assign(new Error('arbitrary'), { statusCode: 429 });
  assert.equal(getErrorStatusCode(err), 429);
});

test('getErrorStatusCode defaults to 500 for unknown errors', () => {
  assert.equal(getErrorStatusCode(new Error('something else')), 500);
});

// ---------- extractRequestOptionsFromEvent ----------

test('extractRequestOptionsFromEvent reads queryStringParameters', () => {
  const result = extractRequestOptionsFromEvent({
    queryStringParameters: { word: 'hello', limit: '25', relationshipType: 'antonym' },
  });
  assert.deepEqual(result, { term: 'hello', limit: '25', relationshipType: 'antonym' });
});

test('extractRequestOptionsFromEvent falls back to "phrase" when "word" is absent', () => {
  const result = extractRequestOptionsFromEvent({
    queryStringParameters: { phrase: 'hello world' },
  });
  assert.equal(result.term, 'hello world');
});

test('extractRequestOptionsFromEvent reads from rawUrl when queryStringParameters is absent', () => {
  const result = extractRequestOptionsFromEvent({
    rawUrl: 'https://gematria.today/.netlify/functions/wordnikRelatedWords?word=hi&limit=10',
  });
  assert.equal(result.term, 'hi');
  assert.equal(result.limit, '10');
});

test('extractRequestOptionsFromEvent returns all-nulls for unrecognized events', () => {
  assert.deepEqual(
    extractRequestOptionsFromEvent(null),
    { term: null, limit: null, relationshipType: null },
  );
  assert.deepEqual(
    extractRequestOptionsFromEvent({}),
    { term: null, limit: null, relationshipType: null },
  );
});

// ---------- wordnikDefinition: extractWordFromEvent ----------

test('extractWordFromEvent reads queryStringParameters.word', () => {
  assert.equal(
    extractWordFromEvent({ queryStringParameters: { word: 'hello' } }),
    'hello',
  );
});

test('extractWordFromEvent reads rawUrl when queryStringParameters is absent', () => {
  assert.equal(
    extractWordFromEvent({ rawUrl: 'https://gematria.today/.netlify/functions/wordnikDefinition?word=world' }),
    'world',
  );
});

test('extractWordFromEvent returns null for unrecognized events', () => {
  assert.equal(extractWordFromEvent(null), null);
  assert.equal(extractWordFromEvent({}), null);
  assert.equal(extractWordFromEvent({ queryStringParameters: {} }), null);
});

// ---------- wordnikDefinition: buildWordnikDefinitionUrl ----------

test('buildWordnikDefinitionUrl composes the expected definition URL', () => {
  clearEnv();
  process.env.WORDNIK_BASE_URL = 'https://api.wordnik.com/v4/word.json/';
  process.env.WORDNIK_API_KEY = 'k';
  const url = buildWordnikDefinitionUrl('hello');
  assert.equal(url.pathname, '/v4/word.json/hello/definitions');
  assert.equal(url.searchParams.get('api_key'), 'k');
});

test('buildWordnikDefinitionUrl honors the WORDNIK_URL_BASE fallback env var', () => {
  clearEnv();
  process.env.WORDNIK_URL_BASE = 'https://fallback.example/api/';
  process.env.WORDNIK_API_KEY = 'k';
  const url = buildWordnikDefinitionUrl('hello');
  assert.equal(url.origin, 'https://fallback.example');
  assert.equal(url.pathname, '/api/hello/definitions');
});

test('buildWordnikDefinitionUrl throws when both base-URL env vars are missing', () => {
  clearEnv();
  process.env.WORDNIK_API_KEY = 'k';
  assert.throws(() => buildWordnikDefinitionUrl('hello'), /WORDNIK_BASE_URL/);
});

// ---------- wordnikDefinition: getStatusCode ----------

test('wordnikDefinition.getStatusCode maps missing-word to 400 and missing-env to 500', () => {
  assert.equal(getStatusCode(new Error('Missing required query parameter: word')), 400);
  assert.equal(getStatusCode(new Error('Missing WORDNIK_API_KEY environment variable')), 500);
});

test('wordnikDefinition.getStatusCode maps Wordnik-upstream failures to 502', () => {
  assert.equal(getStatusCode(new Error('Wordnik request failed with status 500')), 502);
});

test('wordnikDefinition.getStatusCode honors explicit error.statusCode', () => {
  const err = Object.assign(new Error('whatever'), { statusCode: 404 });
  assert.equal(getStatusCode(err), 404);
});

test('wordnikDefinition.getStatusCode defaults to 500 for unrecognized errors', () => {
  assert.equal(getStatusCode(new Error('boom')), 500);
});
