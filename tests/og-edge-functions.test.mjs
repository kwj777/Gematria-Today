import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  digitalRoot,
  englishGematria,
  escapeAttr,
  getPerLetterValues,
  isBaseRootValue,
  replaceCanonical,
  replaceMetaContent,
  replaceTitle,
} from '../netlify/edge-functions/lib/og-meta.mjs';
import * as serverGematria from '../netlify/functions/englishGematria.mjs';

const EDGE_FUNCTIONS = ['calculator-og', 'name-calculator-og', 'blog-og'];

const PAGE = `<!doctype html><html><head>
<title>Calculator | Gematria.Today</title>
<meta name="description" content="Calculate gematria." />
<link rel="canonical" href="https://gematria.today/calculator.html" />
<meta property="og:title" content="Calculator" />
<meta property="og:image" content="https://gematria.today/assets/og/calculator-hero-constellation.png" />
<script src="/site-bundle.js"></script>
</head><body></body></html>`;

// String.prototype.replace expands these in a *string* replacement.
const DOLLAR_PATTERNS = ['$&', '$`', "$'", '$1', '$2', '$3', '$<x>'];

// ---------- $-pattern injection ----------

test('replaceMetaContent inserts $-patterns literally', () => {
  for (const pattern of DOLLAR_PATTERNS) {
    const value = `x ${pattern} data-x=INJECTED autofocus`;
    const html = replaceMetaContent(PAGE, 'meta[name="description"]', value);
    assert.ok(html.includes(`<meta name="description" content="${escapeAttr(value)}" />`), pattern);
    // The document must not have been copied into the attribute.
    assert.equal(html.split('<script').length, PAGE.split('<script').length, pattern);
    assert.equal(html.split('<meta').length, PAGE.split('<meta').length, pattern);
  }
});

test('replaceTitle and replaceCanonical insert $-patterns literally', () => {
  for (const pattern of DOLLAR_PATTERNS) {
    const titled = replaceTitle(PAGE, `Gematria lookup for "${pattern}"`);
    assert.ok(titled.includes(`<title>Gematria lookup for &quot;${escapeAttr(pattern)}&quot;</title>`), pattern);
    assert.equal(titled.split('<script').length, PAGE.split('<script').length, pattern);

    const canonical = replaceCanonical(PAGE, `https://gematria.today/blog.html?post=${pattern}`);
    assert.ok(canonical.includes(`href="https://gematria.today/blog.html?post=${escapeAttr(pattern)}"`), pattern);
  }
});

test('replaceMetaContent still escapes markup and leaves unknown selectors alone', () => {
  const html = replaceMetaContent(PAGE, 'meta[property="og:title"]', '"><script>alert(1)</script>');
  assert.ok(html.includes('content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
  assert.equal(replaceMetaContent(PAGE, 'link[rel="canonical"]', 'x'), PAGE);
});

// ---------- gematria parity ----------

test('the edge gematria helpers agree with the calculator endpoint', () => {
  // The lookalikes follow the server's NFKC rule: ß is not SS, a ligature is
  // its letters, a full-width letter is its ASCII form.
  for (const word of ['Obama', 'Hello', 'Jesus Christ', "O'Brien-Smith", 'zz top', 'A', '', '123', 'Straße', 'ﬁnance', 'José', 'ＧＥＭＡＴＲＩＡ']) {
    const total = englishGematria(word);
    assert.equal(total, Number(serverGematria.englishGematria(word)), word);
    assert.equal(digitalRoot(total), serverGematria.digitalRoot(total), word);
    assert.equal(isBaseRootValue(total), serverGematria.isBaseRootValue(total), word);
  }
  assert.equal(englishGematria('Obama'), 192);
  assert.deepEqual(getPerLetterValues('a-B'), [{ letter: 'A', value: 6 }, { letter: 'B', value: 12 }]);
});

// ---------- wiring in the TypeScript edge functions ----------

test('no edge function splices a value in through a replacement string', () => {
  for (const name of EDGE_FUNCTIONS) {
    const source = readFileSync(`netlify/edge-functions/${name}.ts`, 'utf8');
    assert.ok(source.includes("from './lib/og-meta.mjs'"), `${name} does not use the shared helpers`);
    assert.doesNotMatch(source, /\.replace\([^)]*`\$\d/, `${name} still uses a $n replacement string`);
    assert.doesNotMatch(source, /function (escapeAttr|replaceMetaContent)\b/, `${name} has its own copy of a shared helper`);
  }
});

test('the calculator and name OG functions no longer read numbers off the URL', () => {
  const calculator = readFileSync('netlify/edge-functions/calculator-og.ts', 'utf8');
  for (const param of ['total', 'digitalRoot', 'isBaseRoot', 'perLetterValues']) {
    assert.ok(!calculator.includes(`searchParams.get('${param}')`), `calculator-og reads ${param}`);
  }
  const names = readFileSync('netlify/edge-functions/name-calculator-og.ts', 'utf8');
  assert.ok(!names.includes("searchParams.get('totals')"), 'name-calculator-og reads totals');
});

// Node 22.18+ strips TypeScript types on import, so where it can, run the real
// handlers end to end. CI's Node 20 cannot load .ts; the source checks above
// still cover it there.
const canLoadTypeScript = Boolean(process.features?.typescript);

function fakeContext(html) {
  return { next: async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) };
}

test('calculator-og recomputes the numbers and keeps $-patterns literal', { skip: !canLoadTypeScript && 'needs Node with TypeScript type stripping' }, async () => {
  const { default: calculatorOg } = await import('../netlify/edge-functions/calculator-og.ts');
  const forged = new Request('https://gematria.today/calculator.html?query=Obama&total=666&digitalRoot=9&isBaseRoot=true');
  const html = await (await calculatorOg(forged, fakeContext(PAGE))).text();
  assert.ok(html.includes('<title>Gematria lookup for &quot;Obama&quot; (192) | Gematria.Today</title>'));
  assert.ok(!html.includes('666'));

  const injected = new Request(`https://gematria.today/calculator.html?query=${encodeURIComponent('$` $& data-x=INJECTED')}`);
  const out = await (await calculatorOg(injected, fakeContext(PAGE))).text();
  assert.equal(out.split('<script').length, PAGE.split('<script').length);
  assert.ok(out.includes('content="Lookup result: $` $&amp; data-x=INJECTED has base-6 English gematria'));
});

test('name-calculator-og recomputes totals and points og:image at a raster', { skip: !canLoadTypeScript && 'needs Node with TypeScript type stripping' }, async () => {
  const { default: nameCalculatorOg } = await import('../netlify/edge-functions/name-calculator-og.ts');
  const request = new Request('https://gematria.today/name-calculator.html?name1=Alice&name2=Bob&totals=666,777');
  const html = await (await nameCalculatorOg(request, fakeContext(PAGE))).text();
  assert.ok(html.includes('content="Compare gematria totals (180, 114) for Alice, Bob."'));
  assert.ok(!html.includes('666'));
  assert.match(html, /property="og:image" content="https:\/\/gematria\.today\/\.netlify\/images\?url=[^"]+&amp;w=1200&amp;fm=jpg"/);
});
