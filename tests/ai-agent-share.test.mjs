import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShareHtml,
  computeShareValues,
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

test('toImageUrl composes the canonical share-image URL from the topic alone', () => {
  // The image endpoint recomputes total and root, so sending them only
  // fragmented the CDN cache.
  const url = toImageUrl('Hello');
  assert.equal(url, 'https://gematria.today/api/ai-agent-share-image?topic=Hello');
  assert.equal(toImageUrl(''), 'https://gematria.today/api/ai-agent-share-image');
});

test('toImageUrl URL-encodes topics with special characters', () => {
  const url = toImageUrl('hello world & friends');
  assert.ok(url.includes('topic=hello+world+%26+friends'));
});

// ---------- computeShareValues ----------

test('computeShareValues returns the English gematria total and digital root of the topic', () => {
  // H48 + E30 + L72 + L72 + O90
  assert.deepEqual(computeShareValues('Hello'), { total: '312', root: '6' });
  assert.deepEqual(computeShareValues('Obama'), { total: '192', root: '3' });
});

test('computeShareValues uses "?" when the topic has no letters to count', () => {
  assert.deepEqual(computeShareValues(''), { total: '?', root: '?' });
  assert.deepEqual(computeShareValues('2024!'), { total: '?', root: '?' });
  assert.deepEqual(computeShareValues(null), { total: '?', root: '?' });
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
  // X = 24 * 6 = 144, digital root 9.
  const html = buildShareHtml(makeParams({ topic: 'X' }));
  assert.ok(html.includes('sharedTopic=X'));
  assert.ok(html.includes('sharedTotal=144'));
  assert.ok(html.includes('sharedRoot=9'));
  assert.ok(html.includes('Gematria lookup for X: total 144 • digital root 9'));
});

test('buildShareHtml ignores forged total and root on the query string', () => {
  // ?topic=Obama&total=666&root=9 used to unfurl as a site-branded result
  // claiming 666, with og:image passing the same numbers to the card.
  const html = buildShareHtml(makeParams({ topic: 'Obama', total: '666', root: '9' }));
  assert.ok(html.includes('content="Gematria lookup for Obama: total 192 • digital root 3"'));
  assert.ok(html.includes('sharedTotal=192'));
  assert.ok(html.includes('sharedRoot=3'));
  assert.ok(html.includes('property="og:image" content="https://gematria.today/api/ai-agent-share-image?topic=Obama"'));
  assert.ok(!html.includes('666'));
});

test('buildShareHtml counts the whole topic, not the shortened title', () => {
  const longTopic = 'a'.repeat(200);
  const html = buildShareHtml(makeParams({ topic: longTopic, total: '6' }));
  assert.ok(html.includes('total 1200 • digital root 3'));
  // The card and the GemaBot banner recompute from the topic they are given,
  // so both get the whole of it.
  assert.ok(html.includes(`sharedTopic=${longTopic}&amp;`));
  assert.ok(html.includes(`ai-agent-share-image?topic=${longTopic}"`));
});

test('buildShareHtml uses "?" placeholders when the topic has no letters', () => {
  const html = buildShareHtml(makeParams({ topic: '123', total: '666', root: '9' }));
  // Description includes "total ? • digital root ?"
  assert.ok(html.includes('total ? • digital root ?'));
  assert.ok(!html.includes('666'));
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
  const html = buildShareHtml(makeParams({ total: '666' }));
  assert.ok(html.includes('GemaBot: Gematria Agent Result'));
  // The placeholder title is not a lookup: nothing is computed for it and the
  // GemaBot page gets no shared banner.
  assert.ok(html.includes('total ? • digital root ?'));
  assert.ok(!html.includes('sharedTopic'));
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
