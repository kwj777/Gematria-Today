import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItem,
  escapeXml,
  extractDescription,
  formatRfc822Date,
  handler,
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

// ---------- handler ----------

// Stand-in for Neon's HTTP endpoint so the real handler runs end to end. It
// keeps the posts table, applies the scheduled-post promotion the way Postgres
// would, and answers the feed query with the published, unhidden posts.
async function withFakeDatabase(posts, run) {
  const priorFetch = globalThis.fetch;
  const priorUrl = process.env.DATABASE_URL;
  const table = posts.map((post) => ({ ...post }));
  const statements = [];
  const result = (rows) => {
    if (!rows.length) return { fields: [], rows: [] };
    const names = Object.keys(rows[0]);
    return {
      fields: names.map((name) => ({ name, dataTypeID: 25 })),
      rows: rows.map((row) => names.map((name) => row[name])),
    };
  };
  const answer = ({ query }) => {
    if (/UPDATE posts[\s\S]*scheduled_publish_at <= NOW\(\)/.test(query)) {
      statements.push('promote');
      const due = table.filter((post) => post.status === 'draft'
        && post.scheduled_publish_at
        && Date.parse(post.scheduled_publish_at) <= Date.now());
      due.forEach((post) => {
        post.status = 'published';
        post.published_at = post.published_at || post.scheduled_publish_at;
        post.scheduled_publish_at = null;
      });
      return result(due.map(({ id }) => ({ id })));
    }
    if (/SELECT \* FROM posts/.test(query)) {
      statements.push('select-posts');
      return result(table.filter((post) => (String(post.status || '').trim() || 'published') === 'published' && !post.hide_from_blog));
    }
    return { fields: [], rows: [] };
  };
  process.env.DATABASE_URL = 'postgres://user:pass@db.example.test/neondb';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const payload = Array.isArray(body.queries) ? { results: body.queries.map(answer) } : answer(body);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    return { response: await run(), statements };
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = priorUrl;
    }
  }
}

// The feed matches only published posts, and scheduled posts used to stay
// drafts until an admin opened admin-posts, so subscribers never saw them.
test('handler promotes due scheduled posts before building the feed', async () => {
  const { response, statements } = await withFakeDatabase([
    { id: 'p1', slug: 'published-post', title: 'Published post', summary: 's', status: 'published', published_at: '2025-01-10T12:00:00Z' },
    { id: 'p2', slug: 'scheduled-post', title: 'Scheduled post', summary: 's', status: 'draft', scheduled_publish_at: '2025-02-01T09:00:00Z' },
    { id: 'p3', slug: 'future-post', title: 'Future post', summary: 's', status: 'draft', scheduled_publish_at: '2999-01-01T09:00:00Z' },
  ], () => handler({ httpMethod: 'GET', headers: {} }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(statements, ['promote', 'select-posts']);
  assert.ok(response.body.includes('<link>https://gematria.today/blog/scheduled-post</link>'));
  assert.ok(response.body.includes(`<pubDate>${new Date('2025-02-01T09:00:00Z').toUTCString()}</pubDate>`));
  assert.ok(!response.body.includes('future-post'));
});
