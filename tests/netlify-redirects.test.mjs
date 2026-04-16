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
