import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { baseRows, installFakeNeon } from './helpers/fake-neon.mjs';
import wordnikDefinitionRoute, { safeDefinitionHref, sanitizeInlineHtml } from '../netlify/functions/wordnikDefinition.mjs';

// /definition?word=... renders Wordnik's definition text -- aggregated from
// third-party sources -- as markup on the site's own origin. The sanitizer kept
// anchors whole (any attribute, any href scheme), let every other `<a ...>`
// through untouched, and the page went out with no CSP.

const ENV_KEYS = ['DATABASE_URL', 'WORDNIK_BASE_URL', 'WORDNIK_URL_BASE', 'WORDNIK_API_KEY'];
const PRIOR_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const PRIOR_FETCH = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = PRIOR_FETCH;
});

test.after(() => {
  for (const [key, value] of Object.entries(PRIOR_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const HOSTILE = '<a onmouseover="alert(1)" style="position:fixed;inset:0">x</a> <a href="javascript:alert(2)">y</a>';

test('anchors are rebuilt: no event handlers, styles or script URLs survive', () => {
  const html = sanitizeInlineHtml(HOSTILE);
  assert.ok(!/onmouseover|style=|javascript:/i.test(html), html);
  assert.ok(!/<a\b/i.test(html), 'neither anchor had a safe href, so neither stays a link');
  assert.match(html, /x/);
  assert.match(html, /y/);
});

test('an http(s) link survives with only a fixed set of attributes', () => {
  const html = sanitizeInlineHtml('See <a href="https://en.wiktionary.org/wiki/light" target="_blank" onclick="x()" rel="opener">light</a>.');
  assert.equal(html, 'See <a href="https://en.wiktionary.org/wiki/light" target="_blank" rel="noopener noreferrer">light</a>.');
});

test('only absolute http(s) hrefs are kept', () => {
  assert.equal(safeDefinitionHref('href="https://example.com/a?b=1&amp;c=2"'), 'https://example.com/a?b=1&c=2');
  assert.equal(safeDefinitionHref('href=http://example.com/x=y'), 'http://example.com/x=y');
  for (const attributes of ['href="javascript:alert(1)"', "href=' JaVaScRiPt:alert(1)'", 'href="data:text/html,x"', 'href="/relative"', 'href="&#106;avascript:alert(1)"', 'title="x"', '']) {
    assert.equal(safeDefinitionHref(attributes), null, attributes);
  }
});

test('other markup is removed and the remaining text is escaped', () => {
  assert.equal(sanitizeInlineHtml('<img src=x onerror=alert(1)'), '&lt;img src=x onerror=alert(1)', 'an unclosed tag must not reach the page as markup');
  assert.equal(sanitizeInlineHtml('<xref>bar</xref> &amp; <em>baz</em>'), 'bar &amp; baz');
  assert.equal(sanitizeInlineHtml('a &lt;script&gt;b'), 'a &lt;script&gt;b');
  assert.equal(sanitizeInlineHtml('&#xE000;0&#xE000; x'), '&amp;#xE000;0&amp;#xE000; x', 'the text cannot forge a link slot');
});

function installWordnik(definitions) {
  process.env.WORDNIK_BASE_URL = 'https://api.wordnik.test/v4/word.json/';
  process.env.WORDNIK_API_KEY = 'test-key';
  return installFakeNeon((query) => baseRows(query) ?? [], {
    otherFetch: async () => Response.json(definitions),
  });
}

test('the definition page carries the site CSP and no inline script', async () => {
  installWordnik([{ text: HOSTILE, partOfSpeech: 'noun' }]);
  const response = await wordnikDefinitionRoute(new Request('https://gematria.today/definition?word=light&returnTo=%2Fcalculator.html', {
    headers: { accept: 'text/html', 'x-forwarded-for': '203.0.113.13' },
  }));
  assert.equal(response.status, 200);
  const csp = response.headers.get('content-security-policy') || '';
  assert.match(csp, /script-src 'self'/);
  assert.ok(!csp.match(/script-src[^;]*/)[0].includes('unsafe-inline'), 'scripts must not be allowed inline');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');

  const html = await response.text();
  for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/g)) {
    assert.match(attributes, /\bsrc=/, 'every script is external, or the CSP blocks it');
  }
  assert.match(html, /<script defer src="\/page-scripts\/wordnik-definition-1\.js"><\/script>/);
  assert.match(html, /data-return-path="\/calculator\.html"/);
  assert.ok(!/onmouseover|javascript:/i.test(html));
});

test('an error page carries the CSP too', async () => {
  const response = await wordnikDefinitionRoute(new Request('https://gematria.today/definition', { headers: { accept: 'text/html' } }));
  assert.equal(response.status, 400);
  assert.ok(response.headers.get('content-security-policy'));
});

test('the definition page script reads its paths from data attributes', () => {
  const source = readFileSync(new URL('../page-scripts/wordnik-definition-1.js', import.meta.url), 'utf8');
  assert.match(source, /document\.body\.dataset/);
  assert.match(source, /history\.replaceState\(\{\}, '', canonicalPath\)/);
  assert.match(source, /window\.location\.assign\(returnPath \|\| '\/'\)/);
});
