import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBlogPostPaths,
  buildSitemapXml,
  escapeXml,
  handler,
  STATIC_PATHS,
} from '../netlify/functions/sitemap-xml.mjs';

const ALL_MODULES_ON = {
  blog: true, membership: true, gemabot: true, knowbot: true, forum: true,
};

const ALL_MODULES_OFF = {
  blog: false, membership: false, gemabot: false, knowbot: false, forum: false,
};

test('escapeXml escapes the five required XML entities', () => {
  assert.equal(
    escapeXml(`& < > " '`),
    '&amp; &lt; &gt; &quot; &apos;',
  );
});

test('escapeXml coerces non-string input via String() and applies default for undefined', () => {
  assert.equal(escapeXml(42), '42');
  assert.equal(escapeXml(undefined), '');
});

test('buildSitemapXml emits a valid xml declaration and urlset wrapper', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.trim().endsWith('</urlset>'));
});

test('buildSitemapXml includes every STATIC_PATH', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  for (const path of STATIC_PATHS) {
    const expectedLoc = path === '/' ? 'https://example.com/' : `https://example.com${path}`;
    assert.ok(
      xml.includes(`<loc>${expectedLoc}</loc>`),
      `expected sitemap to include <loc>${expectedLoc}</loc>`,
    );
  }
});

test('buildSitemapXml includes module-driven paths when modules are enabled', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(xml.includes('<loc>https://example.com/blog.html</loc>'));
  assert.ok(xml.includes('<loc>https://example.com/member.html</loc>'));
  assert.ok(xml.includes('<loc>https://example.com/ai-agent.html</loc>'));
  assert.ok(xml.includes('<loc>https://example.com/searchbot.html</loc>'));
  assert.ok(xml.includes('<loc>https://example.com/forum.html</loc>'));
});

test('buildSitemapXml omits module-driven paths when modules are disabled', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  assert.ok(!xml.includes('/blog.html'));
  assert.ok(!xml.includes('/member.html'));
  assert.ok(!xml.includes('/ai-agent.html'));
  assert.ok(!xml.includes('/searchbot.html'));
  assert.ok(!xml.includes('/forum.html'));
});

test('buildSitemapXml deduplicates overlapping static and module paths', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  const blogMatches = xml.match(/<loc>https:\/\/example\.com\/blog\.html<\/loc>/g) || [];
  assert.equal(blogMatches.length, 1);
});

test('buildSitemapXml escapes XML special characters in the site origin', () => {
  const xml = buildSitemapXml({
    siteOrigin: 'https://example.com?evil=<script>',
    modules: ALL_MODULES_OFF,
  });
  assert.ok(!xml.includes('<script>'));
  assert.ok(xml.includes('&lt;script&gt;'));
});

test('buildSitemapXml renders root path as a single trailing slash', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  assert.ok(xml.includes('<loc>https://example.com/</loc>'));
});

// ---------- blog posts ----------

const POSTS = [
  { slug: 'digital-roots-in-gematria', lastModified: '2026-09-14T08:30:00Z' },
  { slug: 'hello world & friends', lastModified: new Date('2026-01-02T23:59:59Z') },
];

test('buildSitemapXml lists each post at its canonical blog.html?post= URL with a lastmod', () => {
  // Posts render client-side, so the sitemap is how a crawler finds them. The
  // URL must be the one every post page declares canonical.
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON, posts: POSTS });
  assert.ok(xml.includes(
    '<url>\n    <loc>https://example.com/blog.html?post=digital-roots-in-gematria</loc>\n    <lastmod>2026-09-14</lastmod>\n  </url>',
  ));
  assert.ok(xml.includes(
    '<loc>https://example.com/blog.html?post=hello%20world%20%26%20friends</loc>\n    <lastmod>2026-01-02</lastmod>',
  ));
  // The /blog/<slug> share stub only redirects, so it is never listed.
  assert.ok(!xml.includes('https://example.com/blog/'));
});

test('buildSitemapXml omits posts when the blog module is disabled', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF, posts: POSTS });
  assert.ok(!xml.includes('post='));
});

test('buildSitemapXml without posts renders only the page URLs', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(!xml.includes('post='));
  assert.ok(xml.trim().endsWith('</urlset>'));
});

test('buildBlogPostPaths skips blank and duplicate slugs and tolerates a missing date', () => {
  assert.deepEqual(
    buildBlogPostPaths([
      { slug: 'a', lastModified: null },
      { slug: '  ' },
      { slug: 'A', lastModified: '2026-01-01' },
      { slug: 'b', lastModified: 'not a date' },
    ]),
    [
      { path: '/blog.html?post=a', lastmod: '' },
      { path: '/blog.html?post=b', lastmod: '' },
    ],
  );
});

// Stand-in for Neon's HTTP endpoint so the real handler runs end to end: the
// sitemap's posts query gets `posts`, every other statement an empty result.
async function withFakeDatabase(posts, run) {
  const priorFetch = globalThis.fetch;
  const priorUrl = process.env.DATABASE_URL;
  const postQueries = [];
  const answer = (query) => {
    if (!/FROM posts/.test(query.query) || !/last_modified/.test(query.query)) {
      return { fields: [], rows: [] };
    }
    postQueries.push(query.query);
    return {
      fields: [{ name: 'slug', dataTypeID: 25 }, { name: 'last_modified', dataTypeID: 25 }],
      rows: posts.map((post) => [post.slug, post.last_modified]),
    };
  };
  process.env.DATABASE_URL = 'postgres://user:pass@db.example.test/neondb';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const payload = Array.isArray(body.queries) ? { results: body.queries.map(answer) } : answer(body);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    return { response: await run(), postQueries };
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = priorUrl;
    }
  }
}

test('handler adds the published posts from the database to the served sitemap', async () => {
  const { response, postQueries } = await withFakeDatabase(
    [{ slug: 'digital-roots-in-gematria', last_modified: '2026-09-14T08:30:00Z' }],
    () => handler({ httpMethod: 'GET', path: '/sitemap.xml', headers: {} }),
  );
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes(
    '<loc>https://gematria.today/blog.html?post=digital-roots-in-gematria</loc>\n    <lastmod>2026-09-14</lastmod>',
  ));
  // Only what the public blog serves: published (or blank) and due scheduled
  // posts, never ones the admin hid from the blog.
  assert.equal(postQueries.length, 1);
  assert.match(postQueries[0], /COALESCE\(NULLIF\(BTRIM\(status\), ''\), 'published'\) = 'published'/);
  assert.match(postQueries[0], /scheduled_publish_at <= NOW\(\)/);
  assert.match(postQueries[0], /COALESCE\(hide_from_blog, FALSE\) = FALSE/);
});
