import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatBlogPostProposal,
  formatFaq,
  formatFeed,
  formatPost,
  formatTask,
  methodNotAllowedResponse,
  requireHttpMethod,
  routeByHttpMethod,
  slugify,
} from '../netlify/functions/_admin.mjs';

// ---------- slugify ----------

test('slugify lowercases, trims, and collapses non-alphanumerics to hyphens', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('  Multiple   Spaces  '), 'multiple-spaces');
  assert.equal(slugify('Mixed-CASE_123!'), 'mixed-case-123');
});

test('slugify strips leading and trailing hyphens after substitution', () => {
  assert.equal(slugify('---foo bar---'), 'foo-bar');
  assert.equal(slugify('!@#hello#@!'), 'hello');
});

test('slugify falls back to a random "post-<hex>" slug when input has no alphanumerics', () => {
  assert.match(slugify(''), /^post-[0-9a-f]{8}$/);
  assert.match(slugify('!!!'), /^post-[0-9a-f]{8}$/);
  assert.match(slugify('   '), /^post-[0-9a-f]{8}$/);
});

test('slugify coerces non-string input safely', () => {
  assert.match(slugify(null), /^post-[0-9a-f]{8}$/);
  assert.match(slugify(undefined), /^post-[0-9a-f]{8}$/);
  assert.equal(slugify(42), '42');
});

// ---------- methodNotAllowedResponse / requireHttpMethod ----------

test('methodNotAllowedResponse returns a 405 with the standard error envelope and headers', () => {
  const response = methodNotAllowedResponse();
  assert.equal(response.statusCode, 405);
  assert.deepEqual(JSON.parse(response.body), { error: 'Method not allowed' });
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('requireHttpMethod returns null when the request method is allowed', () => {
  assert.equal(requireHttpMethod({ httpMethod: 'GET' }, 'GET'), null);
  assert.equal(requireHttpMethod({ httpMethod: 'post' }, 'POST'), null);
  assert.equal(requireHttpMethod({ httpMethod: 'GET' }, 'GET', 'POST'), null);
});

test('requireHttpMethod returns a 405 response when the method is not allowed', () => {
  const response = requireHttpMethod({ httpMethod: 'DELETE' }, 'GET', 'POST');
  assert.equal(response.statusCode, 405);
  assert.deepEqual(JSON.parse(response.body), { error: 'Method not allowed' });
});

test('requireHttpMethod handles nested method arrays (e.g. spread of an allowlist)', () => {
  assert.equal(requireHttpMethod({ httpMethod: 'POST' }, ['GET', 'POST']), null);
  const response = requireHttpMethod({ httpMethod: 'PUT' }, ['GET', 'POST']);
  assert.equal(response.statusCode, 405);
});

test('requireHttpMethod treats a missing httpMethod as not allowed', () => {
  const response = requireHttpMethod({}, 'GET');
  assert.equal(response.statusCode, 405);
});

// ---------- routeByHttpMethod ----------

test('routeByHttpMethod dispatches to the matching handler by method', async () => {
  const result = await routeByHttpMethod(
    { httpMethod: 'POST' },
    {
      GET: async () => ({ ok: 'get' }),
      POST: async () => ({ ok: 'post' }),
    },
  );
  assert.deepEqual(result, { ok: 'post' });
});

test('routeByHttpMethod is case-insensitive on the request method', async () => {
  const result = await routeByHttpMethod(
    { httpMethod: 'get' },
    { GET: async () => ({ ok: true }) },
  );
  assert.deepEqual(result, { ok: true });
});

test('routeByHttpMethod returns the default 405 when no handler matches', async () => {
  const result = await routeByHttpMethod(
    { httpMethod: 'PATCH' },
    { GET: async () => ({ ok: true }) },
  );
  assert.equal(result.statusCode, 405);
});

test('routeByHttpMethod honors a custom methodNotAllowed handler', async () => {
  const result = await routeByHttpMethod(
    { httpMethod: 'PATCH' },
    { GET: async () => ({ ok: true }) },
    { methodNotAllowed: () => ({ statusCode: 418, body: 'teapot' }) },
  );
  assert.equal(result.statusCode, 418);
  assert.equal(result.body, 'teapot');
});

// ---------- formatPost ----------

test('formatPost passes through every documented field and renames snake_case columns', () => {
  const row = {
    id: 'p-1',
    title: 'Title',
    slug: 'title',
    tag: 'one, two',
    summary: 'sum',
    body: 'body',
    read_time: 7,
    image_url: 'i.png',
    slider_image_url: 's.png',
    background_image_url: 'bg.png',
    show_on_homepage: true,
    hide_from_blog: false,
    status: 'published',
    published_at: '2025-01-01T00:00:00Z',
    scheduled_publish_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-12-31T00:00:00Z',
  };
  const result = formatPost(row);
  assert.equal(result.readTime, 7);
  assert.equal(result.imageUrl, 'i.png');
  assert.equal(result.sliderImageUrl, 's.png');
  assert.equal(result.backgroundImageUrl, 'bg.png');
  assert.equal(result.showOnHomepage, true);
  assert.equal(result.hideFromBlog, false);
  assert.equal(result.publishedAt, '2025-01-01T00:00:00Z');
});

test('formatPost splits comma-separated tags and deduplicates case-insensitively (later occurrence wins)', () => {
  // Dedup key is lowercased, but the Map keeps the LAST value seen for each
  // key, so a later-cased duplicate replaces the earlier casing.
  const result = formatPost({ tag: 'one, two, ONE, three' });
  assert.deepEqual(result.tags, ['ONE', 'two', 'three']);
});

test('formatPost returns an empty tags array and null tag when row.tag is blank', () => {
  const result = formatPost({ tag: '   ' });
  assert.deepEqual(result.tags, []);
  assert.equal(result.tag, null);
});

test('formatPost tolerates undefined tag column', () => {
  const result = formatPost({});
  assert.deepEqual(result.tags, []);
  assert.equal(result.tag, null);
});

// ---------- formatFeed / formatTask / formatFaq ----------

test('formatFeed renames snake_case columns', () => {
  const result = formatFeed({
    id: 'f1', name: 'n', url: 'u', category: 'c', notes: 'nt',
    is_active: true, created_at: 'c', updated_at: 'u',
  });
  assert.equal(result.isActive, true);
  assert.equal(result.createdAt, 'c');
  assert.equal(result.updatedAt, 'u');
});

test('formatTask renames the due_date column', () => {
  const result = formatTask({
    id: 't1', title: 't', owner: 'o', due_date: '2025-01-01',
    notes: 'n', status: 'open', created_at: 'c', updated_at: 'u',
  });
  assert.equal(result.dueDate, '2025-01-01');
});

test('formatFaq exposes camelCase sortOrder and isPublished', () => {
  const result = formatFaq({
    id: 'q1', question: 'q', answer: 'a', sort_order: 3,
    is_published: true, created_at: 'c', updated_at: 'u',
  });
  assert.equal(result.sortOrder, 3);
  assert.equal(result.isPublished, true);
});

// ---------- formatBlogPostProposal ----------

test('formatBlogPostProposal renames the attribution and review columns', () => {
  const result = formatBlogPostProposal({
    id: 'bp1',
    user_id: 'u1',
    title: 't',
    summary: 's',
    body: 'b',
    suggested_tags: 'one,two',
    attribution_username: 'au',
    attribution_display_name: 'ad',
    attribution_email: 'ae@example.com',
    proposed_image_url: 'p.png',
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    rejection_explanation: null,
    created_at: 'c',
    updated_at: 'u',
  });
  assert.equal(result.userId, 'u1');
  assert.equal(result.suggestedTags, 'one,two');
  assert.equal(result.attributionUsername, 'au');
  assert.equal(result.attributionDisplayName, 'ad');
  assert.equal(result.attributionEmail, 'ae@example.com');
  assert.equal(result.proposedImageUrl, 'p.png');
});
