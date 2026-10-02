import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGoneHtml,
  buildShareHtml,
  escapeHtml,
  extractPostSlug,
  getPostHeroImage,
  handler,
  getShareDescription,
  stripHtml,
  toAbsoluteUrl,
  toShareImageUrl,
} from '../netlify/functions/blog-post-share.mjs';

// ---------- escapeHtml ----------

test('escapeHtml escapes the five required entities', () => {
  assert.equal(escapeHtml(`& < > " '`), `&amp; &lt; &gt; &quot; &#39;`);
});

test('escapeHtml escapes & first to avoid double-escaping', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

// ---------- stripHtml ----------

test('stripHtml removes script and style blocks entirely (case-insensitively)', () => {
  // These blocks must NEVER leak into <meta description=...> for share previews.
  assert.equal(stripHtml('before<script>alert(1)</script>after'), 'before after');
  assert.equal(stripHtml('a<STYLE>body{}</STYLE>b'), 'a b');
});

test('stripHtml removes remaining tags and collapses whitespace', () => {
  assert.equal(stripHtml('<p>Hello   <strong>world</strong></p>'), 'Hello world');
});

// ---------- toAbsoluteUrl ----------

test('toAbsoluteUrl passes through fully-qualified URLs', () => {
  assert.equal(toAbsoluteUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(toAbsoluteUrl('http://example.com/a'), 'http://example.com/a');
});

test('toAbsoluteUrl upgrades protocol-relative URLs to https', () => {
  assert.equal(toAbsoluteUrl('//cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
});

test('toAbsoluteUrl resolves root-relative and bare paths against gematria.today', () => {
  assert.equal(toAbsoluteUrl('/foo'), 'https://gematria.today/foo');
  assert.equal(toAbsoluteUrl('foo'), 'https://gematria.today/foo');
});

test('toAbsoluteUrl returns "" for empty/whitespace input', () => {
  assert.equal(toAbsoluteUrl(''), '');
  assert.equal(toAbsoluteUrl('   '), '');
});

// ---------- toShareImageUrl ----------

test('toShareImageUrl pipes SVG assets through the Netlify image transform with the OGP width/format', () => {
  // SVG cannot be displayed as an OG image directly by most crawlers, so it
  // must be rasterized via /.netlify/images?url=...&w=1200&fm=jpg.
  const url = toShareImageUrl('/assets/hero.svg');
  assert.ok(url.startsWith('https://gematria.today/.netlify/images?'));
  assert.ok(url.includes('url=' + encodeURIComponent('https://gematria.today/assets/hero.svg')));
  assert.ok(url.includes('w=1200'));
  assert.ok(url.includes('fm=jpg'));
});

test('toShareImageUrl passes through non-SVG image URLs untouched (absolute)', () => {
  assert.equal(
    toShareImageUrl('/assets/hero.png'),
    'https://gematria.today/assets/hero.png',
  );
});

test('toShareImageUrl returns "" for empty input', () => {
  assert.equal(toShareImageUrl(''), '');
});

// ---------- getPostHeroImage ----------

test('getPostHeroImage prefers heroImageUrl over the other candidates', () => {
  const post = {
    heroImageUrl: '/a.svg',
    imageUrl: '/b.svg',
    backgroundImageUrl: '/c.svg',
    sliderImageUrl: '/d.svg',
  };
  assert.equal(getPostHeroImage(post), '/a.svg');
});

test('getPostHeroImage falls through imageUrl, backgroundImageUrl, sliderImageUrl in order', () => {
  assert.equal(getPostHeroImage({ imageUrl: '/b.svg' }), '/b.svg');
  assert.equal(getPostHeroImage({ backgroundImageUrl: '/c.svg' }), '/c.svg');
  assert.equal(getPostHeroImage({ sliderImageUrl: '/d.svg' }), '/d.svg');
});

test('getPostHeroImage uses the slug override when the post has no image fields set', () => {
  assert.equal(
    getPostHeroImage({ slug: 'amillennialism-what-it-is-and-isn-t' }),
    '/assets/amillennialism-post-01-graphic.svg',
  );
});

test('getPostHeroImage falls back to FALLBACK_IMAGE when nothing matches', () => {
  assert.equal(
    getPostHeroImage({}),
    '/assets/blog-hero-insights-16x9.svg',
  );
});

// ---------- getShareDescription ----------

test('getShareDescription prefers summary over body, stripping HTML', () => {
  // stripHtml replaces each tag with a space (then collapses runs of whitespace),
  // so adjacent markup leaves a single space gap rather than zero-width seam.
  const result = getShareDescription({
    summary: 'Short <em>summary</em> here.',
    body: '<p>Longer body</p>',
  });
  assert.equal(result, 'Short summary here.');
});

test('getShareDescription falls back to body when summary is empty', () => {
  assert.equal(getShareDescription({ body: '<p>body text</p>' }), 'body text');
});

test('getShareDescription truncates a long summary or body at 220 chars with an ellipsis', () => {
  const longSummary = 'a'.repeat(500);
  const result = getShareDescription({ summary: longSummary });
  assert.equal(result.length, 221);
  assert.ok(result.endsWith('…'));
});

test('getShareDescription returns the canned default when both summary and body are empty', () => {
  const result = getShareDescription({});
  assert.ok(result.startsWith('Explore gematria research workflows'));
});

test('getShareDescription scrubs script blocks before truncating (no markup leakage)', () => {
  const result = getShareDescription({ summary: '<script>alert(1)</script>safe content' });
  assert.equal(result, 'safe content');
});

// ---------- buildShareHtml ----------

test('buildShareHtml emits the standard OG and Twitter meta-tag set with escaped values', () => {
  const html = buildShareHtml({
    slug: 'hello-world',
    title: 'Hello & <World>',
    summary: 'A summary.',
    publishedAt: '2025-01-15T12:34:56Z',
    heroImageUrl: '/assets/hero.png',
  });

  // Title in <title>, og:title, twitter:title — all XML-escaped.
  assert.ok(html.includes('<title>Hello &amp; &lt;World&gt; | Gematria.Today Blog</title>'));
  assert.ok(html.includes('property="og:title" content="Hello &amp; &lt;World&gt;"'));
  assert.ok(html.includes('name="twitter:title" content="Hello &amp; &lt;World&gt;"'));

  // Canonical and og:url point at /blog/<slug>
  assert.ok(html.includes('rel="canonical" href="https://gematria.today/blog/hello-world"'));
  assert.ok(html.includes('property="og:url" content="https://gematria.today/blog/hello-world"'));

  // og:image uses the absolutized hero PNG (non-SVG, no rewrite).
  assert.ok(html.includes('property="og:image" content="https://gematria.today/assets/hero.png"'));

  // article:published_time normalizes the timestamp through new Date().toISOString().
  assert.ok(html.includes('property="article:published_time" content="2025-01-15T12:34:56.000Z"'));

  // Twitter card type is "summary_large_image".
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));

  // Meta-refresh redirect to /blog.html?post=<slug>#<slug>
  assert.ok(html.includes('http-equiv="refresh" content="0;url=https://gematria.today/blog.html?post=hello-world#hello-world"'));
});

test('buildShareHtml URL-encodes the slug in canonical and app URLs', () => {
  const html = buildShareHtml({ slug: 'hello world & friends', title: 't' });
  assert.ok(html.includes('/blog/hello%20world%20%26%20friends'));
  assert.ok(html.includes('post=hello%20world%20%26%20friends'));
});

test('buildShareHtml pipes SVG hero images through the Netlify image transform', () => {
  const html = buildShareHtml({
    slug: 's',
    title: 't',
    heroImageUrl: '/assets/hero.svg',
  });
  assert.ok(html.includes('/.netlify/images?'));
  assert.ok(html.includes('w=1200'));
  assert.ok(html.includes('fm=jpg'));
});

test('buildShareHtml emits a safe inline script that uses JSON.stringify for the redirect URL', () => {
  // Title contains a quote — must not break out of the meta tags or script.
  const html = buildShareHtml({ slug: 's', title: 'a"b' });
  // Inside <script>, the URL is wrapped via JSON.stringify, so backslashes/quotes are escaped.
  assert.ok(html.includes('window.location.replace('));
  // Title is escaped inside the <meta> tags.
  assert.ok(html.includes('a&quot;b'));
});

test('buildShareHtml uses a default title when post has no title', () => {
  const html = buildShareHtml({ slug: 's' });
  assert.ok(html.includes('<title>Gematria.Today Blog | Gematria.Today Blog</title>'));
});

// ---------- buildGoneHtml ----------

test('buildGoneHtml emits a noindex/nofollow page with the post title escaped', () => {
  const html = buildGoneHtml({ title: 'Removed & <gone>' });
  assert.ok(html.includes('<title>Post no longer available | Gematria.Today Blog</title>'));
  assert.ok(html.includes('name="robots" content="noindex, nofollow"'));
  assert.ok(html.includes('<h1>Removed &amp; &lt;gone&gt;</h1>'));
  assert.ok(html.includes('<a href="/blog.html">'));
});

test('buildGoneHtml uses a sensible default title when post has no title', () => {
  const html = buildGoneHtml({});
  assert.ok(html.includes('<h1>Post no longer available</h1>'));
});

// ---------- extractPostSlug ----------

// netlify.toml rewrites /blog/:slug to this v1 function. A v1 event has
// path/rawUrl/queryStringParameters but no pathParameters, so reading only
// pathParameters sent every permalink, RSS link and share link to the index.
function v1Event(pathAndQuery, overrides = {}) {
  const url = new URL(pathAndQuery, 'https://gematria.today');
  return {
    httpMethod: 'GET',
    path: url.pathname,
    rawUrl: url.href,
    rawQuery: url.search.slice(1),
    queryStringParameters: Object.fromEntries(url.searchParams),
    multiValueQueryStringParameters: {},
    headers: {},
    multiValueHeaders: {},
    body: null,
    isBase64Encoded: false,
    ...overrides,
  };
}

test('extractPostSlug reads the slug from a /blog/<slug> v1 event path', () => {
  assert.equal(extractPostSlug(v1Event('/blog/digital-roots-in-gematria')), 'digital-roots-in-gematria');
  assert.equal(extractPostSlug(v1Event('/blog/digital-roots-in-gematria/')), 'digital-roots-in-gematria');
  assert.equal(extractPostSlug(v1Event('/blog/Digital-Roots-In-Gematria')), 'digital-roots-in-gematria');
});

test('extractPostSlug accepts the rewritten function path and rawUrl', () => {
  assert.equal(
    extractPostSlug(v1Event('/.netlify/functions/blog-post-share/digital-roots-in-gematria')),
    'digital-roots-in-gematria',
  );
  assert.equal(
    extractPostSlug({ rawUrl: 'https://gematria.today/blog/digital-roots-in-gematria?post=x' }),
    'digital-roots-in-gematria',
  );
});

test('extractPostSlug decodes percent-encoded slugs and tolerates malformed escapes', () => {
  assert.equal(extractPostSlug(v1Event('/blog/hello%20world')), 'hello world');
  assert.equal(extractPostSlug({ path: '/blog/100%zz' }), '100%zz');
});

test('extractPostSlug prefers the path and falls back to ?post=', () => {
  // Share links are /blog/<slug>?post=<slug>; the path wins when both exist.
  assert.equal(extractPostSlug(v1Event('/blog/from-path?post=from-query')), 'from-path');
  assert.equal(extractPostSlug(v1Event('/.netlify/functions/blog-post-share?post=From-Query')), 'from-query');
});

test('extractPostSlug returns "" when there is no slug', () => {
  assert.equal(extractPostSlug(v1Event('/blog/')), '');
  assert.equal(extractPostSlug(v1Event('/blog.html')), '');
  assert.equal(extractPostSlug(v1Event('/.netlify/functions/blog-post-share')), '');
  assert.equal(extractPostSlug(v1Event('/blog/a/b')), '');
  assert.equal(extractPostSlug({}), '');
  assert.equal(extractPostSlug(undefined), '');
});

// ---------- handler ----------

// Stand-in for Neon's HTTP endpoint so the real handler runs end to end. Every
// statement gets an empty result except the post lookup, which returns `post`
// when the looked-up slug matches it.
async function withFakeDatabase(post, run) {
  const priorFetch = globalThis.fetch;
  const priorUrl = process.env.DATABASE_URL;
  const lookups = [];
  const answer = (query) => {
    if (!/WHERE LOWER\(COALESCE\(slug/.test(query.query)) return { fields: [], rows: [] };
    lookups.push(query.params);
    if (!post || query.params[0] !== post.slug) return { fields: [], rows: [] };
    const names = Object.keys(post);
    return {
      fields: names.map((name) => ({ name, dataTypeID: 25 })),
      rows: [names.map((name) => post[name])],
    };
  };
  process.env.DATABASE_URL = 'postgres://user:pass@db.example.test/neondb';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const payload = Array.isArray(body.queries) ? { results: body.queries.map(answer) } : answer(body);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    return { response: await run(), lookups };
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = priorUrl;
    }
  }
}

const PUBLISHED_POST = {
  slug: 'digital-roots-in-gematria',
  title: 'Digital Roots in Gematria',
  summary: 'How digital roots work.',
  status: 'published',
  published_at: '2025-01-15T12:34:56Z',
};

test('handler serves the share page for a /blog/<slug> permalink (real v1 event shape)', async () => {
  const { response, lookups } = await withFakeDatabase(PUBLISHED_POST, () =>
    handler(v1Event('/blog/digital-roots-in-gematria?post=digital-roots-in-gematria')),
  );
  assert.deepEqual(lookups, [['digital-roots-in-gematria']]);
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('rel="canonical" href="https://gematria.today/blog/digital-roots-in-gematria"'));
  assert.ok(response.body.includes('<title>Digital Roots in Gematria | Gematria.Today Blog</title>'));
});

test('handler looks up the slug from a plain /blog/<slug> path with no query', async () => {
  const { response, lookups } = await withFakeDatabase(PUBLISHED_POST, () =>
    handler(v1Event('/blog/Digital-Roots-In-Gematria')),
  );
  assert.deepEqual(lookups, [['digital-roots-in-gematria']]);
  assert.equal(response.statusCode, 200);
});

test('handler redirects an unknown slug to the blog index after looking it up', async () => {
  const { response, lookups } = await withFakeDatabase(PUBLISHED_POST, () =>
    handler(v1Event('/blog/no-such-post')),
  );
  assert.deepEqual(lookups, [['no-such-post']]);
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/blog.html');
});

test('handler redirects to the blog index without a database lookup when no slug is present', async () => {
  const { response, lookups } = await withFakeDatabase(PUBLISHED_POST, () =>
    handler(v1Event('/.netlify/functions/blog-post-share')),
  );
  assert.deepEqual(lookups, []);
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/blog.html');
});
