import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInternalLinkTargets,
  handler,
  linkifyHtmlContent,
  postsCacheHeaders,
} from '../netlify/functions/public-posts.mjs';

// Walks the markup and fails on an anchor opened inside another anchor or
// markup inside an attribute value, the two shapes the auto-linker produced.
function assertWellFormedAnchors(html) {
  assert.doesNotMatch(html, /="[^"]*</, `markup inside an attribute value: ${html}`);
  let depth = 0;
  for (const [tag] of html.matchAll(/<\/?a\b[^>]*>/g)) {
    depth += tag.startsWith('</') ? -1 : 1;
    assert.ok(depth >= 0 && depth <= 1, `nested or unbalanced anchors: ${html}`);
  }
  assert.equal(depth, 0, `unclosed anchor: ${html}`);
}

function anchors(html) {
  return [...html.matchAll(/<a class="news-inline-link" href="([^"]*)">([^<]*)<\/a>/g)].map(([, href, text]) => ({ href, text }));
}

// ---------- linkifyHtmlContent ----------

test('linkifyHtmlContent links "gematria calculator" once, without an anchor inside its href', () => {
  const html = linkifyHtmlContent('<p>Try the gematria calculator today.</p>', buildInternalLinkTargets([], ''));
  assertWellFormedAnchors(html);
  assert.equal(html, '<p>Try the <a class="news-inline-link" href="/calculator.html">gematria calculator</a> today.</p>');
});

test('linkifyHtmlContent keeps every phrase in a text node intact when several targets match it', () => {
  const html = linkifyHtmlContent(
    '<p>Open the name calculator, then the Word/Phrase Calculator, then the gematria guide.</p>',
    buildInternalLinkTargets([], ''),
  );
  assertWellFormedAnchors(html);
  assert.deepEqual(anchors(html), [
    { href: '/name-calculator.html', text: 'name calculator' },
    { href: '/calculator.html', text: 'Word/Phrase Calculator' },
    { href: '/gematria-guide.html', text: 'gematria guide' },
  ]);
  assert.equal(html.replace(/<[^>]+>/g, ''), 'Open the name calculator, then the Word/Phrase Calculator, then the gematria guide.');
});

test('linkifyHtmlContent still links a shorter target where it stands on its own after a longer match', () => {
  const html = linkifyHtmlContent(
    '<p>The gematria calculator is the main calculator for names.</p>',
    buildInternalLinkTargets([], ''),
  );
  assertWellFormedAnchors(html);
  assert.deepEqual(anchors(html), [
    { href: '/calculator.html', text: 'gematria calculator' },
    { href: '/calculator.html', text: 'calculator' },
    { href: '/name-calculator.html', text: 'names' },
  ]);
});

test('linkifyHtmlContent links each target once across the post and skips existing links and code', () => {
  const html = linkifyHtmlContent(
    '<p>See the <a href="/x">calculator</a> and <code>calculator</code>.</p><p>A calculator here. Another calculator there.</p>',
    [{ phrase: 'calculator', href: '/calculator.html' }],
  );
  assertWellFormedAnchors(html);
  assert.equal(
    html,
    '<p>See the <a href="/x">calculator</a> and <code>calculator</code>.</p><p>A <a class="news-inline-link" href="/calculator.html">calculator</a> here. Another calculator there.</p>',
  );
});

test('linkifyHtmlContent links other posts by title without breaking the static targets', () => {
  const targets = buildInternalLinkTargets(
    [{ slug: 'calculator-tips', title: 'Calculator tips for names' }],
    'current-post',
  );
  const html = linkifyHtmlContent('<p>Read Calculator tips for names before the gematria calculator.</p>', targets);
  assertWellFormedAnchors(html);
  assert.deepEqual(anchors(html), [
    { href: '/blog/calculator-tips', text: 'Calculator tips for names' },
    { href: '/calculator.html', text: 'gematria calculator' },
  ]);
});

// ---------- postsCacheHeaders ----------

test('postsCacheHeaders keeps preview answers out of shared caches', () => {
  assert.deepEqual(postsCacheHeaders({ previewRequested: true }), {
    'cache-control': 'private, no-store',
    'netlify-cdn-cache-control': 'no-store',
    vary: 'Cookie',
  });
  assert.deepEqual(postsCacheHeaders({ previewRequested: false }), {
    'cache-control': 'public, max-age=120, stale-while-revalidate=60',
  });
});

// ---------- handler ----------

const PAST = '2025-01-15T09:00:00.000Z';
const FUTURE = '2999-01-01T09:00:00.000Z';
const ADMIN_TOKEN = 'admin-session-token';

function postRow(overrides = {}) {
  return {
    id: 'post-1',
    title: 'Digital Roots in Gematria',
    slug: 'digital-roots-in-gematria',
    tag: 'Method',
    summary: 'How digital roots work.',
    body: '<p>Use the gematria calculator to check.</p>',
    read_time: '5 minute read',
    status: 'published',
    published_at: '2025-01-10T12:00:00.000Z',
    scheduled_publish_at: null,
    created_at: '2025-01-01T12:00:00.000Z',
    updated_at: '2025-01-10T12:00:00.000Z',
    ...overrides,
  };
}

// Stand-in for Neon's HTTP endpoint so the real handler runs end to end. It
// keeps the posts table, applies the scheduled-post promotion the way Postgres
// would, and returns the posts table for the list/detail SELECT.
async function withFakeDatabase({ posts = [] } = {}, run) {
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
      return result(table);
    }
    if (/FROM sessions\s+JOIN users/.test(query)) {
      return result([{ id: 'admin', username: 'admin', role: 'admin', is_admin: 'true', expires_at: FUTURE }]);
    }
    if (/DELETE FROM function_response_cache/.test(query)) {
      statements.push('clear-cache');
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
    return { response: await run(), statements, table };
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = priorUrl;
    }
  }
}

function getEvent(query = {}, headers = {}) {
  return { httpMethod: 'GET', headers, queryStringParameters: query };
}

test('handler sends list items without article bodies', async () => {
  const { response } = await withFakeDatabase({ posts: [postRow(), postRow({ id: 'post-2', slug: 'second-post', title: 'Second post title here' })] }, () =>
    handler(getEvent({ limit: '12', offset: '0' })),
  );
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.items.length, 2);
  for (const item of payload.items) {
    assert.equal(item.title.length > 0, true);
    assert.equal(item.summary, 'How digital roots work.');
    assert.equal('renderedBodyHtml' in item, false);
    assert.equal('body' in item, false);
  }
});

test('handler sends the linkified body for a single post', async () => {
  const { response } = await withFakeDatabase({ posts: [postRow()] }, () =>
    handler(getEvent({ slug: 'digital-roots-in-gematria' })),
  );
  assert.equal(response.statusCode, 200);
  const [item] = JSON.parse(response.body).items;
  assert.equal(item.body, '<p>Use the gematria calculator to check.</p>');
  assert.equal(item.renderedBodyHtml, '<p>Use the <a class="news-inline-link" href="/calculator.html">gematria calculator</a> to check.</p>');
});

test('handler caches the public list publicly', async () => {
  const { response } = await withFakeDatabase({ posts: [postRow()] }, () =>
    handler(getEvent({ limit: '12', offset: '0' })),
  );
  assert.equal(response.headers['cache-control'], 'public, max-age=120, stale-while-revalidate=60');
  assert.equal(response.headers.vary, undefined);
});

test('handler never lets a shared cache keep a preview answer, for an admin or anyone else', async () => {
  const anonymous = await withFakeDatabase({ posts: [postRow()] }, () =>
    handler(getEvent({ limit: '12', offset: '0', preview: 'true' })),
  );
  const admin = await withFakeDatabase({ posts: [postRow(), postRow({ id: 'draft-1', slug: 'draft-post', status: 'draft' })] }, () =>
    handler(getEvent({ limit: '12', offset: '0', preview: 'true' }, { cookie: `gematria_admin_session=${ADMIN_TOKEN}` })),
  );
  assert.equal(JSON.parse(anonymous.response.body).previewMode, false);
  assert.equal(JSON.parse(admin.response.body).previewMode, true);
  for (const { response } of [anonymous, admin]) {
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(response.headers['netlify-cdn-cache-control'], 'no-store');
    assert.equal(response.headers.vary, 'Cookie');
  }
});

test('handler promotes a due scheduled post before reading, so it is listed as published from its scheduled time', async () => {
  const scheduled = postRow({
    id: 'scheduled-1',
    slug: 'scheduled-post',
    status: 'draft',
    published_at: null,
    scheduled_publish_at: PAST,
  });
  const future = postRow({ id: 'future-1', slug: 'future-post', status: 'draft', published_at: null, scheduled_publish_at: FUTURE });
  const { response, statements, table } = await withFakeDatabase({ posts: [scheduled, future] }, () =>
    handler(getEvent({ limit: '12', offset: '0' })),
  );
  assert.deepEqual(statements, ['promote', 'clear-cache', 'select-posts']);
  assert.equal(table.find((post) => post.id === 'future-1').status, 'draft');
  const item = JSON.parse(response.body).items.find((entry) => entry.id === 'scheduled-1');
  assert.equal(item.status, 'published');
  assert.equal(item.publishedAt, PAST);
});

test('handler does not clear the response cache when nothing was due', async () => {
  const { statements } = await withFakeDatabase({ posts: [postRow()] }, () =>
    handler(getEvent({ limit: '12', offset: '0' })),
  );
  assert.deepEqual(statements, ['promote', 'select-posts']);
});
