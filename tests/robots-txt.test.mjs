import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRobotsTxt,
  BASE_DISALLOWS,
} from '../netlify/functions/robots-txt.mjs';

const ALL_MODULES_ON = {
  blog: true, membership: true, gemabot: true, knowbot: true, forum: true,
};

const ALL_MODULES_OFF = {
  blog: false, membership: false, gemabot: false, knowbot: false, forum: false,
};

test('buildRobotsTxt opens with User-agent: * and Allow: /', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(txt.startsWith('User-agent: *\nAllow: /\n'));
});

test('buildRobotsTxt always emits every base Disallow line', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  for (const path of BASE_DISALLOWS) {
    assert.ok(
      txt.includes(`Disallow: ${path}`),
      `expected robots.txt to include Disallow: ${path}`,
    );
  }
});

test('buildRobotsTxt appends Disallow lines for disabled modules', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  assert.ok(txt.includes('Disallow: /blog.html'));
  assert.ok(txt.includes('Disallow: /blog.xml'));
  assert.ok(txt.includes('Disallow: /blog/'));
  assert.ok(txt.includes('Disallow: /member.html'));
  assert.ok(txt.includes('Disallow: /ai-agent.html'));
  assert.ok(txt.includes('Disallow: /searchbot.html'));
  assert.ok(txt.includes('Disallow: /forum.html'));
});

test('buildRobotsTxt omits module Disallow lines when modules are enabled', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(!txt.includes('Disallow: /blog.html'));
  assert.ok(!txt.includes('Disallow: /member.html'));
  assert.ok(!txt.includes('Disallow: /ai-agent.html'));
  assert.ok(!txt.includes('Disallow: /searchbot.html'));
  assert.ok(!txt.includes('Disallow: /forum.html'));
});

test('buildRobotsTxt deduplicates overlapping base and module Disallow paths', () => {
  const txt = buildRobotsTxt({
    siteOrigin: 'https://example.com',
    // Inject a duplicate by enabling membership=false (so /member.html appears)
    // and check no path appears twice across the file.
    modules: ALL_MODULES_OFF,
  });
  const lines = txt.split('\n').filter((line) => line.startsWith('Disallow:'));
  const unique = new Set(lines);
  assert.equal(lines.length, unique.size);
});

test('buildRobotsTxt emits a Sitemap line referencing the provided origin', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(txt.includes('\nSitemap: https://example.com/sitemap.xml\n'));
});

test('buildRobotsTxt selectively disallows only the modules that are disabled', () => {
  const txt = buildRobotsTxt({
    siteOrigin: 'https://example.com',
    modules: { ...ALL_MODULES_ON, forum: false },
  });
  assert.ok(txt.includes('Disallow: /forum.html'));
  assert.ok(!txt.includes('Disallow: /blog.html'));
  assert.ok(!txt.includes('Disallow: /member.html'));
});

test('buildRobotsTxt ends with a trailing newline', () => {
  const txt = buildRobotsTxt({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(txt.endsWith('\n'));
});
