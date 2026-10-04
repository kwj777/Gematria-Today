import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import onRequest, { cacheControlForStatus, parseRoute, renderWordPage, renderValuePage, isBaseRootValue, isIndexableWord, letterBreakdown, escapeHtml } from '../netlify/functions/word-page.mjs';
import { buildSitemapIndex, buildUrlSet, pageLocs, escapeXml } from '../netlify/functions/sitemap-words-xml.mjs';

test('parseRoute reads the original request path', () => {
  // Netlify v2 functions receive the original URL, not the rewrite target, so
  // redirect-injected query params never arrive. Reading only the query made
  // /sitemap-words/2 fall through to index mode and return the index instead
  // of a urlset.
  assert.deepEqual(parseRoute('https://gematria.today/w/light'), { kind: 'word', key: 'light' });
  assert.deepEqual(parseRoute('https://gematria.today/v/336'), { kind: 'value', key: '336' });
  assert.deepEqual(parseRoute('https://gematria.today/w/as%20above'), { kind: 'word', key: 'as above' });
  assert.deepEqual(parseRoute('/w/light'), { kind: 'word', key: 'light' });
  assert.equal(parseRoute('https://gematria.today/v/abc'), null);
  assert.equal(parseRoute('https://gematria.today/calculator.html'), null);
});

test('parseRoute still accepts the rewrite query as a fallback', () => {
  // The rewrite passes these as query params. A path suffix is not reliable
  // after a rewrite, and /w/ and /v/ would arrive indistinguishable.
  assert.deepEqual(parseRoute(new URLSearchParams('kind=word&key=light')), { kind: 'word', key: 'light' });
  assert.deepEqual(parseRoute(new URLSearchParams('kind=value&key=336')), { kind: 'value', key: '336' });
  assert.deepEqual(parseRoute(new URLSearchParams('kind=word&key=as above')), { kind: 'word', key: 'as above' });
  assert.equal(parseRoute(new URLSearchParams('kind=value&key=notanumber')), null);
  assert.equal(parseRoute(new URLSearchParams('kind=word&key=')), null);
  assert.equal(parseRoute(new URLSearchParams('')), null);
});

test('the word and value routes stay distinguishable through the rewrite', async () => {
  const toml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  // Both routes previously rewrote to the same function path, so the function
  // could not tell a word request from a value request.
  assert.match(toml, /to = "\/\.netlify\/functions\/word-page\?kind=word&key=:word"/);
  assert.match(toml, /to = "\/\.netlify\/functions\/word-page\?kind=value&key=:value"/);
});

test('functions read the computed value from withCachedJson payload', async () => {
  // withCachedJson returns { statusCode, payload, cached }. Reading .value
  // silently produced empty pages and an empty sitemap.
  for (const file of ['word-page.mjs', 'sitemap-words-xml.mjs']) {
    const source = await fs.readFile(new URL(`../netlify/functions/${file}`, import.meta.url), 'utf8');
    assert.ok(!/cached\.value/.test(source), `${file} should read cached.payload, not cached.value`);
    assert.match(source, /cached\.payload/);
  }
});

test('word pages carry the SEO tags that make them indexable', () => {
  const html = renderWordPage('light', 336, [{ word: 'light' }, { word: 'truth' }]);
  assert.match(html, /<title>light in English Gematria = 336 \| Gematria\.Today<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/gematria\.today\/w\/light"/);
  assert.match(html, /name="description"/);
  assert.match(html, /name="robots" content="index,follow"/);
  assert.match(html, /<h1[^>]*>light<\/h1>/);
});

test('word and value pages cross-link so the set is crawlable', () => {
  const wordPage = renderWordPage('light', 336, [{ word: 'light' }, { word: 'truth' }]);
  assert.match(wordPage, /href="\/v\/336"/, 'word page should link to its value page');
  assert.match(wordPage, /href="\/w\/truth"/, 'word page should link to sibling words');

  const valuePage = renderValuePage(336, [{ word: 'light' }, { word: 'truth' }]);
  assert.match(valuePage, /href="\/w\/light"/, 'value page should link to each word');
});

test('rendered pages escape word content', () => {
  const html = renderWordPage('<script>alert(1)</script>', 6, [{ word: '<img onerror=x>' }]);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img onerror=x>'));
  assert.match(html, /&lt;script&gt;/);
  assert.equal(escapeHtml('a&b"c'), 'a&amp;b&quot;c');
});

test('base-root detection matches the site definition', () => {
  assert.equal(isBaseRootValue(6), true);
  assert.equal(isBaseRootValue(60), true);
  assert.equal(isBaseRootValue(336), false);
});

test('the words sitemap is an index over fixed-size chunks', () => {
  // A single sitemap over 30k+ words sorted every row and cached a
  // multi-megabyte payload in one request, which returned 502.
  const index = buildSitemapIndex(3);
  assert.match(index, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(index, /<sitemapindex/);
  assert.match(index, /<loc>https:\/\/gematria\.today\/sitemap-words\/1<\/loc>/);
  assert.match(index, /<loc>https:\/\/gematria\.today\/sitemap-words\/3<\/loc>/);
  assert.match(buildSitemapIndex(0), /sitemap-words\/1/, 'must always list at least one chunk');
});

test('sitemap chunks emit value pages first, then words, correctly encoded', () => {
  assert.deepEqual(pageLocs({ page: 1, values: [6, 336], words: [] }), ['/v/6', '/v/336']);
  // 'a&b' is not the shape of a word, so it is not published at all.
  assert.deepEqual(pageLocs({ page: 2, values: [], words: ['light', 'A per se', 'a&b'] }), ['/w/light', '/w/A%20per%20se']);

  const xml = buildUrlSet(['/w/light', '/w/a%26b']);
  assert.match(xml, /<urlset/);
  assert.match(xml, /<loc>https:\/\/gematria\.today\/w\/light<\/loc>/);
  assert.ok(!xml.includes('/w/a&b<'), 'ampersands must not appear raw');
  assert.equal(escapeXml('a&b'), 'a&amp;b');
});

test('netlify.toml routes /w/, /v/ and the words sitemap', async () => {
  const toml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(toml, /from = "\/w\/:word"/);
  assert.match(toml, /from = "\/v\/:value"/);
  assert.match(toml, /from = "\/sitemap-words\.xml"/);
  assert.match(toml, /from = "\/sitemap-words\/:page"/);

  // These must precede the generated per-page block, or a future page named
  // "w" or "v" could shadow them.
  assert.ok(toml.indexOf('from = "/w/:word"') < toml.indexOf('# BEGIN generated page redirects'));
});

test('every export-default function returns a Response, not a {statusCode} object', async () => {
  // Netlify v2 functions (export default) must return a Response. Returning
  // { statusCode, headers, body } crashes at runtime with
  // "NetlifyUserError - Function returned an unsupported value" -- which is a
  // 500 the deploy is otherwise happy about, so nothing catches it before
  // users do.
  const dir = new URL('../netlify/functions/', import.meta.url);
  const files = (await fs.readdir(dir)).filter((name) => name.endsWith('.mjs') && !name.startsWith('_'));

  const offenders = [];
  for (const name of files) {
    const source = await fs.readFile(new URL(name, dir), 'utf8');
    if (!/export default async/.test(source)) continue;

    // Look only at the v2 entry point, not any legacy `handler` export below it.
    const v2 = source.slice(source.indexOf('export default async'));
    const end = v2.indexOf('\nexport async function handler');
    const body = end === -1 ? v2 : v2.slice(0, end);

    if (/return\s*\{\s*\n?\s*statusCode/.test(body) || /return\s+jsonResponse\(/.test(body)) {
      offenders.push(name);
    }
  }

  assert.deepEqual(offenders, [], `these export-default functions return a non-Response value: ${offenders.join(', ')}`);
});

test('the words sitemap reads its page number from the path', async () => {
  // /sitemap-words/2 previously returned the sitemap index, because the page
  // number was only ever read from a query parameter the runtime never passed.
  const source = await fs.readFile(new URL('../netlify/functions/sitemap-words-xml.mjs', import.meta.url), 'utf8');
  assert.match(source, /pathname\.match\(/, 'page number must come from the request path');
  assert.match(source, /sitemap-words\\\/\(\\d\+\)/);
});

test('calculator results link out to the indexable word and value pages', async () => {
  // Without these the generated pages are reachable only from the sitemap.
  const source = await fs.readFile(new URL('../page-scripts/calculator-1.js', import.meta.url), 'utf8');
  assert.match(source, /createWordPermalink/);
  assert.match(source, /createValuePermalink/);
  assert.match(source, /`\/w\/\$\{encodeURIComponent/);
  assert.match(source, /`\/v\/\$\{encodeURIComponent/);
});

test('junk rows from the words table are not offered to search engines', () => {
  // Real entries observed in /sitemap-words/2 before filtering.
  const junk = ['*', '0', '45', '276', '-ol', '2 5 0 62 4', '<er>annoy</er>', '', '   '];
  for (const value of junk) {
    assert.equal(isIndexableWord(value), false, `${JSON.stringify(value)} should not be indexable`);
  }
});

test('real words, including phrases and punctuation, stay indexable', () => {
  const real = ['light', 'A per se', 'A-one', 'Abyssinian cat', 'Academy Award', 'ALGOL', "O'Brien"];
  for (const value of real) {
    assert.equal(isIndexableWord(value), true, `${JSON.stringify(value)} should be indexable`);
  }
});

test('word pages 404 for junk instead of serving a thin page', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/word-page.mjs', import.meta.url), 'utf8');
  assert.match(source, /!isIndexableWord\(route\.key\)/);
  const sitemap = await fs.readFile(new URL('../netlify/functions/sitemap-words-xml.mjs', import.meta.url), 'utf8');
  // Publishing is stricter than indexing: it also excludes slurs and rows with
  // no search history.
  assert.match(sitemap, /filter\(isPublishableWord\)|filter\(isPublishableRow\)/);
});

test('unverified accounts outlive their verification link', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/_member.mjs', import.meta.url), 'utf8');

  // Both were 24 hours, so the link expired exactly when the account was
  // deleted and member-resend-verification had nothing left to act on.
  assert.match(source, /EMAIL_VERIFICATION_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /UNVERIFIED_RETENTION = '30 days'/);
  assert.ok(!/INTERVAL '24 hours'/.test(source), 'no 24-hour prune windows should remain');
});

test('a stale cached payload still cannot leak junk into the sitemap', () => {
  // The filter used to run only inside the compute step, so entries cached
  // before it existed kept being served for the six-hour TTL. Filtering at the
  // output boundary makes the cache irrelevant to correctness.
  const stale = ['*', '-ol', '0', '2 5 0 62 4', '276', '45', '<er>annoy</er>', 'A per se', 'ALGOL'];
  const locs = pageLocs({ page: 2, values: [], words: stale });

  assert.deepEqual(locs, ['/w/A%20per%20se', '/w/ALGOL']);

  const xml = buildUrlSet(locs);
  for (const junk of ['/w/*', '/w/0', '/w/276', '/w/45', '/w/-ol', '%3Cer%3E']) {
    assert.ok(!xml.includes(junk), `${junk} must not appear in the sitemap`);
  }
});

test('the sitemap cache key is versioned so filtering changes take effect at once', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/sitemap-words-xml.mjs', import.meta.url), 'utf8');
  assert.match(source, /const CACHE_VERSION = \d+/);
  assert.match(source, /v: CACHE_VERSION/);
});

test('storage is never looser than rendering or publishing', async () => {
  // Storage, rendering and the sitemap must agree, or the table refills with
  // entries the sitemap then has to filter out again. Storage is now the
  // strictest of the three: anything stored renders, and publishes unless it
  // is a blocked word; anything published is something storage would accept.
  const { isIndexableWord: shared, isStorableWord, isPublishableWord } = await import('../netlify/functions/_words.mjs');
  assert.equal(shared, isIndexableWord, 'word-page must re-export the shared rule');
  const samples = [
    'light', 'A per se', 'A-one', 'Abyssinian cat', 'ALGOL', "O'Brien", 'café', 'fag',
    '*', '0', '-ol', '2 5 0 62 4', '<er>annoy</er>', 'a 2 5 0 62 4', 'Catch-22',
    'Buy cheap pills at rxshop dot com', 'Call 555 0100 for loans', 'rxshop.com', '',
  ];
  for (const word of samples) {
    if (isStorableWord(word)) assert.equal(shared(word), true, `${JSON.stringify(word)} is storable but would not render`);
    if (isPublishableWord(word)) assert.equal(isStorableWord(word), true, `${JSON.stringify(word)} is published but storage would refuse it`);
  }

  const gematria = await fs.readFile(new URL('../netlify/functions/englishGematria.mjs', import.meta.url), 'utf8');
  assert.match(gematria, /from '\.\/_words\.mjs'/);
});

test('unstorable lookups are never inserted into the words table', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/englishGematria.mjs', import.meta.url), 'utf8');

  const storableGate = source.indexOf('const storable = isStorableWord(trimmedWord)');
  const insert = source.indexOf('INSERT INTO words');
  assert.ok(storableGate !== -1, 'storability must be checked');
  assert.ok(storableGate < insert, 'the check must come before the insert');

  // The early return must not contain an INSERT.
  const earlyReturn = source.slice(storableGate, insert);
  assert.ok(!/INSERT INTO words/.test(earlyReturn));
  assert.match(earlyReturn, /UPDATE words/, 'an existing row should still count the search');
});

test('the words audit reports before it deletes', async () => {
  const source = await fs.readFile(new URL('../scripts/audit-words-table.mjs', import.meta.url), 'utf8');
  assert.match(source, /--delete/);
  assert.match(source, /Report only/);
  assert.match(source, /isIndexableWord/, 'the audit must use the same rule as the sitemap');
});

test('generated pages render inside the real site chrome', () => {
  const html = renderWordPage('ALA', 84, [{ word: 'aid', search_count: 2 }]);

  // Without nav and footer these were chrome-less dead ends: a visitor arriving
  // from search had no branding and no route into the site.
  assert.match(html, /navbar navbar-expand-lg/, 'must include the site nav');
  assert.match(html, /site-footer/, 'must include the site footer');
  assert.match(html, /Open the calculator/, 'must offer a way back into the site');
  assert.match(html, /theme\.css/);
});

test('word pages show the letter breakdown that makes them non-thin', () => {
  assert.deepEqual(letterBreakdown('ALA'), [
    { letter: 'A', value: 6 },
    { letter: 'L', value: 72 },
    { letter: 'A', value: 6 },
  ]);
  assert.deepEqual(letterBreakdown('a-b'), [{ letter: 'A', value: 6 }, { letter: 'B', value: 12 }]);

  const html = renderWordPage('ALA', 84, []);
  assert.match(html, /letter-value-grid/);
  assert.match(html, /= <strong>84<\/strong>/);
});

test('slurs are never published, though the calculator still returns them', async () => {
  const { isPublishableWord, isIndexableWord: indexable } = await import('../netlify/functions/_words.mjs');

  assert.equal(isPublishableWord('fag'), false);
  assert.equal(isPublishableWord('Retard'), false);
  assert.equal(isPublishableWord('light'), true);

  // Storage and calculation are unaffected -- only publishing is gated.
  assert.equal(indexable('fag'), true);

  const html = renderWordPage('ALA', 84, [{ word: 'fag', search_count: 9 }, { word: 'aid', search_count: 1 }]);
  assert.ok(!/>fag</.test(html), 'a slur must not appear in a published list');
  assert.match(html, /\/w\/aid/);
});

test('one lookup is no longer enough to publish a word page', async () => {
  const { hasEnoughSearches, isPublishableWord, MIN_SEARCHES_FOR_INDEX } = await import('../netlify/functions/_words.mjs');

  // `search_count > 0` was the old rule and it did not hold: the site's own
  // word-of-the-day link ran a calculator lookup on every crawl of the home
  // page, which was enough to publish a page for whatever archaic word Wordnik
  // had picked that day.
  assert.ok(MIN_SEARCHES_FOR_INDEX > 1, 'a single lookup must not qualify a word');
  assert.equal(hasEnoughSearches({ search_count: 1 }), false);
  assert.equal(hasEnoughSearches({ search_count: MIN_SEARCHES_FOR_INDEX }), true);
  assert.equal(hasEnoughSearches({ search_count: 0 }), false, 'bulk-imported rows stay out');
  assert.equal(isPublishableWord('fag'), false, 'slurs stay out at any search count');

  // Pages still render for unsearched words; they just are not indexed.
  assert.match(renderWordPage('light', 336, [], { noindex: true }), /content="noindex,follow"/);
  assert.match(renderWordPage('light', 336, []), /content="index,follow"/);

  const sitemap = await fs.readFile(new URL('../netlify/functions/sitemap-words-xml.mjs', import.meta.url), 'utf8');
  assert.match(sitemap, /search_count >= \$\{MIN_SEARCHES_FOR_INDEX\}/);
  assert.ok(!/search_count > 0/.test(sitemap), 'the old one-lookup gate must be gone from the sitemap queries');
});

// --- Parity with the hand-authored pages (audit sprint 3) -------------------
// These pages are the site's cold-search entry point, so anything the real
// pages do for a first-time visitor they have to do too.

test('generated pages load Bootstrap JS so the nav actually works', () => {
  // site-bundle.js does not carry Bootstrap's Collapse/Dropdown plugins, so
  // without this the mobile hamburger and the Tools/Learn menus were inert --
  // on exactly the pages built to receive visitors who have never been here.
  const html = renderWordPage('light', 336, [{ word: 'light', search_count: 1 }]);
  assert.match(html, /assets\/vendor\/bootstrap\/js\/bootstrap\.bundle\.min\.js/);
  assert.match(html, /data-bs-toggle="collapse"/, 'the nav relies on Bootstrap behaviour');
});

test('generated pages pick up admin theme customisations', () => {
  const html = renderWordPage('light', 336, []);
  assert.match(html, /rel="preload" as="style" href="\/api\/public-theme-css"/);
  assert.match(html, /<noscript><link rel="stylesheet" href="\/api\/public-theme-css" \/><\/noscript>/);
});

test('mixed-case URLs canonicalise to one form instead of competing', () => {
  const words = [{ word: 'Light', search_count: 4 }];
  for (const requested of ['light', 'Light', 'LIGHT']) {
    assert.match(
      renderWordPage(requested, 336, words),
      /<link rel="canonical" href="https:\/\/gematria\.today\/w\/Light" \/>/,
      `${requested} must canonicalise to the stored casing`,
    );
  }
  // With no stored row to copy casing from, lowercase is the canonical form.
  assert.match(renderWordPage('LIGHT', 336, []), /canonical" href="https:\/\/gematria\.today\/w\/light"/);
});

test('the related-word list is styled and the cap has a way out', () => {
  // Letters only: a digit would make each one something the site no longer
  // publishes.
  const many = Array.from({ length: 260 }, (_, i) => ({
    word: `word${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`,
    search_count: 1,
  }));
  const html = renderValuePage(336, many);
  assert.match(html, /<ul class="related-word-list">/);
  // The footer's own link stacks legitimately use site-footer-list, so only the
  // related list itself is checked for the borrowed styling.
  const listMarkup = html.match(/<ul class="[^"]*related-word-list[^"]*">/)[0];
  assert.ok(!/site-footer-list/.test(listMarkup), 'must not borrow the footer link-stack styling');
  assert.match(html, /Showing the first 200 of 260/);
  assert.match(html, /\/calculator\.html\?query=336/, 'the words past the cap need somewhere to go');
});

test('value pages count the words they actually list', () => {
  // 'fag' is filtered from the list, so counting it in the lead produced
  // "3 words share this value" above a list of two.
  const html = renderValuePage(84, [
    { word: 'aid', search_count: 1 },
    { word: 'fag', search_count: 9 },
    { word: 'ala', search_count: 2 },
  ]);
  assert.match(html, /2 words share this value/);
  assert.match(html, /^.*2 words? in the Gematria\.Today database/m);
  assert.ok(!/3 words/.test(html));
});

test('an empty value page does not talk about "other" words', () => {
  const html = renderValuePage(336, []);
  assert.ok(!/No other words/.test(html), 'a value page has no "current" word to be other than');
  assert.match(html, /No words in the database have this value yet/);
});

test('generated pages carry breadcrumb structured data like the real pages', () => {
  const html = renderWordPage('light', 336, [{ word: 'light', search_count: 1 }]);
  const match = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n {4}<\/script>/);
  assert.ok(match, 'must emit JSON-LD');
  const data = JSON.parse(match[1]);
  assert.equal(data['@type'], 'BreadcrumbList');
  assert.deepEqual(data.itemListElement.map((entry) => entry.name), ['Home', 'Calculator', 'light']);
  assert.deepEqual(data.itemListElement.map((entry) => entry.position), [1, 2, 3]);
});

test('JSON-LD cannot be broken out of by a hostile word', () => {
  const html = renderWordPage('</script><script>alert(1)</script>', 6, []);
  assert.ok(!/<\/script><script>alert/.test(html), 'the payload must not close the JSON-LD block');
  assert.match(html, /\\u003c/, 'angle brackets are escaped inside JSON-LD');
});

test('shared links get an image card and mobile bookmarks get an icon', () => {
  const html = renderWordPage('light', 336, []);
  // Rasterized through the image CDN like every other share surface on the
  // site -- an SVG og:image renders as nothing on every social platform.
  assert.match(html, /property="og:image" content="https:\/\/gematria\.today\/\.netlify\/images\?url=[^"]+&amp;w=1200&amp;fm=jpg"/);
  assert.doesNotMatch(html, /property="og:image" content="[^"]*\.svg"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /name="theme-color"/);
});

test('the call to action prefills the calculator with the word', () => {
  // The calculator reads ?query=; ?word= was silently ignored, so every CTA
  // opened an empty calculator.
  const html = renderWordPage('light', 336, []);
  assert.match(html, /\/calculator\.html\?query=light/);
  assert.ok(!/calculator\.html\?word=/.test(html));
});

test('only a real page is cached publicly for long', () => {
  // A 429 is one visitor's rate limit and a 5xx a passing outage; cached
  // publicly for 10 minutes plus a day of stale, either kept the word broken
  // long after recovery and could serve one person's 429 to a whole proxy.
  assert.equal(cacheControlForStatus(200), 'public, max-age=600, stale-while-revalidate=86400');
  assert.equal(cacheControlForStatus(404), 'public, max-age=60');
  for (const status of [429, 500, 502, 503]) {
    assert.equal(cacheControlForStatus(status), 'no-store', `status ${status}`);
  }
});

test('a word page that fails to build is not cached', async () => {
  const prior = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const response = await onRequest(new Request('https://gematria.today/w/light'));
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    if (prior !== undefined) process.env.DATABASE_URL = prior;
  }
});

test('the generated footer tagline matches the built tools pages', async () => {
  const built = await fs.readFile(new URL('../_site/calculator.html', import.meta.url), 'utf8').catch(() => '');
  const html = renderWordPage('light', 336, []);
  assert.match(html, /research tools and calculators\./);
  assert.ok(!/a suite of research tools\./.test(html), 'that is the home page tagline');
  if (built) {
    assert.match(built, /research tools and calculators\./, 'built tools pages should still use this tagline');
  }
});
