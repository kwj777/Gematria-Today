import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { parseRoute, renderWordPage, renderValuePage, isBaseRootValue, escapeHtml } from '../netlify/functions/word-page.mjs';
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
  assert.deepEqual(pageLocs({ page: 2, values: [], words: ['light', 'a&b'] }), ['/w/light', '/w/a%26b']);

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
