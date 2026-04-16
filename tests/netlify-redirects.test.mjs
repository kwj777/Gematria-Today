import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('site adaptation guide redirect is forced through super-admin function', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  const guardedRedirectBlock = [
    '[[redirects]]',
    '  from = "/:guide-site-adaptation-guide.html"',
    '  to = "/.netlify/functions/super-admin-static-page?file=:guide-site-adaptation-guide.html"',
    '  status = 200',
    '  force = true',
  ].join('\n');

  assert.match(
    netlifyToml,
    new RegExp(guardedRedirectBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});
