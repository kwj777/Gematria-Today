import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  buildRobotsTxt,
  BASE_ALLOWS,
  BASE_DISALLOWS,
  DATABASE_TIME_BUDGET_MS,
  handler,
} from '../netlify/functions/robots-txt.mjs';
import { DEFAULT_SITE_MODULES, DEFAULT_SITE_ORIGIN } from '../netlify/functions/_site-modules.mjs';

const ALL_MODULES_ON = {
  blog: true, membership: true, gemabot: true, knowbot: true, forum: true,
};

const ALL_MODULES_OFF = {
  blog: false, membership: false, gemabot: false, knowbot: false, forum: false,
};

test('buildRobotsTxt opens with User-agent: * and Allow: /', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(txt.startsWith('User-agent: *\nAllow: /\n'));
});

test('buildRobotsTxt always emits every base Disallow line', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  for (const path of BASE_DISALLOWS) {
    assert.ok(
      txt.includes(`Disallow: ${path}`),
      `expected robots.txt to include Disallow: ${path}`,
    );
  }
});

test('buildRobotsTxt emits every base Allow line ahead of the Disallow lines', () => {
  // Longest match decides for Google and Bing; first match decides for simpler
  // parsers, so the Allow exceptions go first either way.
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  const firstDisallow = txt.indexOf('Disallow:');
  for (const path of BASE_ALLOWS) {
    const index = txt.indexOf(`Allow: ${path}\n`);
    assert.ok(index !== -1, `expected robots.txt to include Allow: ${path}`);
    assert.ok(index < firstDisallow, `Allow: ${path} must precede the Disallow lines`);
  }
});

test('buildRobotsTxt appends Disallow lines for disabled modules', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  assert.ok(txt.includes('Disallow: /blog.html'));
  assert.ok(txt.includes('Disallow: /blog.xml'));
  assert.ok(txt.includes('Disallow: /blog/'));
  assert.ok(txt.includes('Disallow: /member.html'));
  assert.ok(txt.includes('Disallow: /ai-agent.html'));
  assert.ok(txt.includes('Disallow: /searchbot.html'));
  assert.ok(txt.includes('Disallow: /forum.html'));
});

test('buildRobotsTxt omits module Disallow lines when modules are enabled', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(!txt.includes('Disallow: /blog.html'));
  assert.ok(!txt.includes('Disallow: /member.html'));
  assert.ok(!txt.includes('Disallow: /ai-agent.html'));
  assert.ok(!txt.includes('Disallow: /searchbot.html'));
  assert.ok(!txt.includes('Disallow: /forum.html'));
});

test('buildRobotsTxt deduplicates overlapping base and module Disallow paths', () => {
  const txt = buildRobotsTxt({
    siteOrigin: 'https://example.com',
    // Inject a duplicate by enabling membership=false (so /member.html appears)
    // and check no path appears twice across the file.
    modules: ALL_MODULES_OFF,
  });
  const lines = txt.split('\n').filter((line) => line.startsWith('Disallow:'));
  const unique = new Set(lines);
  assert.equal(lines.length, unique.size);
});

test('buildRobotsTxt emits a Sitemap line referencing the provided origin', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(txt.includes('\nSitemap: https://example.com/sitemap.xml\n'));
});

test('buildRobotsTxt selectively disallows only the modules that are disabled', () => {
  const txt = buildRobotsTxt({
    siteOrigin: 'https://example.com',
    modules: { ...ALL_MODULES_ON, forum: false },
  });
  assert.ok(txt.includes('Disallow: /forum.html'));
  assert.ok(!txt.includes('Disallow: /blog.html'));
  assert.ok(!txt.includes('Disallow: /member.html'));
});

test('buildRobotsTxt ends with a trailing newline', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(txt.endsWith('\n'));
});

test('the static robots.txt advertises the words sitemap', async () => {
  // /robots.txt is served by the function (the rewrite is forced), but the
  // static file is its mirror and the fallback reference. Both must list the
  // words sitemap or the generated pages go undiscovered.
  const staticRobots = await fs.readFile(new URL('../robots.txt', import.meta.url), 'utf8');
  assert.match(staticRobots, /Sitemap: https:\/\/gematria\.today\/sitemap-words\.xml/);
});

test('the static robots.txt is exactly what the function serves with default modules', async () => {
  const staticRobots = await fs.readFile(new URL('../robots.txt', import.meta.url), 'utf8');
  assert.equal(
    buildRobotsTxt({ siteOrigin: DEFAULT_SITE_ORIGIN, modules: DEFAULT_SITE_MODULES }),
    staticRobots,
  );
});

// Google and Bing pick the longest matching rule; on a tie, Allow wins.
function isCrawlable(robots, path) {
  let best = { length: -1, allow: true };
  for (const line of robots.split('\n')) {
    const match = line.match(/^(Allow|Disallow):\s*(\S*)\s*$/);
    if (!match || !match[2] || !path.startsWith(match[2])) continue;
    const allow = match[1] === 'Allow';
    if (match[2].length > best.length || (match[2].length === best.length && allow)) {
      best = { length: match[2].length, allow };
    }
  }
  return best.allow;
}

const robotsSources = async () => [
  ['static robots.txt', await fs.readFile(new URL('../robots.txt', import.meta.url), 'utf8')],
  ['generated robots.txt', buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON })],
];

test('robots.txt lets crawlers fetch the public APIs that pages render from', async () => {
  // Google's renderer does not fetch what robots.txt blocks, fetch/XHR
  // included. Under a bare Disallow: /api/ a blog post rendered as the six
  // fallback posts, the FAQ as an error, and every page lost its theme CSS.
  for (const [label, robots] of await robotsSources()) {
    for (const path of [
      '/api/public-posts?slug=a-post',
      '/api/public-faqs',
      '/api/public-theme-css',
      '/api/public-badge?user=alice',
    ]) {
      assert.ok(isCrawlable(robots, path), `${label} must allow ${path}`);
    }
    for (const path of ['/api/member-session', '/api/admin-settings', '/.netlify/functions/admin-session', '/admin.html']) {
      assert.ok(!isCrawlable(robots, path), `${label} must still block ${path}`);
    }
  }
});

test('noindex pages stay crawlable so the noindex can be read', async () => {
  // A Disallow stops Google fetching the page, so it never sees the noindex;
  // linked from indexable pages, the bare URL can be indexed anyway.
  for (const page of ['account-recovery', 'premium-research']) {
    const html = await fs.readFile(new URL(`../src/${page}.html`, import.meta.url), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex[^"]*" \/>/, `${page}.html must carry noindex`);
    for (const [label, robots] of await robotsSources()) {
      assert.ok(isCrawlable(robots, `/${page}.html`), `${label} must not block /${page}.html`);
      assert.ok(isCrawlable(robots, `/${page}`), `${label} must not block /${page}`);
    }
  }
});

test('share-card images are served from a crawlable path', async () => {
  // X and LinkedIn honour robots.txt for card images. The name calculator used
  // to point og:image straight at /.netlify/functions/, which is disallowed.
  for (const [label, robots] of await robotsSources()) {
    assert.ok(!isCrawlable(robots, '/.netlify/functions/calculator-share-image'), `${label} blocks functions`);
    assert.ok(isCrawlable(robots, '/.netlify/images?url=x'), `${label} must allow the image CDN`);
  }

  const source = await fs.readFile(new URL('../netlify/edge-functions/name-calculator-og.ts', import.meta.url), 'utf8');
  assert.match(source, /\$\{SITE_ORIGIN\}\/\.netlify\/images\?url=\$\{encoded\}/);
  assert.match(source, /replaceMetaContent\(html, 'meta\[property="og:image"\]', shareImageUrl\)/);
  assert.match(source, /replaceMetaContent\(html, 'meta\[name="twitter:image"\]', shareImageUrl\)/);
  assert.match(source, /const shareImageUrl = toShareImageUrl\(imageUrl\.toString\(\)\)/);
});

test('netlify.toml forces /robots.txt and /sitemap.xml through their functions', async () => {
  // The static files are copied into _site, and a non-forced rewrite loses to a
  // file at the same path -- so the module-aware functions never ran.
  const toml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  for (const [from, to] of [['/robots.txt', 'robots-txt'], ['/sitemap.xml', 'sitemap-xml']]) {
    const rule = toml
      .split('[[redirects]]')
      .map((block) => block.split(/\n\s*\n/)[0])
      .find((block) => block.includes(`from = "${from}"`));
    assert.ok(rule, `missing redirect for ${from}`);
    assert.match(rule, new RegExp(`to = "/\\.netlify/functions/${to}"`));
    assert.match(rule, /force = true/, `${from} must be forced`);
  }
});

// public_site_url is the email link base from the admin email panel. With
// the rewrite forced this function is the live robots.txt, and an old domain
// or another host stored there must not become the advertised sitemap host.
test('handler advertises the sitemaps on the canonical origin whatever public_site_url holds', async () => {
  const priorFetch = globalThis.fetch;
  const priorUrl = process.env.DATABASE_URL;
  const answer = ({ query }) => (/FROM admin_settings/.test(query) && /'public_site_url'/.test(query)
    ? {
      fields: [{ name: 'setting_key', dataTypeID: 25 }, { name: 'setting_value', dataTypeID: 25 }],
      rows: [['public_site_url', 'https://endtimes.today'], ['site_modules', JSON.stringify({ forum: false })]],
    }
    : { fields: [], rows: [] });
  process.env.DATABASE_URL = 'postgres://user:pass@db.example.test/neondb';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const payload = Array.isArray(body.queries) ? { results: body.queries.map(answer) } : answer(body);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await handler({ httpMethod: 'GET', path: '/robots.txt', headers: {} });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-cache-status'], 'miss', 'the database settings were read');
    assert.equal(
      response.body,
      buildRobotsTxt({ siteOrigin: DEFAULT_SITE_ORIGIN, modules: { ...DEFAULT_SITE_MODULES, forum: false } }),
    );
    assert.ok(!response.body.includes('endtimes.today'));
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorUrl;
  }
});

test('robots.txt is never a 5xx: without a database it serves the defaults', async () => {
  // Google treats a 5xx robots.txt as "disallow everything".
  const prior = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const response = await handler({ httpMethod: 'GET' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, buildRobotsTxt({ siteOrigin: DEFAULT_SITE_ORIGIN, modules: DEFAULT_SITE_MODULES }));
    assert.match(response.headers['content-type'], /^text\/plain/);
  } finally {
    if (prior !== undefined) process.env.DATABASE_URL = prior;
  }
});

test('robots.txt falls back to the defaults when the database is slower than the time budget', async () => {
  // On a fresh instance a slow database must not hold the response until the
  // platform's own timeout turns it into a 5xx.
  const priorFetch = globalThis.fetch;
  const priorUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://user:pass@db.example.test/neondb';
  globalThis.fetch = () => new Promise(() => {});
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = handler({ httpMethod: 'GET', headers: {} });
    mock.timers.tick(DATABASE_TIME_BUDGET_MS);
    const response = await pending;
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'public, max-age=60');
    assert.equal(response.body, buildRobotsTxt({ siteOrigin: DEFAULT_SITE_ORIGIN, modules: DEFAULT_SITE_MODULES }));
  } finally {
    mock.timers.reset();
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorUrl;
  }
});
