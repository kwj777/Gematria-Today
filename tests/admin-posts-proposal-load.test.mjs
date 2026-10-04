import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { extractDeclaration } from './page-script-extract.mjs';

// "Load into publishing workspace" put a member's proposal body into the admin
// post editor with innerHTML. Any premium member writes that body, so a
// <meta http-equiv="refresh">, <style> or <base> in it ran in the admin console
// and, once published, on the public blog. Proposal bodies come from a plain
// textarea, so they are now converted as text/Markdown by markdownToHtml.
const SOURCE = readFileSync(new URL('../page-scripts/admin-posts-1.js', import.meta.url), 'utf8');

function loadMarkdownToHtml() {
  const context = vm.createContext({});
  const helpers = ['applyInlineMarkdown', 'markdownToHtml'].map((name) => extractDeclaration(SOURCE, name)).join('\n');
  vm.runInContext(`${helpers}\nglobalThis.markdownToHtml = markdownToHtml;`, context);
  return context.markdownToHtml;
}

function tagsIn(html) {
  return Array.from(html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi), (match) => ({
    name: match[1].toLowerCase(),
    attributes: Array.from(match[2].matchAll(/([^\s=]+)="[^"]*"/g), (attr) => attr[1].toLowerCase()),
  }));
}

test('the proposal loader converts the body instead of injecting it as HTML', () => {
  const loader = extractDeclaration(SOURCE, 'loadProposalFromQueryParam');
  assert.match(loader, /setEditorHtml\('createPostBody', markdownToHtml\(proposal\.body \|\| ''\)\)/);
  assert.doesNotMatch(loader, /setEditorHtml\('createPostBody', proposal\.body/);
});

test('markup in a proposal body comes out as text', () => {
  const markdownToHtml = loadMarkdownToHtml();
  const html = markdownToHtml(
    '<meta http-equiv="refresh" content="0;url=https://evil.example/admin-login"><p>Great article</p>\n\n'
    + '<style>body{display:none}</style><base href="https://evil.example/">',
  );
  assert.deepEqual(tagsIn(html).map((tag) => tag.name), ['p', 'p']);
  assert.ok(html.includes('&lt;meta http-equiv=&quot;refresh&quot;'));
  assert.ok(html.includes('&lt;style&gt;'));
});

test('a Markdown link URL cannot close its href and add attributes', () => {
  const markdownToHtml = loadMarkdownToHtml();
  const html = markdownToHtml('[x](https://a.example/"onmouseover="alert(1)) and [y](https://b.example/"style="position:fixed)');
  const anchors = tagsIn(html).filter((tag) => tag.name === 'a');
  assert.equal(anchors.length, 2);
  for (const anchor of anchors) {
    assert.deepEqual(anchor.attributes, ['href', 'target', 'rel']);
  }
});

test('plain-text and Markdown structure survive the conversion', () => {
  const markdownToHtml = loadMarkdownToHtml();
  assert.equal(
    markdownToHtml('## Outline\n\nFirst line\ncontinues here & more.\n\n- one\n- **two**\n\nSee [docs](https://gematria.today/faq.html).'),
    [
      '<h2>Outline</h2>',
      '<p>First line continues here &amp; more.</p>',
      '<ul><li>one</li><li><strong>two</strong></li></ul>',
      '<p>See <a href="https://gematria.today/faq.html" target="_blank" rel="noopener noreferrer">docs</a>.</p>',
    ].join('\n'),
  );
});
