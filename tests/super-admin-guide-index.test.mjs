import assert from 'node:assert/strict';
import test from 'node:test';

import { __testUtils } from '../netlify/functions/super-admin-guide-index.mjs';

test('toDisplayName formats adaptation guide names for the dropdown', () => {
  assert.equal(
    __testUtils.toDisplayName('architect-site-adaptation-guide.html'),
    'Architect Site Adaptation Guide',
  );

  assert.equal(
    __testUtils.toDisplayName('my-custom-site-adaptation-guide.html'),
    'My Custom Site Adaptation Guide',
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
  assert.equal(__testUtils.canAccessSiteAdaptationGuides(null), false);
});
