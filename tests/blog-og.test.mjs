import test from 'node:test';
import assert from 'node:assert/strict';

// blog-og is a TypeScript edge function. Node can import it once it strips
// types itself (22.18+); an older Node skips these tests rather than failing
// to parse the file.
const skip = process.features?.typescript ? false : 'needs a Node.js that strips TypeScript types (22.18+)';

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Gematria.Today Blog</title>
    <meta name="description" content="Blog index description" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="https://gematria.today/blog.html" />
    <meta property="og:title" content="Gematria.Today Blog" />
  </head>
  <body></body>
</html>`;

const POST = {
  slug: 'digital-roots-in-gematria',
  title: 'Digital Roots in Gematria',
  summary: 'How digital roots work.',
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

// Runs the edge function for a blog.html?post= request with the posts API
// answering through `api`, and returns the response plus every URL fetched.
async function runEdge(postParam, api) {
  const { default: blogOg } = await import('../netlify/edge-functions/blog-og.ts');
  const priorFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return api(String(url));
  };
  const context = {
    next: async () => new Response(PAGE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } }),
  };
  try {
    const request = new Request(`https://gematria.today/blog.html?post=${encodeURIComponent(postParam)}`);
    const response = await blogOg(request, context);
    return { response, html: await response.text(), fetched };
  } finally {
    globalThis.fetch = priorFetch;
  }
}

test('blog-og asks the posts API for the one post by slug, not the whole archive', { skip }, async () => {
  const { fetched } = await runEdge(POST.slug, () => jsonResponse({ items: [POST] }));
  assert.deepEqual(fetched, ['https://gematria.today/api/public-posts?slug=digital-roots-in-gematria']);
});

test('blog-og fills in the post meta tags when the post is found, matching the slug case-insensitively', { skip }, async () => {
  const { response, html } = await runEdge('Digital-Roots-In-Gematria', () => jsonResponse({ items: [POST] }));
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.ok(html.includes('<title>Digital Roots in Gematria</title>'));
  assert.ok(html.includes('name="description" content="How digital roots work."'));
  assert.ok(html.includes('name="robots" content="index, follow, max-image-preview:large"'));
});

test('blog-og noindexes the page only when the API answers and has no such post', { skip }, async () => {
  const { response, html } = await runEdge('no-such-post', () => jsonResponse({ items: [] }));
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  assert.ok(html.includes('name="robots" content="noindex, follow, max-image-preview:large"'));
});

for (const [label, api] of [
  ['is rate limited (429)', () => jsonResponse({ error: 'Too many requests for published posts.' }, 429)],
  ['fails (500)', () => jsonResponse({ error: 'Failed to load posts' }, 500)],
  ['cannot be reached', () => { throw new TypeError('fetch failed'); }],
  ['answers with something other than a post list', () => jsonResponse({ error: 'unexpected' })],
]) {
  test(`blog-og serves a real post's page unchanged and indexable when the posts API ${label}`, { skip }, async () => {
    const { response, html } = await runEdge(POST.slug, api);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.equal(html, PAGE_HTML);
  });
}

test('blog-og puts the post body into the page in place of the loading placeholder', { skip }, async () => {
  const { default: blogOg } = await import('../netlify/edge-functions/blog-og.ts');
  const page = PAGE_HTML.replace('<body></body>', '<body><div id="blogPosts"><article class="blog-post-card p-4 p-lg-5 news-placeholder-panel"><p>Loading</p></article></div></body>');
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ items: [{ ...POST, renderedBodyHtml: '<p>Roots reduce <a href="/calculator.html">totals</a>.</p>' }] });
  try {
    const response = await blogOg(new Request(`https://gematria.today/blog.html?post=${POST.slug}`), {
      next: async () => new Response(page, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } }),
    });
    const html = await response.text();
    assert.ok(!html.includes('news-placeholder-panel'));
    assert.ok(html.includes('<h1 class="blog-post-title h2 mb-3">Digital Roots in Gematria</h1>'));
    assert.ok(html.includes('<p>Roots reduce <a href="/calculator.html">totals</a>.</p>'));
  } finally {
    globalThis.fetch = priorFetch;
  }
});

// Edge functions run before netlify.toml's redirects, so context.next() for
// blog.html?post=x is the 301 to /blog/x. It has to leave as a 301.
test('blog-og passes a redirect from netlify.toml through untouched', { skip }, async () => {
  const { default: blogOg } = await import('../netlify/edge-functions/blog-og.ts');
  const priorFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; return jsonResponse({ items: [POST] }); };
  try {
    const redirect = new Response('Redirecting to /blog/digital-roots-in-gematria', {
      status: 301,
      headers: { location: '/blog/digital-roots-in-gematria' },
    });
    const response = await blogOg(
      new Request('https://gematria.today/blog.html?post=digital-roots-in-gematria'),
      { next: async () => redirect }
    );
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), '/blog/digital-roots-in-gematria');
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test('blog-og drops a leftover ?post= from a post address, keeping ?preview=', { skip }, async () => {
  const { default: blogOg } = await import('../netlify/edge-functions/blog-og.ts');
  const response = await blogOg(
    new Request('https://gematria.today/blog/digital-roots-in-gematria?post=digital-roots-in-gematria&preview=1'),
    { next: async () => { throw new Error('should not render'); } }
  );
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://gematria.today/blog/digital-roots-in-gematria?preview=1');
});
