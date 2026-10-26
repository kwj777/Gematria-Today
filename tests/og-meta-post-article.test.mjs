import test from 'node:test';
import assert from 'node:assert/strict';
import { injectPostArticle, stripExecutableMarkup } from '../netlify/edge-functions/lib/og-meta.mjs';

const PLACEHOLDER = '<div id="blogPosts"><article class="blog-post-card p-4 p-lg-5 news-placeholder-panel"><p>x</p></article></div>';

test('injectPostArticle replaces the placeholder with the post title and body', () => {
  const html = injectPostArticle(PLACEHOLDER, { title: 'A & B', bodyHtml: '<p>Body</p>' });
  assert.equal(html, '<div id="blogPosts"><article class="content-panel p-4 p-lg-5 blog-post-card"><h1 class="blog-post-title h2 mb-3">A &amp; B</h1><div class="blog-post-body d-grid gap-3"><p>Body</p></div></article></div>');
});

test('injectPostArticle leaves the page alone when there is no body', () => {
  assert.equal(injectPostArticle(PLACEHOLDER, { title: 'T', bodyHtml: '' }), PLACEHOLDER);
});

test('injectPostArticle keeps $ sequences in a body literal', () => {
  const html = injectPostArticle(PLACEHOLDER, { title: 'T', bodyHtml: "<p>$& $` $'</p>" });
  assert.ok(html.includes("<p>$& $` $'</p>"));
});

test('stripExecutableMarkup removes anything a browser would run from a response', () => {
  const dirty = '<p onclick="x()">a</p><script>alert(1)</script><SCRIPT src="/x.js"></SCRIPT><iframe src="//e"></iframe><a href="javascript:alert(1)">b</a><img src=x onerror=alert(1)>';
  const clean = stripExecutableMarkup(dirty);
  assert.ok(!/script|iframe|onclick|onerror|javascript:/i.test(clean), clean);
  assert.ok(clean.includes('<p>a</p>'));
  assert.ok(clean.includes('>b</a>'));
});

test('stripExecutableMarkup leaves "word = value" prose and its closing tags alone', () => {
  for (const html of [
    '<p>In English Sumerian, one = 204 and seven = 390.</p>',
    '<li>Onan = 222, Onesimus = 588</li>',
    '<a href="/w/one">the word one = 204</a>',
    '<p>The word ONE = 204 here.</p>',
  ]) {
    assert.equal(stripExecutableMarkup(html), html);
  }
});

test('stripExecutableMarkup removes markup a single pass would reassemble', () => {
  const clean = stripExecutableMarkup('<p>hi</p><scr<script></script>ipt src="/x.js"></scr<script></script>ipt><me<meta>ta http-equiv="refresh" content="0;url=//e"><p>after</p>');
  assert.ok(!/<script|<meta/i.test(clean), clean);
  assert.ok(clean.includes('<p>hi</p>') && clean.includes('<p>after</p>'));
});

test('stripExecutableMarkup finds handlers after a quoted ">" inside a tag', () => {
  const clean = stripExecutableMarkup('<a title="a > b" onclick="x()" href="/calculator.html">c</a>');
  assert.equal(clean, '<a title="a > b" href="/calculator.html">c</a>');
});

test('injectPostArticle drops the auto-generated hero the blog script hides', () => {
  const html = injectPostArticle(PLACEHOLDER, {
    title: 'T',
    bodyHtml: '<!-- auto-generated-hero -->\n<p><img src="data:image/svg+xml,x" style="width:100%"></p>\n<!-- /auto-generated-hero -->\n<p>Body</p>',
  });
  assert.ok(!html.includes('auto-generated-hero'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('<p>Body</p>'));
});
