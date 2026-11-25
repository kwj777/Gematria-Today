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
    '  force = true',
  ].join('\n');

  assert.match(
    netlifyToml,
    new RegExp(secureGuideRedirectBlock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});

// Splitting on [[redirects]] sweeps the *following* rule's leading comment into
// the previous block, and those comments discuss `force = true` by name. Strip
// comments so these assertions test the rules rather than the prose around them.
function redirectRuleFor(netlifyToml, fromLine) {
  return netlifyToml
    .split('[[redirects]]')
    .map((block) => block.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n'))
    .find((block) => block.includes(fromLine));
}

test('markdown guide redirect is forced so the guide sources cannot be read directly', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  const markdownGuideRule = redirectRuleFor(netlifyToml, 'from = "/*-site-adaptation-guide.md"');

  assert.ok(markdownGuideRule, 'expected a redirect rule for markdown guide URLs');
  assert.match(markdownGuideRule, /force = true/);
});

test('guide sources and server-side directories are excluded from the published site', async () => {
  const config = await fs.readFile(new URL('../eleventy.config.mjs', import.meta.url), 'utf8');

  for (const excluded of ['secure', 'sql', 'tests', 'scripts', 'netlify']) {
    assert.match(
      config,
      new RegExp(`'${excluded}',`),
      `${excluded} should be excluded from passthrough copy`,
    );
  }
});

test('secure guide redirect is forced so static files cannot shadow the auth gate', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  // A non-forced redirect would be shadowed by the static file if the guides
  // were ever published, skipping super-admin-static-page entirely.
  const secureGuideRule = redirectRuleFor(netlifyToml, 'from = "/secure/site-adaptation-guides/');

  assert.ok(secureGuideRule, 'expected a redirect rule for the secure guide folder');
  assert.match(secureGuideRule, /force = true/);
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

test('no single-placeholder catch-all redirect exists', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  // `from = "/:page"` matches any single path segment, including one that
  // already contains a dot. Because such a rule is only ever terminated by a
  // file existing at the target, any path with no file behind it redirects to
  // itself + ".html" forever. Explicit per-page rules replace it.
  const catchAll = netlifyToml
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .find((line) => /^\s*from = "\/:[A-Za-z_]+"\s*$/.test(line));

  assert.equal(catchAll, undefined, `single-placeholder catch-all would loop: ${catchAll}`);
});

test('every published page has an extensionless redirect', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(netlifyToml, /# BEGIN generated page redirects/);
  assert.match(netlifyToml, /# END generated page redirects/);

  for (const page of ['calculator', 'blog', 'tools', 'member', 'admin']) {
    assert.match(
      netlifyToml,
      new RegExp(`from = "/${page}"\\n  to = "/${page}\\.html"`),
      `missing extensionless redirect for /${page}`,
    );
  }
});

test('favicon.ico resolves instead of falling through to a redirect chain', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const rule = redirectRuleFor(netlifyToml, 'from = "/favicon.ico"');
  assert.ok(rule, 'expected an explicit /favicon.ico rule');
  assert.match(rule, /pwa-icon/);
});

test('extensionless page redirects are forced so /page cannot serve a duplicate of /page.html', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  // Netlify serves /page.html at /page by itself, and a non-forced rule loses
  // to that. The live site then answered 200 at both URLs, and since Netlify
  // was rewriting links to /page, Google never saw a link to the canonical
  // .html URL.
  const begin = netlifyToml.indexOf('# BEGIN generated page redirects');
  const end = netlifyToml.indexOf('# END generated page redirects');
  assert.ok(begin !== -1 && end > begin, 'expected the generated page redirect block');

  const rules = netlifyToml.slice(begin, end).split('[[redirects]]').slice(1);
  assert.ok(rules.length > 0, 'expected generated page redirect rules');
  for (const rule of rules) {
    assert.match(rule, /status = 301/);
    assert.match(rule, /force = true/, `not forced: ${rule.trim().split('\n')[0]}`);
  }
});

test('Netlify leaves links as written, so they name the canonical .html URL', async () => {
  const netlifyToml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

  // Pretty URLs post-processing rewrote every /page.html link to /page on
  // deploy, and the forced rules above then answered each of those links with
  // a 301. Turned off here, the setting overrides the one in the Netlify UI.
  const uncommented = netlifyToml
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  assert.match(uncommented, /\[build\.processing\.html\]\n\s*pretty_urls = false/);
});

test('the home page carries no link to /definition before a word fills it in', async () => {
  const home = await fs.readFile(new URL('../src/index.html', import.meta.url), 'utf8');

  // /definition with no word answers 400, and a crawler reads an href on a
  // hidden element as readily as on a visible one. home-page.js sets the href
  // when it has a word to look up.
  const cta = home.match(/<a id="homeWordnikWotdDefinitionCta"[^>]*>/);
  assert.ok(cta, 'expected the word-of-the-day definition link');
  assert.doesNotMatch(cta[0], /href=/);
});
