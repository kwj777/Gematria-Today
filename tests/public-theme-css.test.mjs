import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import {
  buildCss,
  escapeCssComment,
  normalizeThemeCatalog,
  safeJsonParse,
  shouldIncludeCustomCss,
  stripBootswatchImports,
} from '../netlify/functions/public-theme-css.mjs';

// ---------- safeJsonParse ----------

test('safeJsonParse returns the parsed value for valid JSON', () => {
  assert.deepEqual(safeJsonParse('{"a":1}'), { a: 1 });
});

test('safeJsonParse returns the fallback for invalid JSON, null, and non-string input', () => {
  assert.deepEqual(safeJsonParse('not json'), {});
  assert.deepEqual(safeJsonParse(null), {});
  assert.deepEqual(safeJsonParse(undefined), {});
  assert.deepEqual(safeJsonParse(42), {});
});

test('safeJsonParse honors a caller-supplied fallback', () => {
  assert.deepEqual(safeJsonParse('bad', { default: true }), { default: true });
  assert.deepEqual(safeJsonParse(null, []), []);
});

// ---------- escapeCssComment ----------

test('escapeCssComment escapes the */ sequence that would close a CSS comment', () => {
  // Security boundary: a theme name like "evil */ body{display:none} /*" must
  // NOT be able to break out of the surrounding CSS comment block.
  assert.equal(
    escapeCssComment('evil */ body{display:none} /*'),
    'evil *\\/ body{display:none} /*',
  );
});

test('escapeCssComment passes through strings with no */ sequence', () => {
  assert.equal(escapeCssComment('normal theme'), 'normal theme');
});

test('escapeCssComment escapes every occurrence in a single string', () => {
  assert.equal(escapeCssComment('*/ */ */'), '*\\/ *\\/ *\\/');
});

test('escapeCssComment coerces nullish input safely', () => {
  assert.equal(escapeCssComment(null), '');
  assert.equal(escapeCssComment(undefined), '');
});

// ---------- normalizeThemeCatalog ----------

test('normalizeThemeCatalog returns a default catalog for empty input', () => {
  const result = normalizeThemeCatalog({});
  assert.equal(result.activeThemeSlug, 'default');
  assert.deepEqual(result.presets, []);
});

test('normalizeThemeCatalog lowercases the active theme slug', () => {
  const result = normalizeThemeCatalog({ activeThemeSlug: '  DAYBREAK  ' });
  assert.equal(result.activeThemeSlug, 'daybreak');
});

test('normalizeThemeCatalog drops presets that have no slug', () => {
  const result = normalizeThemeCatalog({
    presets: [
      { slug: 'good', name: 'Good' },
      { slug: '', name: 'No slug' },
      { name: 'Missing slug' },
      null,
    ],
  });
  assert.equal(result.presets.length, 1);
  assert.equal(result.presets[0].slug, 'good');
});

test('normalizeThemeCatalog normalizes each preset field with sensible defaults', () => {
  const result = normalizeThemeCatalog({
    presets: [{ slug: 'X', name: '  Custom  ', variables: { '--primary': '#000' }, customCss: '  body{}  ' }],
  });
  assert.deepEqual(result.presets[0], {
    slug: 'x',
    name: 'Custom',
    variables: { '--primary': '#000' },
    customCss: 'body{}',
  });
});

test('normalizeThemeCatalog coerces invalid variables/customCss to safe defaults', () => {
  const result = normalizeThemeCatalog({
    presets: [{ slug: 'x', variables: 'not an object', customCss: null }],
  });
  assert.deepEqual(result.presets[0].variables, {});
  assert.equal(result.presets[0].customCss, '');
});

// ---------- buildCss ----------

test('buildCss returns the base CSS when no preset matches the active slug', () => {
  const catalog = normalizeThemeCatalog({
    activeThemeSlug: 'missing',
    presets: [{ slug: 'other', name: 'Other' }],
  });
  const css = buildCss(catalog);
  assert.ok(css.includes('Base Bootstrap theme tokens'));
  assert.ok(!css.includes('Active theme:'));
});

test('buildCss emits an "Active theme" comment when a matching preset exists', () => {
  const catalog = normalizeThemeCatalog({
    activeThemeSlug: 'daybreak',
    presets: [{ slug: 'daybreak', name: 'Daybreak' }],
  });
  const css = buildCss(catalog);
  assert.ok(css.includes('/* Active theme: Daybreak (daybreak) */'));
});

test('buildCss escapes */ in theme names to prevent comment breakout', () => {
  const catalog = normalizeThemeCatalog({
    activeThemeSlug: 'evil',
    presets: [{ slug: 'evil', name: 'oops */ body{display:none} /*' }],
  });
  const css = buildCss(catalog);
  // Original */ sequence must NOT appear in the output comment.
  assert.ok(css.includes('oops *\\/ body{display:none}'));
  assert.ok(!css.includes('oops */ body{display:none}'));
});

test('buildCss renders a :root block with --bs-* variables when defined', () => {
  const catalog = normalizeThemeCatalog({
    activeThemeSlug: 'x',
    presets: [{
      slug: 'x', name: 'X',
      variables: { '--bs-primary': '#abcdef', '--bs-secondary': '#fedcba' },
    }],
  });
  const css = buildCss(catalog);
  assert.ok(css.includes('--bs-primary: #abcdef;'));
  assert.ok(css.includes('--bs-secondary: #fedcba;'));
});

test('buildCss ignores variables whose name does not start with -- or whose value is blank', () => {
  const catalog = normalizeThemeCatalog({
    activeThemeSlug: 'x',
    presets: [{
      slug: 'x', name: 'X',
      variables: {
        '--bs-primary': '#abcdef',
        'primary': '#bad',        // missing --
        '--bs-blank': '   ',      // blank value
      },
    }],
  });
  const css = buildCss(catalog);
  assert.ok(css.includes('--bs-primary: #abcdef;'));
  assert.ok(!css.includes('primary: #bad;'));
  assert.ok(!css.includes('--bs-blank'));
});

test('buildCss appends the preset customCss when includeCustomCss=true', () => {
  const catalog = normalizeThemeCatalog({
    activeThemeSlug: 'x',
    presets: [{ slug: 'x', name: 'X', customCss: '.foo { color: red; }' }],
  });
  const css = buildCss(catalog, { includeCustomCss: true });
  assert.ok(css.includes('.foo { color: red; }'));
});

test('buildCss omits the preset customCss when includeCustomCss=false', () => {
  const catalog = normalizeThemeCatalog({
    activeThemeSlug: 'x',
    presets: [{ slug: 'x', name: 'X', customCss: '.foo { color: red; }' }],
  });
  const css = buildCss(catalog, { includeCustomCss: false });
  assert.ok(!css.includes('.foo { color: red; }'));
});

// ---------- stripBootswatchImports ----------

test('stripBootswatchImports replaces @import for bootswatch with an explanatory comment', () => {
  const input = `body{} @import url('https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/cosmo/bootstrap.min.css'); .foo{}`;
  const result = stripBootswatchImports(input);
  assert.ok(!result.includes('cdn.jsdelivr.net'));
  assert.ok(result.includes('/* Bootswatch @import stripped'));
});

test('stripBootswatchImports leaves other @import statements untouched', () => {
  const input = `@import url('https://fonts.googleapis.com/css?family=Inter');`;
  const result = stripBootswatchImports(input);
  assert.equal(result, input);
});

test('stripBootswatchImports handles repeated bootswatch imports', () => {
  const input = [
    `@import url('https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/cosmo/bootstrap.min.css');`,
    `@import url('https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/flatly/bootstrap.min.css');`,
  ].join('\n');
  const result = stripBootswatchImports(input);
  assert.ok(!result.includes('cdn.jsdelivr.net'));
});

test('stripBootswatchImports tolerates nullish input', () => {
  assert.equal(stripBootswatchImports(null), '');
  assert.equal(stripBootswatchImports(undefined), '');
});

// ---------- shouldIncludeCustomCss ----------

test('shouldIncludeCustomCss returns true when no Referer header is present', () => {
  assert.equal(shouldIncludeCustomCss({ headers: {} }), true);
});

test('shouldIncludeCustomCss returns true for non-admin Referer paths', () => {
  assert.equal(
    shouldIncludeCustomCss({ headers: { referer: 'https://gematria.today/blog.html' } }),
    true,
  );
});

test('shouldIncludeCustomCss returns false for the admin scope', () => {
  // Security: theme customCss must NOT be applied while the user is on an admin
  // page, otherwise a malicious theme preview could style admin controls into
  // misleading states. Admin pages ask for that with ?scope=admin.
  assert.equal(
    shouldIncludeCustomCss({ headers: {}, queryStringParameters: { scope: 'admin' } }),
    false,
  );
  assert.equal(
    shouldIncludeCustomCss({ headers: {}, queryStringParameters: { scope: ' Admin ' } }),
    false,
  );
});

test('shouldIncludeCustomCss ignores the Referer, because the response is cached by URL', () => {
  // The response is public, max-age=300, keyed on the URL alone (no
  // Vary: Referer). Branching on the Referer meant the first page to fetch the
  // URL decided the body every later page got from cache: an admin visit
  // stripped the custom theme from public pages, and a public visit put the
  // custom CSS on admin pages. Same URL must mean same body.
  for (const referer of [
    'https://gematria.today/admin.html',
    'https://gematria.today/admin-posts.html',
    'https://gematria.today/blog.html',
    'not a url',
  ]) {
    assert.equal(shouldIncludeCustomCss({ headers: { referer } }), true, referer);
    assert.equal(shouldIncludeCustomCss({ headers: { Referer: referer } }), true, referer);
  }
});

test('shouldIncludeCustomCss includes custom CSS for any other scope value', () => {
  assert.equal(shouldIncludeCustomCss({ headers: {}, queryStringParameters: {} }), true);
  assert.equal(shouldIncludeCustomCss({ headers: {}, queryStringParameters: { scope: 'public' } }), true);
  assert.equal(shouldIncludeCustomCss({ headers: {}, queryStringParameters: null }), true);
});

test('every admin page requests the admin-scoped theme CSS, and no public page does', () => {
  const repoUrl = (relativePath) => new URL(`../${relativePath}`, import.meta.url);
  const themeHrefs = (html) => [...html.matchAll(/href="(\/api\/public-theme-css[^"]*)"/g)].map((match) => match[1]);

  const adminPages = readdirSync(repoUrl('.')).filter((name) => /^admin.*\.html$/.test(name));
  assert.ok(adminPages.length > 0);
  for (const page of adminPages) {
    const hrefs = themeHrefs(readFileSync(repoUrl(page), 'utf8'));
    for (const href of hrefs) {
      assert.equal(href, '/api/public-theme-css?scope=admin', `${page} must load the admin-scoped theme CSS`);
    }
  }

  const publicPages = readdirSync(repoUrl('src')).filter((name) => name.endsWith('.html')).map((name) => `src/${name}`);
  for (const page of publicPages) {
    for (const href of themeHrefs(readFileSync(repoUrl(page), 'utf8'))) {
      assert.equal(href, '/api/public-theme-css', `${page} must load the public theme CSS`);
    }
  }
});
