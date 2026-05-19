import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSvg,
  escapeXml,
  normalizeSummaryLines,
  truncate,
} from '../netlify/functions/ai-agent-share-image.mjs';

// ---------- escapeXml ----------

test('escapeXml escapes all five XML entities', () => {
  assert.equal(escapeXml(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
});

// ---------- truncate ----------

test('truncate returns the original string when within the cap', () => {
  assert.equal(truncate('Hello', 10), 'Hello');
  assert.equal(truncate(''), '');
});

test('truncate appends a single-character ellipsis when over the cap', () => {
  const result = truncate('Hello world', 8);
  assert.equal(result.length, 8);
  assert.ok(result.endsWith('…'));
});

test('truncate honors the default max of 70 chars', () => {
  const result = truncate('a'.repeat(200));
  assert.equal(result.length, 70);
  assert.ok(result.endsWith('…'));
});

test('truncate coerces nullish input safely', () => {
  assert.equal(truncate(null), '');
  assert.equal(truncate(undefined), '');
});

// ---------- normalizeSummaryLines ----------

test('normalizeSummaryLines returns an empty array for empty/whitespace input', () => {
  assert.deepEqual(normalizeSummaryLines(''), []);
  assert.deepEqual(normalizeSummaryLines('   '), []);
});

test('normalizeSummaryLines collapses internal whitespace before wrapping', () => {
  // "a    b" with cap 4 should still split, not stay as a single 6-char line.
  const lines = normalizeSummaryLines('a    b   c', 3, 3);
  // The runs are collapsed to single spaces first, so the wrapper sees "a b c".
  assert.ok(lines.length >= 1);
  assert.ok(lines.every((line) => line.length <= 3));
});

test('normalizeSummaryLines keeps short text on a single line', () => {
  const lines = normalizeSummaryLines('Hello world', 3, 60);
  assert.deepEqual(lines, ['Hello world']);
});

test('normalizeSummaryLines caps the line count at maxLines', () => {
  const lines = normalizeSummaryLines('one two three four five six seven eight nine ten', 2, 5);
  assert.ok(lines.length <= 2);
});

test('normalizeSummaryLines appends an ellipsis when later words had to be dropped', () => {
  // Construct input where the second wrapped line is exactly maxLineLength chars
  // AND there are still words left over to drop — that's the precise condition
  // under which the truncation branch fires.
  const longInput = 'aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr ss';
  const lines = normalizeSummaryLines(longInput, 2, 20);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'), `expected ellipsis but got "${lines[1]}"`);
});

test('normalizeSummaryLines escapes XML-significant characters in each line', () => {
  // Critical security boundary: summary text from arbitrary URL params must not
  // inject SVG markup. The wrapper runs escapeXml() on every line before returning.
  const lines = normalizeSummaryLines('A & B < C > D', 3, 60);
  const combined = lines.join(' ');
  // Raw < or > must not survive (they would close the surrounding <text> element).
  assert.ok(!combined.includes('<'));
  assert.ok(!combined.includes('>'));
  // The entity-encoded forms must be present.
  assert.ok(combined.includes('&amp;'));
  assert.ok(combined.includes('&lt;'));
  assert.ok(combined.includes('&gt;'));
});

// ---------- buildSvg ----------

test('buildSvg emits a valid SVG document opening', () => {
  const svg = buildSvg({
    topic: 'Hello',
    total: '156',
    root: '3',
    summaryLines: [],
  });
  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.trim().endsWith('</svg>'));
});

test('buildSvg includes the topic, total, and digital root', () => {
  const svg = buildSvg({
    topic: 'Hello',
    total: '156',
    root: '3',
    summaryLines: [],
  });
  assert.ok(svg.includes('Hello'));
  assert.ok(svg.includes('Gematria: 156'));
  assert.ok(svg.includes('Digital Root: 3'));
});

test('buildSvg escapes XML-significant characters in topic/total/root', () => {
  // The handler is supposed to pass already-escaped summary lines, but topic /
  // total / root are escaped by buildSvg itself — pin that contract.
  const svg = buildSvg({
    topic: '<script>x</script>',
    total: 'a&b',
    root: '"3"',
    summaryLines: [],
  });
  assert.ok(!svg.includes('<script>x</script>'));
  assert.ok(svg.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(svg.includes('Gematria: a&amp;b'));
  assert.ok(svg.includes('Digital Root: &quot;3&quot;'));
});

test('buildSvg renders a placeholder summary line when summaryLines is empty', () => {
  const svg = buildSvg({
    topic: 't', total: '?', root: '?', summaryLines: [],
  });
  assert.ok(svg.includes('Generated from AI Agent lookup'));
});

test('buildSvg renders each provided summary line as its own <text> element', () => {
  const svg = buildSvg({
    topic: 't', total: '?', root: '?',
    // The handler passes already-XML-escaped strings, so feed pre-escaped here.
    summaryLines: ['line one', 'line two', 'line three'],
  });
  assert.ok(svg.includes('>line one<'));
  assert.ok(svg.includes('>line two<'));
  assert.ok(svg.includes('>line three<'));
});

test('buildSvg embeds the gematria.today brand watermark', () => {
  const svg = buildSvg({
    topic: 't', total: '?', root: '?', summaryLines: [],
  });
  assert.ok(svg.includes('gematria.today'));
});

test('buildSvg embeds the canonical 1200x630 dimensions', () => {
  const svg = buildSvg({
    topic: 't', total: '?', root: '?', summaryLines: [],
  });
  assert.ok(svg.includes('width="1200"'));
  assert.ok(svg.includes('height="630"'));
  assert.ok(svg.includes('viewBox="0 0 1200 630"'));
});
