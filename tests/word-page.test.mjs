import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { parseRoute, renderWordPage, renderValuePage, isBaseRootValue, escapeHtml } from '../netlify/functions/word-page.mjs';
import { buildWordsSitemap, escapeXml } from '../netlify/functions/sitemap-words-xml.mjs';

test('parseRoute recognises word and value routes', () => {
  assert.deepEqual(parseRoute('/w/light'), { kind: 'word', key: 'light' });
  assert.deepEqual(parseRoute('/v/336'), { kind: 'value', key: '336' });
  assert.deepEqual(parseRoute('/w/as%20above'), { kind: 'word', key: 'as above' });
  assert.equal(parseRoute('/v/notanumber'), null);
  assert.equal(parseRoute('/calculator.html'), null);
  assert.equal(parseRoute('/w/'), null);
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

test('words sitemap lists value and word URLs as valid XML', () => {
  const xml = buildWordsSitemap(['light', 'a&b'], [6, 336]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<loc>https:\/\/gematria\.today\/v\/6<\/loc>/);
  assert.match(xml, /<loc>https:\/\/gematria\.today\/w\/light<\/loc>/);
  assert.ok(!xml.includes('<loc>https://gematria.today/w/a&b</loc>'), 'ampersands must be encoded');
  assert.equal(escapeXml('a&b'), 'a&amp;b');
});

test('netlify.toml routes /w/, /v/ and the words sitemap', async () => {
  const toml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(toml, /from = "\/w\/:word"/);
  assert.match(toml, /from = "\/v\/:value"/);
  assert.match(toml, /from = "\/sitemap-words\.xml"/);

  // These must precede the generated per-page block, or a future page named
  // "w" or "v" could shadow them.
  assert.ok(toml.indexOf('from = "/w/:word"') < toml.indexOf('# BEGIN generated page redirects'));
});
