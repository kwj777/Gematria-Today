import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { extractDeclaration } from './page-script-extract.mjs';

// blog-2.js resolves which post a URL or a clicked link refers to. Inside an
// open post (/blog/<slug>), the table of contents, the "#" heading anchors and
// authored jump links are all '#<heading-id>' links. They used to resolve to
// the open post's own slug, so a TOC click scrolled back to the top of the card
// and stripped the hash; a hash on a reload was even taken as the slug.
const SOURCE = readFileSync(new URL('../page-scripts/blog-2.js', import.meta.url), 'utf8');
const HELPERS = ['getSectionAnchorTarget', 'getRequestedPostSlug', 'getLinkedPostSlug']
  .map((name) => extractDeclaration(SOURCE, name))
  .join('\n');

// `elements` maps an id to its class list: a post card is 'blog-post-card'.
function loadHelpers(href, elements = {}) {
  const location = new URL(href);
  const document = {
    getElementById(id) {
      if (!Object.hasOwn(elements, id)) return null;
      const classes = elements[id];
      return { id, classList: { contains: (name) => classes.includes(name) } };
    },
  };
  const context = vm.createContext({ window: { location }, document, URL, URLSearchParams });
  vm.runInContext(
    `${HELPERS}\nglobalThis.helpers = { getSectionAnchorTarget, getRequestedPostSlug, getLinkedPostSlug };`,
    context,
  );
  const link = (rawHref) => ({
    getAttribute: (name) => (name === 'href' ? rawHref : null),
    href: new URL(rawHref, location.href).href,
  });
  return { ...context.helpers, link };
}

const OPEN_POST = {
  'some-post': ['content-panel', 'blog-post-card'],
  'section-2': [],
  'what-full-totals-are-best-at': [],
  mainContent: [],
};

test('a table-of-contents or heading anchor click is not treated as a post link', () => {
  const { getLinkedPostSlug, link } = loadHelpers('https://gematria.today/blog/some-post', OPEN_POST);
  assert.equal(getLinkedPostSlug(link('#section-2')), '');
  assert.equal(getLinkedPostSlug(link('#what-full-totals-are-best-at')), '');
  // The skip link is an in-page anchor too.
  assert.equal(getLinkedPostSlug(link('#mainContent')), '');
});

test('the same holds in preview, where the post stays in ?post=', () => {
  const { getLinkedPostSlug, link } = loadHelpers(
    'https://gematria.today/blog.html?post=some-post&preview=true',
    OPEN_POST,
  );
  assert.equal(getLinkedPostSlug(link('#section-2')), '');
});

test('real post links still resolve to their post', () => {
  const { getLinkedPostSlug, link } = loadHelpers('https://gematria.today/blog.html', {
    'some-post': ['blog-post-card'],
  });
  assert.equal(getLinkedPostSlug(link('#some-post')), 'some-post');
  assert.equal(getLinkedPostSlug(link('/blog.html?post=other-post#other-post')), 'other-post');
  assert.equal(getLinkedPostSlug(link('/blog/other%20post')), 'other post');
  assert.equal(getLinkedPostSlug(link('/calculator.html')), '');
});

test('a section hash on an open post does not replace the post slug', () => {
  const { getRequestedPostSlug } = loadHelpers('https://gematria.today/blog/some-post#section-2', OPEN_POST);
  assert.equal(getRequestedPostSlug(), 'some-post');
});

test('?post= still wins, and a legacy blog.html#<slug> link still opens that post', () => {
  assert.equal(
    loadHelpers('https://gematria.today/blog.html?post=from-query#section-2', OPEN_POST).getRequestedPostSlug(),
    'from-query',
  );
  assert.equal(loadHelpers('https://gematria.today/blog.html#legacy-slug').getRequestedPostSlug(), 'legacy-slug');
});

test('a hash naming a page element is not mistaken for a post slug', () => {
  const { getRequestedPostSlug } = loadHelpers('https://gematria.today/blog.html#mainContent', OPEN_POST);
  assert.equal(getRequestedPostSlug(), '');
});

test('getSectionAnchorTarget tolerates a malformed escape', () => {
  const { getSectionAnchorTarget } = loadHelpers('https://gematria.today/blog/some-post', { '100%zz': [] });
  assert.ok(getSectionAnchorTarget('#100%zz'));
  assert.equal(getSectionAnchorTarget('#'), null);
});

test('the click and hashchange handlers defer section anchors to the browser', () => {
  // Wiring: the delegated click handler resolves links through
  // getLinkedPostSlug, and the hashchange handler stops before refocusing the
  // post when the new hash names a section.
  assert.match(
    SOURCE,
    /const linkedSlug = getLinkedPostSlug\(postLink\);\s*if \(!linkedSlug\) \{\s*return;\s*\}\s*window\.setTimeout\(\(\) => focusLinkedPost\(linkedSlug\), 0\);/,
  );
  const hashchange = SOURCE.match(/window\.addEventListener\('hashchange', \(\) => \{([\s\S]*?)\n {6}\}\);/);
  assert.ok(hashchange, 'hashchange listener not found');
  const guard = hashchange[1].indexOf('getSectionAnchorTarget(window.location.hash)');
  const refocus = hashchange[1].indexOf('focusLinkedPost(getRequestedPostSlug())');
  assert.ok(guard !== -1 && refocus !== -1 && guard < refocus, 'section-anchor guard must precede the refocus');
});
