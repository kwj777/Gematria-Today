import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SITE_MODULES,
  DEFAULT_SITE_ORIGIN,
  normalizeSiteModules,
  normalizePublicSiteOrigin,
  buildModulePublicPaths,
} from '../netlify/functions/_site-modules.mjs';

test('normalizeSiteModules returns defaults when input is null/undefined', () => {
  assert.deepEqual(normalizeSiteModules(null), { ...DEFAULT_SITE_MODULES });
  assert.deepEqual(normalizeSiteModules(undefined), { ...DEFAULT_SITE_MODULES });
});

test('normalizeSiteModules returns defaults when input is not an object', () => {
  assert.deepEqual(normalizeSiteModules('not-an-object'), { ...DEFAULT_SITE_MODULES });
  assert.deepEqual(normalizeSiteModules(42), { ...DEFAULT_SITE_MODULES });
});

test('normalizeSiteModules coerces values to booleans', () => {
  const result = normalizeSiteModules({ forum: 1, blog: 0, gemabot: 'yes' });
  assert.equal(result.forum, true);
  assert.equal(result.blog, false);
  assert.equal(result.gemabot, true);
});

test('normalizeSiteModules preserves defaults for missing keys', () => {
  const result = normalizeSiteModules({ forum: false });
  assert.equal(result.forum, false);
  assert.equal(result.blog, DEFAULT_SITE_MODULES.blog);
  assert.equal(result.membership, DEFAULT_SITE_MODULES.membership);
});

test('normalizeSiteModules ignores unknown keys', () => {
  const result = normalizeSiteModules({ unknown_module: true });
  assert.equal(Object.hasOwn(result, 'unknown_module'), false);
});

test('normalizePublicSiteOrigin returns default when empty', () => {
  assert.equal(normalizePublicSiteOrigin(''), DEFAULT_SITE_ORIGIN);
  assert.equal(normalizePublicSiteOrigin('   '), DEFAULT_SITE_ORIGIN);
  assert.equal(normalizePublicSiteOrigin(), DEFAULT_SITE_ORIGIN);
});

test('normalizePublicSiteOrigin strips path and query, keeps protocol+host', () => {
  assert.equal(
    normalizePublicSiteOrigin('https://example.com/path?q=1'),
    'https://example.com',
  );
});

test('normalizePublicSiteOrigin rejects non-http(s) protocols', () => {
  assert.equal(normalizePublicSiteOrigin('javascript:alert(1)'), DEFAULT_SITE_ORIGIN);
  assert.equal(normalizePublicSiteOrigin('ftp://example.com'), DEFAULT_SITE_ORIGIN);
  assert.equal(normalizePublicSiteOrigin('file:///etc/passwd'), DEFAULT_SITE_ORIGIN);
});

test('normalizePublicSiteOrigin returns default for malformed URLs', () => {
  assert.equal(normalizePublicSiteOrigin('not a url'), DEFAULT_SITE_ORIGIN);
});

test('buildModulePublicPaths returns full set when all modules enabled', () => {
  const paths = buildModulePublicPaths({
    blog: true, membership: true, gemabot: true, knowbot: true, forum: true,
  });
  assert.ok(paths.includes('/blog.html'));
  assert.ok(paths.includes('/blog.xml'));
  assert.ok(paths.includes('/member.html'));
  assert.ok(paths.includes('/ai-agent.html'));
  assert.ok(paths.includes('/searchbot.html'));
  assert.ok(paths.includes('/forum.html'));
});

test('buildModulePublicPaths omits paths for disabled modules', () => {
  const paths = buildModulePublicPaths({
    blog: false, membership: false, gemabot: false, knowbot: false, forum: false,
  });
  assert.equal(paths.length, 0);
});

test('buildModulePublicPaths selectively includes paths per module', () => {
  const paths = buildModulePublicPaths({
    blog: true, membership: false, gemabot: false, knowbot: false, forum: false,
  });
  assert.deepEqual(paths, ['/blog.html', '/blog.xml']);
});

test('buildModulePublicPaths normalizes invalid input via normalizeSiteModules', () => {
  // null input -> defaults (all true except google_analytics) -> full path set.
  const paths = buildModulePublicPaths(null);
  assert.ok(paths.includes('/blog.html'));
  assert.ok(paths.includes('/forum.html'));
});
