import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { DOCUMENT_SECURITY_HEADERS, documentSecurityHeaders } from '../netlify/functions/_security.mjs';

// Netlify applies the [[headers]] rules in netlify.toml to files served from
// the publish directory. Responses proxied from a function bypass them
// entirely, so /w/:word, /v/:value and the words sitemaps shipped with no CSP
// and no X-Frame-Options until the function started sending them itself.
//
// That means the header set now lives in two places. These tests fail if they
// drift apart, so netlify.toml stays the single source of truth in practice.

async function readSiteWideHeaderBlock() {
  const toml = await fs.readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const start = toml.indexOf('[[headers]]\n  for = "/*"');
  assert.notEqual(start, -1, 'netlify.toml no longer has a `for = "/*"` headers block');
  // The block runs until the next top-level table.
  const rest = toml.slice(start + '[[headers]]'.length);
  const end = rest.search(/\n\[\[?[a-z]/i);
  return end === -1 ? rest : rest.slice(0, end);
}

function readTomlHeader(block, name) {
  // Values are single-line, double-quoted TOML strings.
  const match = new RegExp(`^\\s*${name}\\s*=\\s*"(.*)"\\s*$`, 'm').exec(block);
  assert.ok(match, `netlify.toml no longer sets ${name} for /*`);
  return match[1];
}

test('every document security header matches netlify.toml', async () => {
  const block = await readSiteWideHeaderBlock();
  const tomlNameByHeader = {
    'x-frame-options': 'X-Frame-Options',
    'x-content-type-options': 'X-Content-Type-Options',
    'referrer-policy': 'Referrer-Policy',
    'strict-transport-security': 'Strict-Transport-Security',
    'cross-origin-opener-policy': 'Cross-Origin-Opener-Policy',
    'cross-origin-resource-policy': 'Cross-Origin-Resource-Policy',
    'permissions-policy': 'Permissions-Policy',
    'content-security-policy': 'Content-Security-Policy',
  };

  for (const [header, tomlName] of Object.entries(tomlNameByHeader)) {
    assert.equal(
      DOCUMENT_SECURITY_HEADERS[header],
      readTomlHeader(block, tomlName),
      `${header} drifted from netlify.toml's ${tomlName}`,
    );
  }

  // Guard the other direction too: a header added to netlify.toml but not here
  // would silently apply to static pages only.
  assert.deepEqual(
    Object.keys(DOCUMENT_SECURITY_HEADERS).sort(),
    Object.keys(tomlNameByHeader).sort(),
  );
});

test('documentSecurityHeaders lets callers add content-type without dropping the set', () => {
  const headers = documentSecurityHeaders({ 'content-type': 'text/html; charset=UTF-8' });
  assert.equal(headers['content-type'], 'text/html; charset=UTF-8');
  assert.equal(headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(headers['content-security-policy'], /default-src 'self'/);
});

test('the shared header object cannot be mutated by a caller', () => {
  const headers = documentSecurityHeaders();
  headers['x-frame-options'] = 'ALLOWALL';
  assert.equal(DOCUMENT_SECURITY_HEADERS['x-frame-options'], 'SAMEORIGIN');
});

test('function-rendered documents send the security headers', async () => {
  // Cheaper than booting the function: assert the response builders route
  // through the shared helper rather than hand-rolling a headers object.
  for (const file of ['word-page.mjs', 'sitemap-words-xml.mjs']) {
    const source = await fs.readFile(new URL(`../netlify/functions/${file}`, import.meta.url), 'utf8');
    assert.match(source, /documentSecurityHeaders\(/, `${file} does not send the document security headers`);
    assert.doesNotMatch(
      source,
      /headers:\s*\{\s*'content-type'/,
      `${file} still builds a bare headers object somewhere — route it through documentSecurityHeaders()`,
    );
  }
});
