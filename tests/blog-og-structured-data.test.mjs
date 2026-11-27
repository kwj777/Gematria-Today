import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// blog-og.ts is an edge function (TypeScript for Deno). Node can import it only
// where type stripping is available, so the behavioural tests skip elsewhere;
// the source-level checks below always run.
const BLOG_PAGE = readFileSync(new URL('../src/blog.html', import.meta.url), 'utf8');
const EDGE_SOURCE = readFileSync(new URL('../netlify/edge-functions/blog-og.ts', import.meta.url), 'utf8');

let edge = null;
try {
  edge = await import('../netlify/edge-functions/blog-og.ts');
} catch {
  edge = null;
}
const skipWithoutTs = edge ? false : 'this Node cannot import TypeScript';

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html))) blocks.push(JSON.parse(match[1]));
  return blocks;
}

const POST = {
  slug: 'digital-roots-in-gematria',
  title: 'Digital Roots $& Totals',
  summary: 'How digital roots work.',
  heroImageUrl: '/assets/digital-roots.png',
  publishedAt: '2026-05-01T10:00:00.000Z',
  createdAt: '2026-04-30T09:00:00.000Z',
  updatedAt: '2026-06-02T12:00:00.000Z',
};

async function renderPostView(slug, posts = [POST], url = `https://gematria.today/blog.html?post=${encodeURIComponent(slug)}`) {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ items: posts }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  try {
    const request = new Request(url);
    const context = { next: async () => new Response(BLOG_PAGE, { headers: { 'content-type': 'text/html' } }) };
    const response = await edge.default(request, context);
    return response.text();
  } finally {
    globalThis.fetch = priorFetch;
  }
}

// ---------- source-level ----------

test('the blog page marks its index Article block so post views can replace it', () => {
  const blocks = BLOG_PAGE.match(/<script type="application\/ld\+json" id="blogArticleJsonLd">/g) || [];
  assert.equal(blocks.length, 1, 'expected exactly one id="blogArticleJsonLd" block in src/blog.html');
  assert.ok(EDGE_SOURCE.includes('id="blogArticleJsonLd"'), 'blog-og must look for the same block id');
});

test('the blog page publisher logo is a raster image', () => {
  for (const block of jsonLdBlocks(BLOG_PAGE)) {
    const logoUrl = block.publisher?.logo?.url;
    if (logoUrl) assert.doesNotMatch(logoUrl, /\.svg(?:$|[?#])/i, `publisher logo ${logoUrl} is an SVG`);
  }
});

// ---------- behaviour ----------

test('a post view replaces the index Article with the post\'s own BlogPosting', { skip: skipWithoutTs }, async () => {
  const html = await renderPostView(POST.slug);
  const blocks = jsonLdBlocks(html);
  const articles = blocks.filter((block) => /Article|BlogPosting/.test(String(block['@type'])));
  assert.equal(articles.length, 1, 'exactly one article node per page');
  const [article] = articles;
  assert.equal(article['@type'], 'BlogPosting');
  // '$&' would expand to the matched block if inserted as a replacement string.
  assert.equal(article.headline, 'Digital Roots $& Totals');
  assert.equal(article.description, 'How digital roots work.');
  assert.equal(article.datePublished, '2026-05-01T10:00:00.000Z');
  assert.equal(article.dateModified, '2026-06-02T12:00:00.000Z');
  assert.deepEqual(article.mainEntityOfPage, {
    '@type': 'WebPage',
    '@id': 'https://gematria.today/blog/digital-roots-in-gematria',
  });
  assert.deepEqual(article.image, ['https://gematria.today/assets/digital-roots.png']);
  assert.doesNotMatch(article.publisher.logo.url, /\.svg/i);
  // None of the index page's static values survive.
  assert.ok(!html.includes('Gematria insights, calculator walkthroughs, and methodology notes"'));
  assert.ok(!html.includes('"datePublished": "2026-03-28"'));
});

test('a post view declares /blog/<slug> canonical, as the sitemap lists it', { skip: skipWithoutTs }, async () => {
  const html = await renderPostView(POST.slug);
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)[1];
  assert.equal(canonical, 'https://gematria.today/blog/digital-roots-in-gematria');
});

test('a post served at /blog/<slug> is filled in from the path, with one h1', { skip: skipWithoutTs }, async () => {
  const html = await renderPostView(POST.slug, [{ ...POST, renderedBodyHtml: '<p>Body text.</p>' }], 'https://gematria.today/blog/digital-roots-in-gematria');
  assert.equal(html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)[1], 'https://gematria.today/blog/digital-roots-in-gematria');
  assert.match(html, /<title[^>]*>Digital Roots /);
  assert.ok(html.includes('<p>Body text.</p>'));
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'the hero headline is demoted on a post view');
  assert.match(html, /<p id="heroHeadlinePrimary"/);
});

test('slugFromUrl reads the path first and ?post= as a fallback', { skip: skipWithoutTs }, () => {
  assert.equal(edge.slugFromUrl(new URL('https://gematria.today/blog/a-b')), 'a-b');
  assert.equal(edge.slugFromUrl(new URL('https://gematria.today/blog/a-b/')), 'a-b');
  assert.equal(edge.slugFromUrl(new URL('https://gematria.today/blog/a%20b?post=zzz')), 'a b');
  assert.equal(edge.slugFromUrl(new URL('https://gematria.today/blog.html?post=c')), 'c');
  assert.equal(edge.slugFromUrl(new URL('https://gematria.today/blog.html')), '');
});

test('the edge function runs on /blog/<slug> as well as blog.html', () => {
  assert.match(EDGE_SOURCE, /path: \['\/blog\.html', '\/blog\/\*'\]/);
});

test('the JSON-LD cannot be closed early by a post title', { skip: skipWithoutTs }, async () => {
  const html = await renderPostView('x', [{ ...POST, slug: 'x', title: '</script><script>alert(1)</script>' }]);
  const block = html.match(/<script type="application\/ld\+json" id="blogArticleJsonLd">([\s\S]*?)<\/script>/)[1];
  assert.ok(!block.includes('</script'));
  assert.equal(JSON.parse(block).headline, '</script><script>alert(1)</script>');
});

test('dates fall back to createdAt and omit unparseable values', { skip: skipWithoutTs }, () => {
  const options = { canonicalUrl: 'https://gematria.today/blog.html?post=x', imageUrl: '', siteOrigin: 'https://gematria.today' };
  const fromCreated = edge.buildPostArticleJsonLd({ title: 't', createdAt: '2026-01-01T00:00:00Z' }, options);
  assert.equal(fromCreated.datePublished, '2026-01-01T00:00:00.000Z');
  assert.equal(fromCreated.dateModified, '2026-01-01T00:00:00.000Z');
  assert.equal(fromCreated.image, undefined);
  const undated = edge.buildPostArticleJsonLd({ title: 't', publishedAt: 'soon' }, options);
  assert.equal(undated.datePublished, undefined);
  assert.equal(undated.dateModified, undefined);
});
