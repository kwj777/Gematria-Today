import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  findSiteByOrigin,
  generateHubToken,
  generateSharedSecret,
  getRequestOrigin,
  guideDisplayName,
  normalizeGuideName,
  normalizeSiteUrl,
  validateSites,
} from '../netlify/functions/admin-hub.mjs';

// ---------- guideDisplayName ----------

test('guideDisplayName title-cases the hyphen-separated stem of a guide filename', () => {
  assert.equal(
    guideDisplayName('architect-site-adaptation-guide.html'),
    'Architect Site Adaptation Guide',
  );
  assert.equal(
    guideDisplayName('online-retail-site-adaptation-guide.html'),
    'Online Retail Site Adaptation Guide',
  );
});

test('guideDisplayName drops the .html suffix before splitting', () => {
  assert.equal(guideDisplayName('basic.html'), 'Basic');
});

test('guideDisplayName tolerates empty/nullish input', () => {
  assert.equal(guideDisplayName(''), '');
  assert.equal(guideDisplayName(null), '');
  assert.equal(guideDisplayName(undefined), '');
});

// ---------- normalizeGuideName ----------

test('normalizeGuideName lowercases and trims input', () => {
  assert.equal(
    normalizeGuideName('  ARCHITECT-SITE-ADAPTATION-GUIDE.HTML  '),
    'architect-site-adaptation-guide.html',
  );
});

test('normalizeGuideName collapses repeated trailing .html (canonicalization)', () => {
  // The site-adaptation routing path can produce ".html.html.html" tails;
  // the canonicalizer must reduce them to a single .html so the file lookup
  // succeeds.
  assert.equal(
    normalizeGuideName('architect-site-adaptation-guide.html.html'),
    'architect-site-adaptation-guide.html',
  );
  assert.equal(
    normalizeGuideName('architect-site-adaptation-guide.html.html.html'),
    'architect-site-adaptation-guide.html',
  );
});

test('normalizeGuideName returns "" for empty/nullish input', () => {
  assert.equal(normalizeGuideName(''), '');
  assert.equal(normalizeGuideName(null), '');
});

// ---------- generateSharedSecret ----------

test('generateSharedSecret returns a 64-char hex string (32 random bytes)', () => {
  const secret = generateSharedSecret();
  assert.match(secret, /^[0-9a-f]{64}$/);
});

test('generateSharedSecret returns a different value each call', () => {
  const secrets = new Set(Array.from({ length: 10 }, () => generateSharedSecret()));
  assert.equal(secrets.size, 10);
});

// ---------- generateHubToken ----------

test('generateHubToken returns a payload.signature pair joined by a dot', () => {
  const token = generateHubToken('user-1', 'shared-secret-value');
  const parts = token.split('.');
  assert.equal(parts.length, 2);
});

test('generateHubToken signs the base64url payload with HMAC-SHA256(sharedSecret)', () => {
  const secret = 'test-shared-secret';
  const token = generateHubToken('user-1', secret);
  const [payloadB64, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  assert.equal(signature, expectedSignature);
});

test('generateHubToken encodes a JSON payload containing the userId, ts, and a hex nonce', () => {
  const token = generateHubToken('user-77', 'secret');
  const [payloadB64] = token.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  assert.equal(payload.userId, 'user-77');
  assert.ok(typeof payload.ts === 'number' && payload.ts > 0);
  assert.match(payload.nonce, /^[0-9a-f]{32}$/);
});

test('generateHubToken produces different tokens for the same inputs (nonce randomness)', () => {
  const tokens = new Set(Array.from({ length: 5 }, () => generateHubToken('user-1', 'secret')));
  assert.equal(tokens.size, 5);
});

// ---------- normalizeSiteUrl ----------

test('normalizeSiteUrl trims and strips a trailing slash', () => {
  assert.equal(normalizeSiteUrl('  https://example.com/  '), 'https://example.com');
  assert.equal(normalizeSiteUrl('https://example.com'), 'https://example.com');
});

test('normalizeSiteUrl preserves the path when not trailing', () => {
  assert.equal(normalizeSiteUrl('https://example.com/foo'), 'https://example.com/foo');
});

test('normalizeSiteUrl coerces nullish input to ""', () => {
  assert.equal(normalizeSiteUrl(null), '');
  assert.equal(normalizeSiteUrl(undefined), '');
  assert.equal(normalizeSiteUrl(''), '');
});

// ---------- getRequestOrigin ----------

test('getRequestOrigin extracts the origin from rawUrl when present', () => {
  const result = getRequestOrigin({ rawUrl: 'https://gematria.today/api/admin-hub?foo=bar' });
  assert.equal(result, 'https://gematria.today');
});

test('getRequestOrigin falls back to x-forwarded-proto + x-forwarded-host', () => {
  const result = getRequestOrigin({
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'gematria.today',
    },
  });
  assert.equal(result, 'https://gematria.today');
});

test('getRequestOrigin falls back to host header when x-forwarded-host is absent', () => {
  const result = getRequestOrigin({
    headers: { 'x-forwarded-proto': 'https', host: 'gematria.today' },
  });
  assert.equal(result, 'https://gematria.today');
});

test('getRequestOrigin uses URL env var when no headers are useful', () => {
  const priorUrl = process.env.URL;
  process.env.URL = 'https://from-env.example.com/';
  try {
    const result = getRequestOrigin({ headers: {} });
    assert.equal(result, 'https://from-env.example.com');
  } finally {
    if (priorUrl === undefined) delete process.env.URL;
    else process.env.URL = priorUrl;
  }
});

test('getRequestOrigin ignores malformed rawUrl and falls through to header fallback', () => {
  const result = getRequestOrigin({
    rawUrl: 'not a url',
    headers: { 'x-forwarded-proto': 'https', host: 'gematria.today' },
  });
  assert.equal(result, 'https://gematria.today');
});

// ---------- findSiteByOrigin ----------

test('findSiteByOrigin returns the site whose normalized url matches the origin (case-insensitively)', () => {
  const sites = [
    { id: 'a', url: 'https://Site-A.example.com/' },
    { id: 'b', url: 'https://site-b.example.com' },
  ];
  assert.equal(findSiteByOrigin(sites, 'https://site-a.example.com').id, 'a');
  assert.equal(findSiteByOrigin(sites, 'https://SITE-B.example.com').id, 'b');
});

test('findSiteByOrigin returns null when no site matches', () => {
  const sites = [{ id: 'a', url: 'https://site-a.example.com' }];
  assert.equal(findSiteByOrigin(sites, 'https://other.example.com'), null);
});

test('findSiteByOrigin returns null for empty origin input', () => {
  const sites = [{ id: 'a', url: 'https://site-a.example.com' }];
  assert.equal(findSiteByOrigin(sites, ''), null);
});

// ---------- validateSites ----------

test('validateSites rejects non-array input with a 400', () => {
  assert.throws(
    () => validateSites('not an array', []),
    (err) => err.statusCode === 400 && /must be an array/.test(err.message),
  );
});

test('validateSites rejects sites missing id/name/url/sharedSecret with a 400', () => {
  assert.throws(
    () => validateSites([{ name: 'no id', url: 'https://example.com', sharedSecret: 's' }], []),
    (err) => err.statusCode === 400 && /missing an id/.test(err.message),
  );
  assert.throws(
    () => validateSites([{ id: 'a', url: 'https://example.com', sharedSecret: 's' }], []),
    (err) => err.statusCode === 400 && /missing a name/.test(err.message),
  );
  assert.throws(
    () => validateSites([{ id: 'a', name: 'A', sharedSecret: 's' }], []),
    (err) => err.statusCode === 400 && /invalid url/.test(err.message),
  );
});

test('validateSites rejects non-http(s) URLs', () => {
  assert.throws(
    () => validateSites([{ id: 'a', name: 'A', url: 'ftp://example.com', sharedSecret: 's' }], []),
    (err) => err.statusCode === 400 && /invalid url/.test(err.message),
  );
  assert.throws(
    () => validateSites([{ id: 'a', name: 'A', url: 'javascript:alert(1)', sharedSecret: 's' }], []),
    (err) => err.statusCode === 400 && /invalid url/.test(err.message),
  );
});

test('validateSites strips a trailing slash from the site url', () => {
  const result = validateSites(
    [{ id: 'a', name: 'A', url: 'https://example.com/', sharedSecret: 's' }],
    [],
  );
  assert.equal(result[0].url, 'https://example.com');
});

test('validateSites resolves the "__keep__" sharedSecret sentinel using the existing-sites list', () => {
  // The UI sends "__keep__" when the user has not edited the secret, so the
  // server must restore it from the prior DB value rather than overwriting
  // with an empty/sentinel value.
  const existingSites = [{ id: 'a', sharedSecret: 'the-real-secret' }];
  const result = validateSites(
    [{ id: 'a', name: 'A', url: 'https://example.com', sharedSecret: '__keep__' }],
    existingSites,
  );
  assert.equal(result[0].sharedSecret, 'the-real-secret');
});

test('validateSites rejects "__keep__" when no existing entry matches (would otherwise produce an empty secret)', () => {
  assert.throws(
    () => validateSites(
      [{ id: 'unknown', name: 'A', url: 'https://example.com', sharedSecret: '__keep__' }],
      [],
    ),
    (err) => err.statusCode === 400 && /missing a sharedSecret/.test(err.message),
  );
});

test('validateSites returns a normalized site row with optional netlifySiteId preserved', () => {
  const result = validateSites(
    [{
      id: 'a', name: '  A  ', url: 'https://example.com',
      sharedSecret: 'secret', netlifySiteId: 'netlify-xyz',
    }],
    [],
  );
  assert.deepEqual(result[0], {
    id: 'a',
    name: 'A',
    url: 'https://example.com',
    sharedSecret: 'secret',
    netlifySiteId: 'netlify-xyz',
  });
});
