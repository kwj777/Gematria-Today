import test from 'node:test';
import assert from 'node:assert/strict';

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

test('shouldIncludeCustomCss returns false when Referer points at an /admin* page', () => {
  // Security: theme customCss must NOT be applied while the user is on an admin
  // page, otherwise a malicious theme preview could style admin controls into
  // misleading states.
  assert.equal(
    shouldIncludeCustomCss({ headers: { referer: 'https://gematria.today/admin.html' } }),
    false,
  );
  assert.equal(
    shouldIncludeCustomCss({ headers: { referer: 'https://gematria.today/admin-posts.html' } }),
    false,
  );
});

test('shouldIncludeCustomCss returns true on malformed Referer (fail-open for non-admin contexts)', () => {
  // If the URL parse fails, we don't know whether the caller is on /admin, so
  // the safe default is to include custom CSS — admin pages would set their
  // own Referer correctly.
  assert.equal(
    shouldIncludeCustomCss({ headers: { referer: 'not a url' } }),
    true,
  );
});

test('shouldIncludeCustomCss is case-insensitive on the "Referer" header name', () => {
  assert.equal(
    shouldIncludeCustomCss({ headers: { Referer: 'https://gematria.today/admin.html' } }),
    false,
  );
});
