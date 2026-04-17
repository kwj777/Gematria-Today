import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('site adaptation guide redirect is forced through super-admin function', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  const guardedRedirectBlock = [
    '[[redirects]]',
    '  from = "/*-site-adaptation-guide.html"',
    '  to = "/.netlify/functions/super-admin-static-page"',
    '  status = 200',
    '  force = true',
  ].join('\n');

  assert.match(
    netlifyToml,
    new RegExp(guardedRedirectBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});

test('site adaptation markdown redirects use wildcard splat pattern', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  const markdownRedirectBlock = [
    '[[redirects]]',
    '  from = "/*-site-adaptation-guide.md"',
    '  to = "/:splat-site-adaptation-guide.html"',
    '  status = 301',
  ].join('\n');

  assert.match(
    netlifyToml,
    new RegExp(markdownRedirectBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});

test('secure guide folder paths are canonicalized to root guide URLs', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  const secureGuideRedirectBlock = [
    '[[redirects]]',
    '  from = "/secure/site-adaptation-guides/*-site-adaptation-guide.html"',
    '  to = "/:splat-site-adaptation-guide.html"',
    '  status = 301',
  ].join('\n');

  assert.match(
    netlifyToml,
    new RegExp(secureGuideRedirectBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});


test('site adaptation guide URLs with duplicated .html segments are canonicalized', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  const duplicateHtmlRedirectBlock = [
    '[[redirects]]',
    '  from = "/*-site-adaptation-guide.html.html*"',
    '  to = "/:splat-site-adaptation-guide.html"',
    '  status = 301',
  ].join('\n');

  assert.match(
    netlifyToml,
    new RegExp(duplicateHtmlRedirectBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});

test('site adaptation guide URLs with exactly doubled .html are canonicalized without requiring trailing content', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  // The trailing-wildcard rule /*-site-adaptation-guide.html.html* requires at
  // least one character after the second .html in some Netlify routing
  // implementations.  An exact-match rule without the trailing * ensures that
  // URLs ending with precisely .html.html (nothing after) are also caught
  // before the /:page catch-all can append another .html.
  const exactDoubleHtmlRedirectBlock = [
    '[[redirects]]',
    '  from = "/*-site-adaptation-guide.html.html"',
    '  to = "/:splat-site-adaptation-guide.html"',
    '  status = 301',
  ].join('\n');

  assert.match(
    netlifyToml,
    new RegExp(exactDoubleHtmlRedirectBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});

test('exact-double .html dedup rule appears before the trailing-wildcard dedup rule', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  const exactDoublePos = netlifyToml.indexOf('from = "/*-site-adaptation-guide.html.html"');
  const trailingWildcardPos = netlifyToml.indexOf('from = "/*-site-adaptation-guide.html.html*"');

  assert.ok(exactDoublePos !== -1, 'exact-double rule must exist');
  assert.ok(trailingWildcardPos !== -1, 'trailing-wildcard rule must exist');
  assert.ok(
    exactDoublePos < trailingWildcardPos,
    'exact-double rule must appear before the trailing-wildcard rule so it is evaluated first',
  );
});
