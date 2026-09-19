import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// admin-reports.html shipped `.admin-render-overlay` markup that no stylesheet
// ever defined, so the blocking loading overlay rendered as an ordinary block
// above the navbar: a spinner band pushing the page down instead of covering
// the half-built dashboard. Nothing failed -- the page just looked broken.
// These tests pin the contract that overlay markup is actually styled, and
// that the reports overlay can always be dismissed again.

const repoUrl = (relativePath) => new URL(`../${relativePath}`, import.meta.url);
const read = (relativePath) => readFileSync(repoUrl(relativePath), 'utf8');

const THEME_CSS = read('theme.css');
const THEME_DEFERRED_CSS = read('theme-deferred.css');
const ADMIN_REPORTS_HTML = read('admin-reports.html');
const ADMIN_REPORTS_SCRIPT = read('page-scripts/admin-reports-1.js');

const htmlPages = [
  ...readdirSync(repoUrl('.')).filter((name) => name.endsWith('.html')),
  ...readdirSync(repoUrl('src')).filter((name) => name.endsWith('.html')).map((name) => `src/${name}`),
];

function overlayClassNames(html) {
  const names = new Set();
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    for (const name of match[1].split(/\s+/)) {
      if (name.includes('overlay')) names.add(name);
    }
  }
  return [...names];
}

function pageStyleBlocks(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n');
}

function definesClass(css, className) {
  // A rule for the class, not a longer name that merely starts with it.
  return new RegExp(`\\.${className}(?![\\w-])`).test(css);
}

test('every overlay class in page markup has a rule somewhere the page loads', () => {
  for (const page of htmlPages) {
    const html = read(page);
    const available = `${THEME_CSS}\n${THEME_DEFERRED_CSS}\n${pageStyleBlocks(html)}`;
    for (const className of overlayClassNames(html)) {
      assert.ok(
        definesClass(available, className),
        `${page} uses .${className} but no stylesheet defines it, so the overlay renders as a plain block in the page flow.`,
      );
    }
  }
});

test('the admin reports overlay covers the page instead of sitting in its flow', () => {
  assert.match(ADMIN_REPORTS_HTML, /id="adminReportsLoadingOverlay"[^>]*class="admin-render-overlay"/);

  const rule = THEME_CSS.match(/\.admin-render-overlay\s*\{[^}]*\}/);
  assert.ok(rule, 'theme.css has no .admin-render-overlay rule');
  assert.match(rule[0], /position:\s*fixed/);
  assert.match(rule[0], /inset:\s*0/);
  assert.match(rule[0], /z-index:\s*var\(--z-overlay-page\)/);
});

test('the admin reports overlay is styled for the admin dark theme and hidden in print', () => {
  assert.match(THEME_CSS, /:root\[data-bs-theme="dark"\][^{]*\.admin-render-overlay\s*[,{]/);
  assert.match(THEME_DEFERRED_CSS, /\.admin-render-overlay,/);
});

test('a hung request cannot leave the reports overlay covering the dashboard', () => {
  // The overlay blocks every control on the page, "Back to admin" included,
  // so the requests behind it need a deadline and the release needs to run
  // whatever went wrong.
  assert.match(ADMIN_REPORTS_SCRIPT, /const REQUEST_TIMEOUT_MS = \d+;/);
  assert.match(ADMIN_REPORTS_SCRIPT, /controller\.abort\(\), REQUEST_TIMEOUT_MS\)/);
  assert.match(ADMIN_REPORTS_SCRIPT, /signal: controller \? controller\.signal : undefined/);

  const loadReports = ADMIN_REPORTS_SCRIPT.match(/async function loadReports\(\)[\s\S]*?\n      \}/);
  assert.ok(loadReports, 'loadReports() not found in the reports page script');
  assert.match(loadReports[0], /\}\s*finally\s*\{[\s\S]*hideAdminReportsLoadingOverlay\(\)/);
  // Nothing may run between entering loadReports() and the try that the
  // finally belongs to: a throw there would strand the overlay.
  assert.match(loadReports[0], /async function loadReports\(\)\s*\{\s*try\s*\{/);
});
