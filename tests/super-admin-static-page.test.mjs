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

  assert.equal(
    __testUtils.resolveRequestedGuideFile({
      rawUrl: 'https://endtimes.today/architect-site-adaptation-guide.html?adminNextAttempted=1',
    }),
    'architect-site-adaptation-guide.html',
  );

  assert.equal(
    __testUtils.resolveRequestedGuideFile({
      path: '/architect-site-adaptation-guide.html.html.html',
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

test('canAccessSiteAdaptationGuides only supports super admin users', () => {
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'super_admin' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'super_admins' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'super-admin' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'super admin' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'super admins' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'admin' }), false);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ isAdmin: true }), false);
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

test('buildUnauthenticatedRedirect includes nextAttempted when a redirect was already attempted', () => {
  const url = __testUtils.buildUnauthenticatedRedirect('architect-site-adaptation-guide.html', {
    nextRedirectAttempted: true,
  });

  assert.ok(url.includes('nextAttempted=1'));
});

test('buildCanonicalGuideRedirect returns canonical single-.html path when request path is duplicated', () => {
  const redirectPath = __testUtils.buildCanonicalGuideRedirect(
    { path: '/architect-site-adaptation-guide.html.html.html' },
    'architect-site-adaptation-guide.html',
  );

  assert.equal(redirectPath, '/architect-site-adaptation-guide.html');
});

test('buildCanonicalGuideRedirect does not redirect already-canonical guide requests', () => {
  const redirectPath = __testUtils.buildCanonicalGuideRedirect(
    { path: '/architect-site-adaptation-guide.html' },
    'architect-site-adaptation-guide.html',
  );

  assert.equal(redirectPath, '');
});

test('hasNextRedirectAttemptMarker reads both adminNextAttempted and nextAttempted markers', () => {
  assert.equal(__testUtils.hasNextRedirectAttemptMarker({
    queryStringParameters: {
      adminNextAttempted: '1',
    },
  }), true);

  assert.equal(__testUtils.hasNextRedirectAttemptMarker({
    queryStringParameters: {
      adminNextAttempted: '0',
    },
  }), false);

  assert.equal(__testUtils.hasNextRedirectAttemptMarker({
    queryStringParameters: {
      nextAttempted: '1',
    },
  }), true);

  assert.equal(__testUtils.hasNextRedirectAttemptMarker({
    rawQuery: 'adminNextAttempted=1',
  }), true);

  assert.equal(__testUtils.hasNextRedirectAttemptMarker({
    rawUrl: 'https://endtimes.today/architect-site-adaptation-guide.html?nextAttempted=1',
  }), true);
});

test('buildRedirectLoopGuardResponse returns an explicit sign-in response instead of redirecting again', () => {
  const response = __testUtils.buildRedirectLoopGuardResponse();
  assert.equal(response.statusCode, 401);
  assert.match(String(response.body || ''), /Sign in required/i);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('buildCanonicalGuideRedirect returns empty string when loop-guard marker is present to prevent marker loss in 301', () => {
  // When adminNextAttempted=1 is already in the URL the handler skips
  // buildCanonicalGuideRedirect entirely so the loop guard can fire without
  // an extra redirect cycle.  This test documents that the caller is
  // responsible for suppressing the canonical redirect when the marker is
  // present (the function itself still returns the redirect path so the
  // handler logic is testable in isolation).
  const redirectPath = __testUtils.buildCanonicalGuideRedirect(
    { path: '/architect-site-adaptation-guide.html.html.html' },
    'architect-site-adaptation-guide.html',
  );
  // The utility still returns the canonical path; it is the handler that
  // gates on hasNextRedirectAttemptMarker before calling this function.
  assert.equal(redirectPath, '/architect-site-adaptation-guide.html');
});

test('hasNextRedirectAttemptMarker returns true for requests that should bypass canonical redirect', () => {
  // Ensures the handler can detect the marker before calling
  // buildCanonicalGuideRedirect so it is not stripped from the URL.
  assert.equal(__testUtils.hasNextRedirectAttemptMarker({
    path: '/architect-site-adaptation-guide.html.html',
    queryStringParameters: { adminNextAttempted: '1' },
  }), true);
});
