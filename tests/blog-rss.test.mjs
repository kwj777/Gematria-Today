import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItem,
  escapeXml,
  extractDescription,
  formatRfc822Date,
  stripHtml,
  toAbsoluteUrl,
} from '../netlify/functions/blog-rss.mjs';

// ---------- escapeXml ----------

test('escapeXml escapes all five required XML entities', () => {
  assert.equal(escapeXml('a & b < c > d " e \' f'), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
});

test('escapeXml escapes ampersand before other entities to avoid double-escaping', () => {
  // If "&" weren't handled first, "&lt;" inside the input would become "&amp;lt;".
  assert.equal(escapeXml('&lt;'), '&amp;lt;');
});

// ---------- stripHtml ----------

test('stripHtml removes script and style blocks entirely (including contents)', () => {
  // <script> and <style> contents must not survive — they would inject markup
  // when embedded inside an RSS <description>.
  assert.equal(
    stripHtml('before<script>alert(1)</script>after'),
    'before after',
  );
  assert.equal(
    stripHtml('before<style>body{color:red}</style>after'),
    'before after',
  );
});

test('stripHtml strips remaining tags and collapses whitespace', () => {
  assert.equal(
    stripHtml('<p>Hello   <strong>world</strong></p>'),
    'Hello world',
  );
});

test('stripHtml is case-insensitive for script and style block removal', () => {
  // The script-removal pattern uses /i; verify uppercase variants are also removed.
  assert.equal(stripHtml('<SCRIPT>alert(1)</SCRIPT>x'), 'x');
  assert.equal(stripHtml('<Style>body{}</Style>x'), 'x');
});

test('stripHtml returns an empty string for empty input and trims whitespace', () => {
  assert.equal(stripHtml(''), '');
  assert.equal(stripHtml('   '), '');
});

// ---------- toAbsoluteUrl ----------

test('toAbsoluteUrl passes through fully-qualified http(s) URLs', () => {
  assert.equal(toAbsoluteUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(toAbsoluteUrl('http://example.com/a'), 'http://example.com/a');
});

test('toAbsoluteUrl resolves root-relative paths against the gematria.today origin', () => {
  assert.equal(toAbsoluteUrl('/foo'), 'https://gematria.today/foo');
});

test('toAbsoluteUrl resolves bare paths by prefixing /', () => {
  assert.equal(toAbsoluteUrl('foo'), 'https://gematria.today/foo');
});

test('toAbsoluteUrl falls back to /blog.html for empty/whitespace input', () => {
  assert.equal(toAbsoluteUrl(''), 'https://gematria.today/blog.html');
  assert.equal(toAbsoluteUrl('   '), 'https://gematria.today/blog.html');
});

// ---------- formatRfc822Date ----------

test('formatRfc822Date returns a UTC-string form for valid dates', () => {
  // Use an ISO timestamp known to be parseable on every platform.
  const result = formatRfc822Date('2025-01-15T12:34:56Z');
  assert.equal(result, new Date('2025-01-15T12:34:56Z').toUTCString());
});

test('formatRfc822Date falls back to "now" for unparseable input', () => {
  // The result must be a valid RFC-822 / UTC string, even if the input is junk.
  const result = formatRfc822Date('not a date');
  assert.ok(!Number.isNaN(new Date(result).getTime()));
});

test('formatRfc822Date defaults to "now" when given empty input', () => {
  const result = formatRfc822Date('');
  assert.ok(!Number.isNaN(new Date(result).getTime()));
});

// ---------- extractDescription ----------

test('extractDescription prefers summary text over body text', () => {
  const post = { summary: 'Short summary.', body: '<p>Longer body content</p>' };
  assert.equal(extractDescription(post), 'Short summary.');
});

test('extractDescription falls back to a stripped body when summary is empty', () => {
  const post = { summary: '', body: '<p>Body text</p>' };
  assert.equal(extractDescription(post), 'Body text');
});

test('extractDescription truncates a long body at 220 chars with an ellipsis', () => {
  const longBody = 'a'.repeat(500);
  const result = extractDescription({ body: longBody });
  // Truncation: 220 chars + ellipsis.
  assert.equal(result.length, 221);
  assert.ok(result.endsWith('…'));
});

test('extractDescription returns the canned fallback when both summary and body are empty', () => {
  const result = extractDescription({});
  assert.equal(result, 'Read the latest gematria research article on Gematria.Today.');
});

test('extractDescription scrubs script blocks before truncation (no markup leakage)', () => {
  const post = { summary: '', body: '<script>alert(1)</script>safe content' };
  const result = extractDescription(post);
  assert.equal(result, 'safe content');
  assert.ok(!result.includes('<script'));
});

// ---------- buildItem ----------

test('buildItem assembles a well-formed RSS <item> with escaped fields', () => {
  const item = buildItem({
    title: 'Gematria & Numbers <intro>',
    slug: 'gematria-intro',
    summary: 'Intro summary.',
    publishedAt: '2025-01-15T12:34:56Z',
  });
  assert.ok(item.startsWith('<item>'));
  assert.ok(item.trim().endsWith('</item>'));
  // Title must be XML-escaped.
  assert.ok(item.includes('<title>Gematria &amp; Numbers &lt;intro&gt;</title>'));
  // Description from summary, no markup.
  assert.ok(item.includes('<description>Intro summary.</description>'));
  // Link/guid point at /blog/{slug} on the canonical origin.
  assert.ok(item.includes('<link>https://gematria.today/blog/gematria-intro</link>'));
  assert.ok(item.includes('<guid isPermaLink="true">https://gematria.today/blog/gematria-intro</guid>'));
});

test('buildItem URL-encodes the slug path segment', () => {
  const item = buildItem({ title: 't', slug: 'hello world & friends' });
  assert.ok(item.includes('/blog/hello%20world%20%26%20friends'));
});

test('buildItem falls back to "Untitled post" when title is missing', () => {
  const item = buildItem({ slug: 's' });
  assert.ok(item.includes('<title>Untitled post</title>'));
});

test('buildItem falls back to createdAt when publishedAt is absent', () => {
  const item = buildItem({
    title: 't', slug: 's',
    createdAt: '2025-01-15T12:34:56Z',
  });
  assert.ok(item.includes(`<pubDate>${new Date('2025-01-15T12:34:56Z').toUTCString()}</pubDate>`));
});
