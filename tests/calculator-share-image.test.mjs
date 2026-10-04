import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeWordValues,
  drawNameImage,
  drawWordImage,
  escapeXml,
  getPerLetterValuesLabel,
  wrapSvgText,
} from '../netlify/functions/calculator-share-image.mjs';
import { digitalRoot, englishGematria, isBaseRootValue } from '../netlify/functions/englishGematria.mjs';

// ---------- escapeXml ----------

test('escapeXml escapes all five XML entities', () => {
  assert.equal(
    escapeXml(`a & b < c > d " e ' f`),
    'a &amp; b &lt; c &gt; d &quot; e &apos; f',
  );
});

test('escapeXml coerces non-string input', () => {
  assert.equal(escapeXml(42), '42');
});

// ---------- wrapSvgText ----------

test('wrapSvgText returns an empty array for empty/whitespace input', () => {
  assert.deepEqual(wrapSvgText(''), []);
  assert.deepEqual(wrapSvgText('   '), []);
  assert.deepEqual(wrapSvgText(null), []);
});

test('wrapSvgText keeps short text on a single line', () => {
  assert.deepEqual(wrapSvgText('Hello world', 60, 3), ['Hello world']);
});

test('wrapSvgText breaks on word boundaries when a line would exceed the cap', () => {
  const lines = wrapSvgText('the quick brown fox', 10, 3);
  // Every line must be at most 10 characters.
  for (const line of lines) {
    assert.ok(line.length <= 10, `line "${line}" exceeded 10 chars`);
  }
  // No word is split across lines.
  for (const line of lines) {
    for (const word of line.split(' ')) {
      assert.ok(word.length <= 10);
    }
  }
  // The wrap produces multiple lines for input that doesn't fit on one.
  assert.ok(lines.length >= 2);
});

test('wrapSvgText caps the line count at maxLines', () => {
  const lines = wrapSvgText('one two three four five six seven eight nine ten', 5, 2);
  assert.equal(lines.length, 2);
});

test('wrapSvgText appends an ellipsis to the last line when output is truncated', () => {
  const longInput = 'one two three four five six seven eight nine ten';
  const lines = wrapSvgText(longInput, 8, 2);
  assert.equal(lines.length, 2);
  // When truncation happens the final line ends with the ellipsis character.
  assert.ok(lines[1].endsWith('…'), `expected ellipsis but got "${lines[1]}"`);
});

test('wrapSvgText does not append an ellipsis when all input fits within the cap', () => {
  const lines = wrapSvgText('Hello world', 60, 3);
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].endsWith('…'));
});

// ---------- drawWordImage (security-critical: escapes user input into SVG) ----------

function makeSearchParams(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  return search;
}

test('drawWordImage renders the standard text labels and the gematria values of the query', () => {
  const svg = drawWordImage(makeSearchParams({
    query: 'Hello',
    definitionPreview: 'A greeting.',
  }));
  assert.ok(svg.includes('English Gematria Lookup'));
  assert.ok(svg.includes('>Hello<') || svg.includes('Hello'));
  // H48 + E30 + L72 + L72 + O90
  assert.ok(svg.includes('Gematria: 312'));
  assert.ok(svg.includes('Digital Root: 6'));
  assert.ok(svg.includes('Base Rooted: No'));
  assert.ok(svg.includes('A greeting.'));
  assert.ok(svg.includes('H=48, E=30, L=72, L=72, O=90'));
});

test('drawWordImage ignores forged numbers on the query string', () => {
  // ?query=Obama&total=666 used to render a site-branded card claiming 666.
  const svg = drawWordImage(makeSearchParams({
    query: 'Obama',
    total: '666',
    digitalRoot: '9',
    isBaseRoot: 'true',
    perLetterValues: 'O=1, B=1, A=1, M=1, A=1',
  }));
  assert.ok(svg.includes('Gematria: 192'));
  assert.ok(svg.includes('Digital Root: 3'));
  assert.ok(svg.includes('Base Rooted: No'));
  assert.ok(svg.includes('O=90, B=12, A=6, M=78, A=6'));
  assert.ok(!svg.includes('666'));
  assert.ok(!svg.includes('O=1'));
});

test('drawWordImage falls back to placeholder values when params are missing', () => {
  const svg = drawWordImage(makeSearchParams());
  assert.ok(svg.includes('Lookup'));
  assert.ok(svg.includes('Gematria: ?'));
  assert.ok(svg.includes('Digital Root: ?'));
});

test('drawWordImage derives "Base Rooted" from the query, not from isBaseRoot', () => {
  // A = 6, and (6 - 6) % 54 === 0.
  assert.ok(drawWordImage(makeSearchParams({ query: 'A' })).includes('Base Rooted: Yes'));
  assert.ok(drawWordImage(makeSearchParams({ query: 'A', isBaseRoot: 'false' })).includes('Base Rooted: Yes'));
  assert.ok(drawWordImage(makeSearchParams({ query: 'Hello', isBaseRoot: 'true' })).includes('Base Rooted: No'));
  assert.ok(drawWordImage(makeSearchParams({ isBaseRoot: 'TRUE' })).includes('Base Rooted: No'));
});

test('computeWordValues matches the calculator endpoint for every field', () => {
  for (const word of ['Hello', 'Jesus Christ', "O'Brien-Smith", 'zz top', 'A']) {
    const total = Number(englishGematria(word));
    assert.deepEqual(computeWordValues(word), {
      total: String(total),
      digitalRoot: String(digitalRoot(total)),
      isBaseRoot: isBaseRootValue(total),
      perLetterValues: getPerLetterValuesLabel(word),
    });
  }
  assert.equal(computeWordValues('123').total, '?');
  assert.equal(getPerLetterValuesLabel('ab-c'), 'A=6, B=12, C=18');
  // The label reads letters the way the total does (NFKC, then A-Z only).
  assert.equal(computeWordValues('Straße').total, englishGematria('Straße'));
  assert.equal(getPerLetterValuesLabel('ﬁ ß'), 'F=36, I=54');
  assert.equal(computeWordValues('ＡＢ').total, '18');
});

test('drawWordImage escapes XML-significant characters in the query (no markup leak)', () => {
  // Security: a malicious query string must NOT inject SVG/XML markup.
  const svg = drawWordImage(makeSearchParams({
    query: '<script>alert(1)</script>',
  }));
  // The literal <script> must not appear; escaped form must.
  assert.ok(!svg.includes('<script>alert(1)</script>'));
  assert.ok(svg.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('drawWordImage never prints per-letter text taken from the query string', () => {
  const svg = drawWordImage(makeSearchParams({
    query: 'ab',
    perLetterValues: `A=6 & "B"=12 </text><rect/>`,
  }));
  assert.ok(!svg.includes('</text><rect/>'));
  assert.ok(svg.includes('Per-letter values: A=6, B=12'));
});

test('drawWordImage escapes the definition preview line by line', () => {
  const svg = drawWordImage(makeSearchParams({
    definitionPreview: 'A & B <special>',
  }));
  // The definition is wrapped before XML-escaping, so the entities show up
  // inside <text> elements rather than as raw markup.
  assert.ok(!svg.includes('A & B <special>'));
  assert.ok(svg.includes('A &amp; B &lt;special&gt;'));
});

// ---------- drawNameImage ----------

test('drawNameImage renders each name with its computed total and ignores totals=', () => {
  const svg = drawNameImage(makeSearchParams({
    name1: 'Alice', name2: 'Bob', name3: 'Carol',
    totals: '123, 456, 789',
  }));
  assert.ok(svg.includes('Alice: 180'));
  assert.ok(svg.includes('Bob: 114'));
  assert.ok(svg.includes('Carol: 294'));
  assert.ok(!svg.includes(': 456'));
});

test('drawNameImage joins the names with a middle dot for the subtitle', () => {
  const svg = drawNameImage(makeSearchParams({
    name1: 'Alice', name2: 'Bob',
  }));
  assert.ok(svg.includes('Alice • Bob'));
});

test('drawNameImage falls back to a friendly message when no names are supplied', () => {
  const svg = drawNameImage(makeSearchParams());
  assert.ok(svg.includes('Run a name search to generate comparison results.'));
  assert.ok(svg.includes('Name Results'));
});

test('drawNameImage caps the rendered names at three', () => {
  // Even if name4/name5 are present, only name1..name3 are read by the code.
  const svg = drawNameImage(makeSearchParams({
    name1: 'A', name2: 'B', name3: 'C', name4: 'D',
  }));
  assert.ok(svg.includes('A •'));
  assert.ok(svg.includes('B •'));
  assert.ok(svg.includes('C'));
  assert.ok(!svg.includes('D'));
});

test('drawNameImage uses "?" for a name with no letters to count', () => {
  const svg = drawNameImage(makeSearchParams({
    name1: 'A', name2: '42', totals: '111,222',
  }));
  assert.ok(svg.includes('A: 6'));
  assert.ok(svg.includes('42: ?'));
});

test('drawNameImage escapes XML-significant characters in names', () => {
  const svg = drawNameImage(makeSearchParams({
    name1: '<img src=x onerror=alert(1)>',
  }));
  assert.ok(!svg.includes('<img src=x onerror=alert(1)>'));
  assert.ok(svg.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
