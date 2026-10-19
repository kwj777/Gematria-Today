import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildCss, normalizeThemeCatalog } from '../netlify/functions/public-theme-css.mjs';

// Contrast is checked in a browser by axe, but each of these colours was
// measured failing WCAG AA there and then fixed in the stylesheet. These tests
// recompute the ratios from the source so a later edit cannot quietly put a
// failing value back. Surfaces are the composited colours the text actually
// renders on.

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const THEME_CSS = read('theme.css');
const GLOSSARY_SOURCE = read('glossary-popup.js');
// glossary-popup.js builds its stylesheet from concatenated string literals.
const GLOSSARY_CSS = [
  ...GLOSSARY_SOURCE.match(/var STYLES =([\s\S]*?);\n/)[1]
    .replace(/^\s*\/\/.*$/gm, '')
    .matchAll(/'((?:[^'\\]|\\.)*)'/g),
].map((match) => match[1]).join('');
const DEFINITIONS_CSS = [...read('src/definitions.html').matchAll(/<style>([\s\S]*?)<\/style>/g)]
  .map((match) => match[1])
  .join('\n');
const MEMBER_HTML = read('src/member.html');
const TOOLS_HTML = read('src/tools.html');

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

const WHITE = '#ffffff';
const CREAM_PAGE = '#f2efe8'; // bottom of the light page gradient
const LIGHT_PANEL = '#fefefd'; // --color-surface over the page
const DARK_PANEL = '#161d28'; // --color-surface-dark over the dark page
const DARK_PAGE = '#10151d';
const HERO_STOPS = ['#0d1a30', '#1d3358'];
const WOTD_STOPS = ['#14253f', '#0b1424'];
const NAVBAR = ['#1f1b16', '#2a241d']; // light / dark theme
const MOBILE_DRAWER = ['#3f403a', '#212529']; // var(--bs-dark) with / without the theme tokens
const ALERT_WARNING = '#fff3cd';
const ALERT_DANGER = '#f8d7da';

function parseColor(value) {
  const text = String(value).trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)).concat(1);
  }
  const rgb = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => Number.parseFloat(part));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  throw new Error(`unparseable colour: ${value}`);
}

function composite(top, bottom) {
  const [r, g, b, a] = parseColor(top);
  const under = parseColor(bottom);
  return `rgb(${[r, g, b].map((v, i) => Math.round(v * a + under[i] * (1 - a))).join(', ')})`;
}

function luminance(color) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseColor(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function assertContrast(fg, bg, minimum, label) {
  const ratio = contrast(fg, bg);
  assert.ok(ratio >= minimum, `${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
}

// Rule blocks whose selector list contains `selector` exactly. Comments are
// stripped first -- several of them quote CSS with braces in it.
function rules(css, selector) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const wanted = selector.replace(/\s+/g, ' ').trim();
  const found = [];
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.replace(/\s+/g, ' ').trim());
    if (selectors.includes(wanted)) found.push(match[2]);
  }
  return found;
}

function declaration(css, selector, property) {
  const values = rules(css, selector)
    .map((body) => body.match(new RegExp(`(?:^|;)\\s*${property.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+)`)))
    .filter(Boolean)
    .map((match) => match[1].replace(/!important/, '').trim());
  assert.ok(values.length, `no ${property} declared for ${selector}`);
  return values.at(-1);
}

// Resolves var(--x) against the custom properties declared on `scope`.
function resolve(css, value, scope) {
  const ref = value.match(/^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/);
  if (!ref) return value;
  return resolve(css, declaration(css, scope, ref[1]), scope);
}

const LIGHT_ROOT = ':root';
const DARK_ROOT = ':root[data-bs-theme="dark"]';

test('section kickers are readable on light surfaces and stay bright amber on dark ones', () => {
  const color = declaration(THEME_CSS, '.section-kicker', 'color');
  const light = resolve(THEME_CSS, color, LIGHT_ROOT);
  for (const surface of [WHITE, LIGHT_PANEL, CREAM_PAGE, composite('rgba(180, 83, 9, 0.06)', LIGHT_PANEL)]) {
    assertContrast(light, surface, AA_TEXT, 'light-theme .section-kicker');
  }

  const dark = resolve(THEME_CSS, color, DARK_ROOT);
  assertContrast(dark, DARK_PANEL, AA_TEXT, 'dark-theme .section-kicker');

  // The hero and Word of the Day panels are dark in the light theme too.
  for (const panel of ['.hero-panel', '.word-of-day-spotlight']) {
    const onPanel = resolve(THEME_CSS, color, panel);
    for (const stop of HERO_STOPS) assertContrast(onPanel, stop, AA_TEXT, `${panel} .section-kicker`);
  }
});

test('links inherit a readable colour on light surfaces and inside the always-dark panels', () => {
  const light = declaration(THEME_CSS, ':root:not([data-bs-theme="dark"])', '--bs-link-color');
  for (const surface of [LIGHT_PANEL, CREAM_PAGE, ALERT_WARNING, ALERT_DANGER, composite('rgba(180, 83, 9, 0.06)', LIGHT_PANEL)]) {
    assertContrast(light, surface, AA_TEXT, 'light-theme link');
  }
  const rgb = declaration(THEME_CSS, ':root:not([data-bs-theme="dark"])', '--bs-link-color-rgb');
  assert.equal(`rgb(${rgb})`.replace(/\s+/g, ''), composite(light, WHITE).replace(/\s+/g, ''), 'link colour and its -rgb triplet must match');

  const code = declaration(THEME_CSS, ':root:not([data-bs-theme="dark"])', '--bs-code-color');
  for (const surface of [LIGHT_PANEL, CREAM_PAGE, ALERT_WARNING]) assertContrast(code, surface, AA_TEXT, 'light-theme <code>');

  const heroLink = declaration(THEME_CSS, '.hero-panel', '--bs-link-color');
  const glow = composite('rgba(217, 119, 6, 0.32)', HERO_STOPS[1]);
  for (const surface of [...HERO_STOPS, glow]) assertContrast(heroLink, surface, AA_TEXT, 'link inside .hero-panel');
});

test('muted copy has a defined token in both themes', () => {
  // src/404.html's quick-link descriptions read var(--color-text-muted, #6b7a90);
  // with nothing defining the token they fell back to 4.36:1 / 3.83:1.
  const light = declaration(THEME_CSS, LIGHT_ROOT, '--color-text-muted');
  for (const surface of [WHITE, LIGHT_PANEL, CREAM_PAGE]) assertContrast(light, surface, AA_TEXT, 'light --color-text-muted');
  const dark = declaration(THEME_CSS, DARK_ROOT, '--color-text-muted');
  for (const surface of [DARK_PANEL, DARK_PAGE]) assertContrast(dark, surface, AA_TEXT, 'dark --color-text-muted');
  assert.match(read('src/404.html'), /\.quicklink-desc\s*\{[^}]*var\(--color-text-muted/);
});

test('the Tools menu "Compare tools" link is readable on the dark menu and drawer', () => {
  // Desktop and mobile each declare it; both must pass.
  const values = rules(THEME_CSS, '.nav-mega-footer')
    .map((body) => body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/))
    .filter(Boolean)
    .map((match) => resolve(THEME_CSS, match[1].trim(), LIGHT_ROOT));
  assert.ok(values.length >= 2, 'expected desktop and mobile .nav-mega-footer colours');
  for (const color of values) {
    for (const surface of [...NAVBAR, ...MOBILE_DRAWER]) assertContrast(color, surface, AA_TEXT, '.nav-mega-footer');
  }
  const hover = resolve(THEME_CSS, declaration(THEME_CSS, '.nav-mega-footer:hover', 'color'), LIGHT_ROOT);
  assertContrast(hover, NAVBAR[1], AA_TEXT, '.nav-mega-footer:hover');
});

test('the terms pricing kicker is readable on the dark callout', () => {
  const callout = composite('rgba(180, 83, 9, 0.12)', DARK_PANEL);
  const dark = declaration(THEME_CSS, ':root[data-bs-theme="dark"] .premium-pricing-callout__kicker', 'color');
  assertContrast(dark, callout, AA_TEXT, 'dark .premium-pricing-callout__kicker');
});

test('navbar controls get a solid focus outline that stands out from the bar', () => {
  for (const selector of [
    '.navbar-dark .nav-link:focus-visible',
    '.navbar-dark .nav-theme-toggle:focus-visible',
    '.navbar-dark .navbar-toggler:focus-visible',
  ]) {
    const outline = declaration(THEME_CSS, selector, 'outline');
    const match = outline.match(/^(\d+)px solid (#[0-9a-f]{6})$/i);
    assert.ok(match, `${selector} must use a solid outline, got "${outline}"`);
    assert.ok(Number(match[1]) >= 2);
    for (const bar of [...NAVBAR, ...MOBILE_DRAWER]) assertContrast(match[2], bar, AA_NON_TEXT, `${selector} outline`);
    assert.equal(declaration(THEME_CSS, selector, 'box-shadow'), 'none');
  }
});

test('member dashboard stat values and the price badge are readable in dark mode', () => {
  const primary = declaration(THEME_CSS, ':root[data-bs-theme="dark"] .text-primary', 'color');
  assertContrast(primary, DARK_PANEL, AA_TEXT, 'dark .text-primary');

  const badgeBackground = composite('rgba(255, 124, 53, 0.16)', DARK_PANEL);
  const badge = declaration(THEME_CSS, ':root[data-bs-theme="dark"] .membership-price-badge', 'color');
  assertContrast(badge, badgeBackground, AA_TEXT, 'dark .membership-price-badge');
  const lightBadge = declaration(THEME_CSS, '.membership-price-badge', 'color');
  assertContrast(lightBadge, composite('rgba(255, 124, 53, 0.16)', LIGHT_PANEL), AA_TEXT, 'light .membership-price-badge');

  // The badge used to carry a struck-through $29, faded with opacity-75
  // (1.56:1 dark, 3.59:1 light). Membership is $19 a year with no reference
  // price, so the badge is the price alone at full strength.
  const badgeMarkup = MEMBER_HTML.match(/<div class="membership-price-badge">([\s\S]*?)<\/div>/);
  assert.ok(badgeMarkup, 'membership price badge not found in src/member.html');
  assert.doesNotMatch(badgeMarkup[1], /opacity-/);
  assert.doesNotMatch(badgeMarkup[1], /\$29/);
});

test('blog tag chips show a fill-independent focus ring and keep the selected fill on focus', () => {
  const outline = declaration(THEME_CSS, '.blog-tag-chip:focus-visible', 'outline');
  const match = outline.match(/^(\d+)px solid (.+)$/);
  assert.ok(match, `.blog-tag-chip:focus-visible needs a solid outline, got "${outline}"`);
  const ring = resolve(THEME_CSS, match[2], LIGHT_ROOT);
  for (const surface of [WHITE, CREAM_PAGE]) assertContrast(ring, surface, AA_NON_TEXT, 'light chip focus ring');
  const darkRing = declaration(THEME_CSS, ':root[data-bs-theme="dark"] .blog-tag-chip:focus-visible', 'outline-color');
  for (const surface of [DARK_PANEL, DARK_PAGE]) assertContrast(darkRing, surface, AA_NON_TEXT, 'dark chip focus ring');

  // In dark mode the hover/focus rule sets a translucent background at
  // specificity 0,4,0. The active rule has to match it (and come later) or the
  // selected filter looks unselected while focused.
  const stripped = THEME_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const focusAt = stripped.indexOf(':root[data-bs-theme="dark"] .blog-tag-chip:focus-visible {');
  const hoverFocusAt = stripped.search(/:root\[data-bs-theme="dark"\] \.blog-tag-chip:hover,\s*:root\[data-bs-theme="dark"\] \.blog-tag-chip:focus-visible \{/);
  const activeAt = stripped.indexOf(':root[data-bs-theme="dark"] .blog-tag-chip.blog-tag-chip--active {');
  assert.ok(focusAt > -1 && hoverFocusAt > -1, 'dark chip hover/focus rules not found');
  assert.ok(activeAt > hoverFocusAt, 'the dark active chip rule must use .blog-tag-chip.blog-tag-chip--active after the hover/focus rule');
});

test('glossary terms stay readable when hovered or focused', () => {
  for (const state of ['hover', 'focus-visible']) {
    const light = declaration(GLOSSARY_CSS, `.defn-term:${state}`, 'color');
    for (const surface of [WHITE, LIGHT_PANEL, CREAM_PAGE, ALERT_WARNING]) {
      assertContrast(light, surface, AA_TEXT, `.defn-term:${state} on light`);
    }

    // The dark theme, plus every panel that is navy in the light theme too.
    // The learning-path promo's gradient only turns amber in its far corner;
    // its copy sits on the navy part.
    const darkSurfaces = {
      ':root[data-bs-theme="dark"]': [DARK_PANEL, DARK_PAGE],
      '.hero-panel': [...HERO_STOPS, composite('rgba(217, 119, 6, 0.32)', HERO_STOPS[1])],
      '.word-of-day-spotlight': WOTD_STOPS,
      '.learning-path-promo': HERO_STOPS,
    };
    for (const [scope, surfaces] of Object.entries(darkSurfaces)) {
      const color = declaration(GLOSSARY_CSS, `${scope} .defn-term:${state}`, 'color');
      for (const surface of surfaces) assertContrast(color, surface, AA_TEXT, `${scope} .defn-term:${state}`);
    }

    // The Glossary page skips glossary-popup.js and styles its own terms; they
    // sit on white / dark cards, sometimes inside a search highlight.
    const page = declaration(DEFINITIONS_CSS, `.defn-term:${state}`, 'color');
    for (const surface of [WHITE, '#fef08a']) assertContrast(page, surface, AA_TEXT, `definitions .defn-term:${state}`);
    const pageDark = declaration(DEFINITIONS_CSS, `:root[data-bs-theme="dark"] .defn-term:${state}`, 'color');
    for (const surface of [DARK_PANEL, composite('rgba(250, 204, 21, 0.28)', DARK_PANEL)]) {
      assertContrast(pageDark, surface, AA_TEXT, `dark definitions .defn-term:${state}`);
    }
  }

  // Any always-dark panel that theme.css hands light link colours to holds
  // body copy the glossary can wrap, so it needs the light hover colour too.
  const stripped = THEME_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/--bs-link-color\s*:/.test(match[2])) continue;
    for (const selector of match[1].split(',').map((part) => part.replace(/\s+/g, ' ').trim())) {
      if (selector.startsWith(':root')) continue;
      assert.ok(rules(GLOSSARY_CSS, `${selector} .defn-term:hover`).length, `${selector} has no dark-surface .defn-term hover colour`);
    }
  }
});

test('light-theme outline-secondary buttons are readable on the cream page', () => {
  const color = declaration(THEME_CSS, ':root:not([data-bs-theme="dark"]) .btn-outline-secondary', '--bs-btn-color');
  assertContrast(color, CREAM_PAGE, AA_TEXT, 'light .btn-outline-secondary');
});

test('amber outline buttons are readable at rest and when filled, in both themes', () => {
  // Bootstrap's #ffc107 outline was 1.47:1 on .alert-warning (the forum's
  // sign-up prompt) and 1.63:1 on white (name calculator "Download image").
  const ALERT_SECONDARY = '#e2e3e5';
  const ALERT_INFO = '#cff4fc';
  const rule = '.btn-outline-warning';
  const light = resolve(THEME_CSS, declaration(THEME_CSS, rule, '--bs-btn-color'), LIGHT_ROOT);
  for (const surface of [WHITE, LIGHT_PANEL, CREAM_PAGE, ALERT_WARNING, ALERT_SECONDARY, ALERT_INFO]) {
    assertContrast(light, surface, AA_TEXT, 'light .btn-outline-warning');
  }
  for (const state of ['hover', 'active']) {
    const fg = resolve(THEME_CSS, declaration(THEME_CSS, rule, `--bs-btn-${state}-color`), LIGHT_ROOT);
    const bg = resolve(THEME_CSS, declaration(THEME_CSS, rule, `--bs-btn-${state}-bg`), LIGHT_ROOT);
    assertContrast(fg, bg, AA_TEXT, `.btn-outline-warning:${state}`);
  }
  // Bootstrap's dark .alert-warning / -secondary / -info backgrounds.
  const dark = declaration(THEME_CSS, `${DARK_ROOT} ${rule}`, '--bs-btn-color');
  for (const surface of [DARK_PANEL, DARK_PAGE, '#332701', '#161719', '#032830']) {
    assertContrast(dark, surface, AA_TEXT, 'dark .btn-outline-warning');
  }
});

test('the blog email Subscribe button uses the brand amber pair', () => {
  const rule = '.followit--follow-form-container .form-preview .preview-submit-button button';
  const fg = resolve(THEME_CSS, declaration(THEME_CSS, rule, 'color'), LIGHT_ROOT);
  const bg = resolve(THEME_CSS, declaration(THEME_CSS, rule, 'background'), LIGHT_ROOT);
  assertContrast(fg, bg, AA_TEXT, 'blog Subscribe button');
});

test('tools page plan badges are readable on their tinted pills', () => {
  const pill = (selector, tint) => {
    const block = TOOLS_HTML.match(new RegExp(`\\n\\s*${selector.replace(/[.-]/g, '\\$&')} \\{([^}]*)\\}`));
    assert.ok(block, `${selector} not found in src/tools.html`);
    const color = block[1].match(/color:\s*(#[0-9a-f]{6})/i)[1];
    assertContrast(color, composite(tint, LIGHT_PANEL), AA_TEXT, selector);
  };
  pill('.tool-card-badge--free', 'rgba(34, 197, 94, 0.16)');
  pill('.tool-card-badge--premium', 'rgba(180, 83, 9, 0.15)');
});

test('base theme tokens keep Bootstrap text and badge utilities at AA', () => {
  const css = buildCss(normalizeThemeCatalog({}));
  const token = (name) => {
    const match = css.match(new RegExp(`--bs-${name}:\\s*(#[0-9a-f]{6});`, 'i'));
    assert.ok(match, `--bs-${name} missing from the base theme CSS`);
    const rgb = css.match(new RegExp(`--bs-${name}-rgb:\\s*([\\d,\\s]+);`));
    assert.ok(rgb, `--bs-${name}-rgb missing from the base theme CSS`);
    assert.equal(`rgb(${rgb[1]})`.replace(/\s+/g, ''), composite(match[1], WHITE).replace(/\s+/g, ''), `--bs-${name} and --bs-${name}-rgb disagree`);
    return match[1];
  };

  // Bootstrap fixes the badge text colour per variant: white on these...
  for (const name of ['secondary', 'success', 'danger']) {
    assertContrast('#ffffff', token(name), AA_TEXT, `.text-bg-${name}`);
    // ...and the same fills are the light-theme .text-* colours.
    for (const surface of [LIGHT_PANEL, CREAM_PAGE]) assertContrast(token(name), surface, AA_TEXT, `light .text-${name}`);
  }
  // ...and black on these.
  for (const name of ['info', 'warning']) assertContrast('#000000', token(name), AA_TEXT, `.text-bg-${name}`);

  // Fills that are dark for white badge text need a light shade as dark-mode text.
  for (const name of ['secondary', 'success', 'danger']) {
    const dark = declaration(THEME_CSS, `:root[data-bs-theme="dark"] .text-${name}`, 'color');
    assertContrast(dark, DARK_PANEL, AA_TEXT, `dark .text-${name}`);
  }
  // Info stays light for its black badge text, so as light-theme text it is retinted.
  const info = declaration(THEME_CSS, ':root:not([data-bs-theme="dark"]) .text-info', 'color');
  assertContrast(info, LIGHT_PANEL, AA_TEXT, 'light .text-info');
  assertContrast(token('info'), DARK_PANEL, AA_TEXT, 'dark .text-info');
  const warning = declaration(THEME_CSS, ':root:not([data-bs-theme="dark"]) .stat-card .text-warning', 'color');
  assertContrast(warning, LIGHT_PANEL, AA_TEXT, 'light stat-card .text-warning');

  // Learning-path progress labels sit on the info fill: --bs-dark (#3f403a) was 3.59:1.
  for (const page of ['gematria-account-setup', 'gematria-basics', 'gematria-name-analysis', 'gematria-pattern-grouping']) {
    const html = read(`src/${page}.html`);
    assert.doesNotMatch(html, /progress-bar bg-info text-dark/, `${page}: dark-grey label on the info fill`);
    assert.match(html, /progress-bar bg-info text-black/);
  }
});

test('secondary/success/danger fills and toast stripes stay visible in dark mode', () => {
  // Bootstrap's dark mode keeps the base --bs-secondary/-success/-danger
  // tokens, which are dark so white badge text reads on them. Fill-only uses
  // -- the sign-up password strength bar and the admin funnel bar on the
  // progress track, the toast accent stripe on the body background -- need
  // light shades there (#3f6212 is 1.63:1 on the dark track).
  const DARK_PROGRESS_TRACK = '#343a40'; // Bootstrap dark --bs-secondary-bg
  const DARK_BODY = '#212529'; // Bootstrap dark --bs-body-bg, the toast background
  const LIGHT_PROGRESS_TRACK = '#e9ecef'; // Bootstrap light --bs-secondary-bg
  const css = buildCss(normalizeThemeCatalog({}));
  for (const name of ['secondary', 'success', 'danger']) {
    const token = declaration(css, LIGHT_ROOT, `--bs-${name}`);
    assertContrast(token, LIGHT_PROGRESS_TRACK, AA_NON_TEXT, `light .bg-${name}`);
    const fill = declaration(THEME_CSS, `:root[data-bs-theme="dark"] .bg-${name}`, 'background-color')
      .replace('var(--bs-bg-opacity)', '1');
    for (const surface of [DARK_PROGRESS_TRACK, DARK_BODY]) assertContrast(fill, surface, AA_NON_TEXT, `dark .bg-${name}`);
  }

  // ui-feedback.js builds the toast stylesheet from string literals as well.
  const toastCss = [
    ...read('ui-feedback.js').match(/style\.textContent = \[([\s\S]*?)\]\.join/)[1]
      .replace(/^\s*\/\/.*$/gm, '')
      .matchAll(/'((?:[^'\\]|\\.)*)'/g),
  ].map((match) => match[1]).join('');
  for (const tone of ['success', 'danger']) {
    const light = resolve(css, declaration(toastCss, `.ui-toast--${tone}`, 'border-left-color'), LIGHT_ROOT);
    assertContrast(light, WHITE, AA_NON_TEXT, `light .ui-toast--${tone} stripe`);
    const dark = declaration(toastCss, `:root[data-bs-theme="dark"] .ui-toast--${tone}`, 'border-left-color');
    assertContrast(dark, DARK_BODY, AA_NON_TEXT, `dark .ui-toast--${tone} stripe`);
  }
});
