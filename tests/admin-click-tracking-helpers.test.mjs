import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNeverClickedElementsReport,
  extractAttribute,
  formatWindowLabel,
  normalizeButtonIdentity,
  normalizeDays,
  normalizeHours,
  normalizeLinkDestination,
  normalizePathname,
  stripHtml,
  toIsoDate,
} from '../netlify/functions/admin-click-tracking.mjs';

// ---------- normalizePathname ----------

test('normalizePathname returns "/" for empty/whitespace/nullish input', () => {
  assert.equal(normalizePathname(''), '/');
  assert.equal(normalizePathname('   '), '/');
  assert.equal(normalizePathname(null), '/');
  assert.equal(normalizePathname(undefined), '/');
});

test('normalizePathname extracts the path from a fully-qualified URL', () => {
  assert.equal(normalizePathname('https://gematria.today/blog.html?x=1'), '/blog.html');
});

test('normalizePathname strips query and hash for bare paths', () => {
  // When URL() succeeds against the base, it normalizes; this case goes through
  // the URL parser successfully.
  assert.equal(normalizePathname('/blog.html?x=1#anchor'), '/blog.html');
});

test('normalizePathname collapses repeated slashes inside the path', () => {
  // A leading "//" gets interpreted by URL() as a network-path-relative origin,
  // so test the in-path collapse with a single leading slash.
  assert.equal(normalizePathname('/foo//bar///baz'), '/foo/bar/baz');
});

test('normalizePathname ensures the path starts with a single leading slash', () => {
  assert.equal(normalizePathname('foo'), '/foo');
  assert.equal(normalizePathname('foo.html'), '/foo.html');
});

// ---------- normalizeLinkDestination ----------

test('normalizeLinkDestination rejects javascript: URLs and bare fragments', () => {
  // Critical security boundary: javascript: hrefs must never propagate into
  // the analytics ledger as "destinations" the report can highlight.
  assert.equal(normalizeLinkDestination('javascript:alert(1)'), '');
  assert.equal(normalizeLinkDestination('#section'), '');
  assert.equal(normalizeLinkDestination(''), '');
});

test('normalizeLinkDestination strips trailing .html and /index.html', () => {
  assert.equal(normalizeLinkDestination('/calculator.html'), '/calculator');
  assert.equal(normalizeLinkDestination('/subdir/index.html'), '/subdir/');
});

test('normalizeLinkDestination preserves the path for normal links', () => {
  assert.equal(normalizeLinkDestination('/tools.html'), '/tools');
  assert.equal(normalizeLinkDestination('/blog/some-post'), '/blog/some-post');
});

// ---------- normalizeButtonIdentity ----------

test('normalizeButtonIdentity lowercases, trims, and collapses whitespace', () => {
  assert.equal(normalizeButtonIdentity('   Submit   Now  '), 'submit now');
  assert.equal(normalizeButtonIdentity('Save\nProfile'), 'save profile');
});

test('normalizeButtonIdentity caps length at 180 characters', () => {
  const long = 'a'.repeat(500);
  assert.equal(normalizeButtonIdentity(long).length, 180);
});

test('normalizeButtonIdentity returns "" for empty/nullish input', () => {
  assert.equal(normalizeButtonIdentity(''), '');
  assert.equal(normalizeButtonIdentity(null), '');
  assert.equal(normalizeButtonIdentity(undefined), '');
});

// ---------- extractAttribute ----------

test('extractAttribute reads a quoted attribute value from a tag', () => {
  assert.equal(extractAttribute('<a id="cta-primary" href="/x">', 'id'), 'cta-primary');
  assert.equal(extractAttribute("<a id='cta-primary' href='/x'>", 'id'), 'cta-primary');
});

test('extractAttribute is case-insensitive on the attribute name', () => {
  assert.equal(extractAttribute('<a HREF="/x">', 'href'), '/x');
});

test('extractAttribute returns "" when the attribute is absent', () => {
  assert.equal(extractAttribute('<a href="/x">', 'id'), '');
});

// ---------- stripHtml (click-tracking variant) ----------

test('stripHtml removes all tags and collapses whitespace', () => {
  assert.equal(stripHtml('<p>Hello <strong>world</strong></p>'), 'Hello world');
});

test('stripHtml trims surrounding whitespace', () => {
  assert.equal(stripHtml('   <span>x</span>   '), 'x');
});

test('stripHtml tolerates empty/nullish input', () => {
  assert.equal(stripHtml(''), '');
  assert.equal(stripHtml(null), '');
});

// ---------- normalizeDays / normalizeHours (allow-listed windows) ----------

test('normalizeDays accepts every allow-listed day window', () => {
  for (const value of [1, 7, 30, 60, 90, 365]) {
    assert.equal(normalizeDays(String(value)), value);
  }
});

test('normalizeDays falls back to 30 for unknown or non-numeric input', () => {
  assert.equal(normalizeDays('15'), 30); // 15 is NOT in the allow list
  assert.equal(normalizeDays('abc'), 30);
  assert.equal(normalizeDays(null), 30);
  assert.equal(normalizeDays(undefined), 30);
  assert.equal(normalizeDays(''), 30);
});

test('normalizeHours accepts every allow-listed hour window', () => {
  for (const value of [1, 6, 12]) {
    assert.equal(normalizeHours(String(value)), value);
  }
});

test('normalizeHours returns null (signaling "use days") for unknown/missing input', () => {
  assert.equal(normalizeHours(''), null);
  assert.equal(normalizeHours('24'), null);
  assert.equal(normalizeHours('abc'), null);
  assert.equal(normalizeHours(null), null);
});

// ---------- toIsoDate ----------

test('toIsoDate returns an ISO-8601 string for valid Date input', () => {
  assert.equal(toIsoDate('2025-01-15T12:34:56Z'), '2025-01-15T12:34:56.000Z');
});

test('toIsoDate returns null for falsy input', () => {
  assert.equal(toIsoDate(null), null);
  assert.equal(toIsoDate(undefined), null);
  assert.equal(toIsoDate(''), null);
});

test('toIsoDate returns null for unparseable input rather than throwing', () => {
  assert.equal(toIsoDate('not a date'), null);
});

// ---------- formatWindowLabel ----------

test('formatWindowLabel prefers the hours variant when hours is set', () => {
  assert.equal(formatWindowLabel({ hours: 1 }), 'Last 1 hour');
  assert.equal(formatWindowLabel({ hours: 6 }), 'Last 6 hours');
  assert.equal(formatWindowLabel({ hours: 12 }), 'Last 12 hours');
});

test('formatWindowLabel renders the documented day windows with human-readable labels', () => {
  assert.equal(formatWindowLabel({ days: 1 }), 'Last 24 hours');
  assert.equal(formatWindowLabel({ days: 7 }), 'Last 7 days');
  assert.equal(formatWindowLabel({ days: 30 }), 'Last 30 days');
  assert.equal(formatWindowLabel({ days: 60 }), 'Last 60 days');
  assert.equal(formatWindowLabel({ days: 90 }), 'Last 90 days');
  assert.equal(formatWindowLabel({ days: 365 }), 'Last 365 days');
});

test('formatWindowLabel falls back to the "Last N days" template for unknown day values', () => {
  assert.equal(formatWindowLabel({ days: 42 }), 'Last 42 days');
});

// ---------- buildNeverClickedElementsReport ----------

test('buildNeverClickedElementsReport returns every trackable when no clicks have been recorded', () => {
  const trackable = [
    { pagePath: '/', elementType: 'a', destination: '/calculator', descriptor: 'calc', label: 'Calculator' },
    { pagePath: '/', elementType: 'button', destination: '', descriptor: 'submit', label: 'Submit' },
  ];
  assert.deepEqual(buildNeverClickedElementsReport([], trackable), trackable);
});

test('buildNeverClickedElementsReport removes link elements whose page+destination matches a click', () => {
  const trackable = [
    { pagePath: '/', elementType: 'a', destination: '/calculator', descriptor: 'calc', label: 'Calculator' },
    { pagePath: '/', elementType: 'a', destination: '/tools', descriptor: 'tools', label: 'Tools' },
  ];
  const clicks = [
    { page_path: '/', element_type: 'a', destination: '/calculator.html' /* matches after stripping .html */ },
  ];
  const result = buildNeverClickedElementsReport(clicks, trackable);
  assert.equal(result.length, 1);
  assert.equal(result[0].destination, '/tools');
});

test('buildNeverClickedElementsReport removes button elements whose page+descriptor matches a click', () => {
  const trackable = [
    { pagePath: '/calculator', elementType: 'button', destination: '', descriptor: 'submit', label: 'Submit' },
    { pagePath: '/calculator', elementType: 'button', destination: '', descriptor: 'reset', label: 'Reset' },
  ];
  const clicks = [
    { page_path: '/calculator', element_type: 'button', element_id: 'Submit' /* normalized to "submit" */ },
  ];
  const result = buildNeverClickedElementsReport(clicks, trackable);
  assert.equal(result.length, 1);
  assert.equal(result[0].descriptor, 'reset');
});

test('buildNeverClickedElementsReport treats "input" element_type the same as "button" for matching', () => {
  const trackable = [
    { pagePath: '/contact', elementType: 'button', destination: '', descriptor: 'send', label: 'Send' },
  ];
  const clicks = [
    { page_path: '/contact', element_type: 'input', element_id: 'send' },
  ];
  assert.deepEqual(buildNeverClickedElementsReport(clicks, trackable), []);
});

test('buildNeverClickedElementsReport disambiguates clicks by page path', () => {
  // The same descriptor on a different page must NOT mark this element as clicked.
  const trackable = [
    { pagePath: '/blog', elementType: 'button', destination: '', descriptor: 'subscribe', label: 'Subscribe' },
  ];
  const clicks = [
    { page_path: '/tools', element_type: 'button', element_id: 'subscribe' },
  ];
  const result = buildNeverClickedElementsReport(clicks, trackable);
  assert.equal(result.length, 1);
});

test('buildNeverClickedElementsReport falls back to route when page_path is absent on the click row', () => {
  const trackable = [
    { pagePath: '/tools', elementType: 'a', destination: '/calculator', descriptor: 'calc', label: 'Calculator' },
  ];
  const clicks = [
    { route: '/tools', destination: '/calculator' },
  ];
  assert.deepEqual(buildNeverClickedElementsReport(clicks, trackable), []);
});

test('buildNeverClickedElementsReport falls back to element_link when destination is absent on the click row', () => {
  const trackable = [
    { pagePath: '/', elementType: 'a', destination: '/calculator', descriptor: 'calc', label: 'Calculator' },
  ];
  const clicks = [
    { page_path: '/', element_type: 'a', element_link: '/calculator.html' },
  ];
  assert.deepEqual(buildNeverClickedElementsReport(clicks, trackable), []);
});
