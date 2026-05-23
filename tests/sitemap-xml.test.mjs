import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSitemapXml,
  escapeXml,
  STATIC_PATHS,
} from '../netlify/functions/sitemap-xml.mjs';

const ALL_MODULES_ON = {
  blog: true, membership: true, gemabot: true, knowbot: true, forum: true,
};

const ALL_MODULES_OFF = {
  blog: false, membership: false, gemabot: false, knowbot: false, forum: false,
};

test('escapeXml escapes the five required XML entities', () => {
  assert.equal(
    escapeXml(`& < > " '`),
    '&amp; &lt; &gt; &quot; &apos;',
  );
});

test('escapeXml coerces non-string input via String() and applies default for undefined', () => {
  assert.equal(escapeXml(42), '42');
  assert.equal(escapeXml(undefined), '');
});

test('buildSitemapXml emits a valid xml declaration and urlset wrapper', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.trim().endsWith('</urlset>'));
});

test('buildSitemapXml includes every STATIC_PATH', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  for (const path of STATIC_PATHS) {
    const expectedLoc = path === '/' ? 'https://example.com/' : `https://example.com${path}`;
    assert.ok(
      xml.includes(`<loc>${expectedLoc}</loc>`),
      `expected sitemap to include <loc>${expectedLoc}</loc>`,
    );
  }
});

test('buildSitemapXml includes module-driven paths when modules are enabled', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  assert.ok(xml.includes('<loc>https://example.com/blog.html</loc>'));
  assert.ok(xml.includes('<loc>https://example.com/member.html</loc>'));
  assert.ok(xml.includes('<loc>https://example.com/ai-agent.html</loc>'));
  assert.ok(xml.includes('<loc>https://example.com/searchbot.html</loc>'));
  assert.ok(xml.includes('<loc>https://example.com/forum.html</loc>'));
});

test('buildSitemapXml omits module-driven paths when modules are disabled', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  assert.ok(!xml.includes('/blog.html'));
  assert.ok(!xml.includes('/member.html'));
  assert.ok(!xml.includes('/ai-agent.html'));
  assert.ok(!xml.includes('/searchbot.html'));
  assert.ok(!xml.includes('/forum.html'));
});

test('buildSitemapXml deduplicates overlapping static and module paths', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_ON });
  const blogMatches = xml.match(/<loc>https:\/\/example\.com\/blog\.html<\/loc>/g) || [];
  assert.equal(blogMatches.length, 1);
});

test('buildSitemapXml escapes XML special characters in the site origin', () => {
  const xml = buildSitemapXml({
    siteOrigin: 'https://example.com?evil=<script>',
    modules: ALL_MODULES_OFF,
  });
  assert.ok(!xml.includes('<script>'));
  assert.ok(xml.includes('&lt;script&gt;'));
});

test('buildSitemapXml renders root path as a single trailing slash', () => {
  const xml = buildSitemapXml({ siteOrigin: 'https://example.com', modules: ALL_MODULES_OFF });
  assert.ok(xml.includes('<loc>https://example.com/</loc>'));
});
