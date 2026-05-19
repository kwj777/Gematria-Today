import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShareHtml,
  escapeHtml,
  handler as aiAgentShareHandler,
  toImageUrl,
  trimValue,
} from '../netlify/functions/ai-agent-share.mjs';

// ---------- escapeHtml ----------

test('escapeHtml escapes the five required entities', () => {
  assert.equal(escapeHtml(`& < > " '`), '&amp; &lt; &gt; &quot; &#39;');
});

test('escapeHtml escapes & first to avoid double-escaping', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

// ---------- trimValue ----------

test('trimValue returns "" for empty/nullish input', () => {
  assert.equal(trimValue('', 10), '');
  assert.equal(trimValue('   ', 10), '');
  assert.equal(trimValue(null, 10), '');
  assert.equal(trimValue(undefined, 10), '');
});

test('trimValue returns the original string when within the length cap', () => {
  assert.equal(trimValue('Hello', 10), 'Hello');
});

test('trimValue appends a single-character ellipsis when truncating', () => {
  const result = trimValue('Hello world', 8);
  assert.equal(result.length, 8);
  assert.ok(result.endsWith('…'));
});

test('trimValue trims trailing whitespace before the ellipsis', () => {
  // "Hello   world" sliced to 7 -> "Hello  " -> trimEnd() -> "Hello" -> "Hello…"
  const result = trimValue('Hello   world', 8);
  assert.equal(result, 'Hello…');
});

// ---------- toImageUrl ----------

test('toImageUrl composes the canonical share-image URL with topic/total/root params', () => {
  const url = toImageUrl('Hello', '156', '3');
  assert.ok(url.startsWith('https://gematria.today/api/ai-agent-share-image'));
  assert.ok(url.includes('topic=Hello'));
  assert.ok(url.includes('total=156'));
  assert.ok(url.includes('root=3'));
});

test('toImageUrl URL-encodes topics with special characters', () => {
  const url = toImageUrl('hello world & friends', '?', '?');
  assert.ok(url.includes('topic=hello+world+%26+friends'));
});

// ---------- buildShareHtml ----------

function makeParams(values = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    params.set(key, String(value));
  }
  return params;
}

test('buildShareHtml emits the standard OG and Twitter meta-tag set with escaped values', () => {
  const html = buildShareHtml(makeParams({
    topic: 'Hello & <World>',
    total: '156',
    root: '3',
  }));

  assert.ok(html.includes('<title>GemaBot: Hello &amp; &lt;World&gt;</title>'));
  assert.ok(html.includes('property="og:title" content="GemaBot: Hello &amp; &lt;World&gt;"'));
  assert.ok(html.includes('name="twitter:title" content="GemaBot: Hello &amp; &lt;World&gt;"'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));

  // The image MIME type / width / height pin the share-image contract.
  assert.ok(html.includes('property="og:image:type" content="image/png"'));
  assert.ok(html.includes('property="og:image:width" content="1200"'));
  assert.ok(html.includes('property="og:image:height" content="630"'));
});

test('buildShareHtml renders the canonical app URL with shared* params', () => {
  const html = buildShareHtml(makeParams({ topic: 'X', total: '42', root: '6' }));
  assert.ok(html.includes('sharedTopic=X'));
  assert.ok(html.includes('sharedTotal=42'));
  assert.ok(html.includes('sharedRoot=6'));
});

test('buildShareHtml uses "?" placeholders when total/root are missing', () => {
  const html = buildShareHtml(makeParams({ topic: 'X' }));
  // Description includes "total ? • digital root ?"
  assert.ok(html.includes('total ?'));
  assert.ok(html.includes('digital root ?'));
});

test('buildShareHtml caps the topic length at 90 chars (with ellipsis when exceeded)', () => {
  const longTopic = 'a'.repeat(200);
  const html = buildShareHtml(makeParams({ topic: longTopic }));
  // The trimmed topic appears between "GemaBot: " and "</title>" — must be 90 chars max.
  const titleMatch = html.match(/<title>GemaBot: ([^<]*)<\/title>/);
  assert.ok(titleMatch);
  assert.ok(titleMatch[1].length <= 90);
  assert.ok(titleMatch[1].endsWith('…'));
});

test('buildShareHtml escapes a malicious topic that tries to inject markup', () => {
  const html = buildShareHtml(makeParams({
    topic: '<img src=x onerror=alert(1)>',
  }));
  // The literal <img onerror=...> must NOT appear; escaped form must.
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('buildShareHtml emits a JSON-stringified inline-script redirect URL', () => {
  const html = buildShareHtml(makeParams({ topic: 'a"b' }));
  assert.ok(html.includes('window.location.replace('));
  // Quote in topic must be escaped inside the meta tags.
  assert.ok(html.includes('a&quot;b'));
});

test('buildShareHtml falls back to "Gematria Agent Result" when topic is missing', () => {
  const html = buildShareHtml(makeParams());
  assert.ok(html.includes('GemaBot: Gematria Agent Result'));
});

// ---------- ai-agent-share handler ----------

test('ai-agent-share handler rejects non-GET requests with 405', async () => {
  const response = await aiAgentShareHandler({ httpMethod: 'POST' });
  assert.equal(response.statusCode, 405);
});

test('ai-agent-share handler returns text/html for a GET with the cache-control directive', async () => {
  const response = await aiAgentShareHandler({
    httpMethod: 'GET',
    queryStringParameters: { topic: 'hello', total: '42', root: '6' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'text/html; charset=UTF-8');
  assert.match(response.headers['cache-control'], /public/);
  assert.match(response.headers['cache-control'], /max-age=\d+/);
});
