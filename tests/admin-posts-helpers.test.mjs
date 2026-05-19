import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePostStatus,
  normalizePostTags,
  normalizeScheduledPublishAt,
} from '../netlify/functions/admin-posts.mjs';

// ---------- normalizePostTags ----------

test('normalizePostTags returns null for empty input', () => {
  assert.equal(normalizePostTags(null, null), null);
  assert.equal(normalizePostTags('', null), null);
  assert.equal(normalizePostTags(undefined, []), null);
});

test('normalizePostTags accepts a comma- or semicolon-separated string', () => {
  assert.equal(normalizePostTags('one, two; three', null), 'one, two, three');
});

test('normalizePostTags accepts an array of tags', () => {
  assert.equal(normalizePostTags(null, ['one', 'two', 'three']), 'one, two, three');
});

test('normalizePostTags merges array tags with string tags (array first)', () => {
  // The array values come first, then any string-input tokens.
  assert.equal(
    normalizePostTags('three, four', ['one', 'two']),
    'one, two, three, four',
  );
});

test('normalizePostTags deduplicates case-insensitively (first occurrence wins)', () => {
  assert.equal(normalizePostTags('one, ONE, One, two', null), 'one, two');
});

test('normalizePostTags trims whitespace from each token', () => {
  assert.equal(normalizePostTags('  one  ,   two   ;  three  ', null), 'one, two, three');
});

test('normalizePostTags drops empty tokens', () => {
  assert.equal(normalizePostTags('one,,,two,,', null), 'one, two');
});

test('normalizePostTags coerces a non-string, non-array single value into one tag', () => {
  // e.g. legacy callers that pass a single tag value as a number or symbol-ish input.
  assert.equal(normalizePostTags(42, null), '42');
});

test('normalizePostTags ignores non-array tagsInput', () => {
  assert.equal(normalizePostTags('one, two', 'not-an-array'), 'one, two');
});

// ---------- normalizePostStatus ----------

test('normalizePostStatus accepts "draft" and "archived"', () => {
  assert.equal(normalizePostStatus('draft'), 'draft');
  assert.equal(normalizePostStatus('archived'), 'archived');
});

test('normalizePostStatus lowercases and trims input', () => {
  assert.equal(normalizePostStatus('  DRAFT  '), 'draft');
  assert.equal(normalizePostStatus('Archived'), 'archived');
});

test('normalizePostStatus defaults to "published" for unknown or missing values', () => {
  // The default-to-published behavior is important to pin: an unknown status
  // value should never silently hide a post.
  assert.equal(normalizePostStatus(''), 'published');
  assert.equal(normalizePostStatus(null), 'published');
  assert.equal(normalizePostStatus(undefined), 'published');
  assert.equal(normalizePostStatus('unpublished'), 'published');
  assert.equal(normalizePostStatus('hidden'), 'published');
});

// ---------- normalizeScheduledPublishAt ----------

test('normalizeScheduledPublishAt returns null for empty/whitespace input', () => {
  assert.equal(normalizeScheduledPublishAt(''), null);
  assert.equal(normalizeScheduledPublishAt('   '), null);
  assert.equal(normalizeScheduledPublishAt(null), null);
  assert.equal(normalizeScheduledPublishAt(undefined), null);
});

test('normalizeScheduledPublishAt parses ISO timestamps and re-emits ISO strings', () => {
  assert.equal(
    normalizeScheduledPublishAt('2025-01-15T12:34:56Z'),
    '2025-01-15T12:34:56.000Z',
  );
});

test('normalizeScheduledPublishAt parses common alternate date formats', () => {
  const result = normalizeScheduledPublishAt('2025-01-15');
  // The output is always an ISO-8601 string ending in Z.
  assert.ok(result.endsWith('Z'));
  assert.equal(new Date(result).getUTCFullYear(), 2025);
});

test('normalizeScheduledPublishAt returns null for unparseable input rather than throwing', () => {
  assert.equal(normalizeScheduledPublishAt('not a date'), null);
  assert.equal(normalizeScheduledPublishAt('abc'), null);
});
