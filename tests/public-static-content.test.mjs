import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handler as publicStaticContentHandler,
  normalizePageId,
  parsePagination,
} from '../netlify/functions/public-static-content.mjs';

// ---------- normalizePageId ----------

test('normalizePageId maps "/" and "/index(.html)" to the "home" alias', () => {
  assert.equal(normalizePageId('/'), 'home');
  assert.equal(normalizePageId('/index'), 'home');
  assert.equal(normalizePageId('/index.html'), 'home');
});

test('normalizePageId maps /why-english-gematria(.html) to the "about" alias', () => {
  assert.equal(normalizePageId('/why-english-gematria'), 'about');
  assert.equal(normalizePageId('/why-english-gematria.html'), 'about');
});

test('normalizePageId maps the standard alias set for blog/faq/contact/privacy/terms', () => {
  assert.equal(normalizePageId('/blog'), 'blog');
  assert.equal(normalizePageId('/faq.html'), 'faq');
  assert.equal(normalizePageId('/contact'), 'contact');
  assert.equal(normalizePageId('/privacy.html'), 'privacy');
  assert.equal(normalizePageId('/terms'), 'terms');
});

test('normalizePageId strips a trailing .html for unaliased paths', () => {
  assert.equal(normalizePageId('/calculator.html'), '/calculator');
  assert.equal(normalizePageId('arbitrary.html'), 'arbitrary');
});

test('normalizePageId trims and lowercases input', () => {
  assert.equal(normalizePageId('  /FAQ.HTML  '), 'faq');
});

test('normalizePageId returns an empty string for empty/whitespace/nullish input', () => {
  assert.equal(normalizePageId(''), '');
  assert.equal(normalizePageId('   '), '');
  assert.equal(normalizePageId(null), '');
  assert.equal(normalizePageId(undefined), '');
});

// ---------- parsePagination ----------

test('parsePagination defaults to offset=0, limit=20 when no query is provided', () => {
  assert.deepEqual(parsePagination({}), { offset: 0, limit: 20 });
  assert.deepEqual(parsePagination(), { offset: 0, limit: 20 });
});

test('parsePagination accepts positive integer offset and limit', () => {
  assert.deepEqual(parsePagination({ offset: '40', limit: '30' }), { offset: 40, limit: 30 });
});

test('parsePagination clamps an excessive limit to MAX_LIMIT (100)', () => {
  // The 100-row cap is the security boundary against expensive list queries.
  assert.deepEqual(parsePagination({ limit: '500' }), { offset: 0, limit: 100 });
});

test('parsePagination ignores zero/negative offset and limit, falling back to defaults', () => {
  assert.deepEqual(parsePagination({ offset: '0', limit: '0' }), { offset: 0, limit: 20 });
  assert.deepEqual(parsePagination({ offset: '-5', limit: '-5' }), { offset: 0, limit: 20 });
});

test('parsePagination ignores non-numeric offset and limit, falling back to defaults', () => {
  assert.deepEqual(parsePagination({ offset: 'abc', limit: 'xyz' }), { offset: 0, limit: 20 });
});

// ---------- public-static-content handler (DB-free) ----------

test('public-static-content rejects non-GET requests with 405', async () => {
  const response = await publicStaticContentHandler({ httpMethod: 'POST' });
  assert.equal(response.statusCode, 405);
  assert.deepEqual(JSON.parse(response.body), { error: 'Method not allowed' });
});

test('public-static-content returns 400 when the page query parameter is missing', async () => {
  const response = await publicStaticContentHandler({
    httpMethod: 'GET',
    queryStringParameters: {},
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'page query parameter is required' });
});

test('public-static-content returns 400 when the page query parameter is whitespace only', async () => {
  const response = await publicStaticContentHandler({
    httpMethod: 'GET',
    queryStringParameters: { page: '   ' },
  });
  assert.equal(response.statusCode, 400);
});

test('public-static-content returns the standard envelope for a valid page id', async () => {
  const response = await publicStaticContentHandler({
    httpMethod: 'GET',
    queryStringParameters: { page: '/faq.html', offset: '20', limit: '50' },
  });
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.pageId, 'faq');
  assert.deepEqual(payload.content, {});
  assert.equal(payload.updatedAt, null);
  assert.deepEqual(payload.pagination, { offset: 20, limit: 50, total: 0 });
});

test('public-static-content carries the standard security headers on the 200 response', async () => {
  const response = await publicStaticContentHandler({
    httpMethod: 'GET',
    queryStringParameters: { page: '/' },
  });
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['referrer-policy'], 'same-origin');
});
