import assert from 'node:assert/strict';
import test from 'node:test';

import { __testUtils } from '../netlify/functions/super-admin-static-page.mjs';

test('resolveRequestedGuideFile accepts valid guide file names', () => {
  assert.equal(
    __testUtils.resolveRequestedGuideFile({
      path: '/architect-site-adaptation-guide.html',
    }),
    'architect-site-adaptation-guide.html',
  );

  assert.equal(
    __testUtils.resolveRequestedGuideFile({
      queryStringParameters: { file: 'architect-site-adaptation-guide.html' },
    }),
    'architect-site-adaptation-guide.html',
  );
});

test('resolveRequestedGuideFile rejects traversal and non-guide files', () => {
  assert.equal(
    __testUtils.resolveRequestedGuideFile({
      queryStringParameters: { file: '../admin.html' },
    }),
    null,
  );

  assert.equal(
    __testUtils.resolveRequestedGuideFile({
      path: '/admin.html',
    }),
    null,
  );

  assert.equal(
    __testUtils.resolveRequestedGuideFile({
      queryStringParameters: { file: 'architect-site-adaptation-guide.md' },
    }),
    null,
  );
});

test('canAccessSiteAdaptationGuides supports admin and super admin users', () => {
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'super_admin' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'admin' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ isAdmin: true }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'member' }), false);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides(undefined), false);
});

test('hasAuthenticatedAdminSession distinguishes signed-in and anonymous visitors', () => {
  assert.equal(__testUtils.hasAuthenticatedAdminSession({ role: 'admin' }), true);
  assert.equal(__testUtils.hasAuthenticatedAdminSession({ role: 'member' }), true);
  assert.equal(__testUtils.hasAuthenticatedAdminSession(null), false);
  assert.equal(__testUtils.hasAuthenticatedAdminSession(undefined), false);
});

test('buildUnauthenticatedRedirect uses /admin (no .html) to prevent redirect loop', () => {
  const url = __testUtils.buildUnauthenticatedRedirect('architect-site-adaptation-guide.html');
  assert.ok(url.startsWith('/admin?'), 'redirect must start with /admin? not /admin.html?');
  assert.ok(!url.startsWith('/admin.html'), 'redirect must not use /admin.html which can trigger /:page loop');
  assert.ok(url.includes('next='), 'redirect must include next parameter');
  assert.ok(url.includes('architect-site-adaptation-guide.html'), 'redirect must preserve the guide filename');
});
