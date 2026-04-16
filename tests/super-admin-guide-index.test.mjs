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

test('canAccessSiteAdaptationGuides supports admin and super admin users', () => {
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'super_admin' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'admin' }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ is_admin: true }), true);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides({ role: 'member' }), false);
  assert.equal(__testUtils.canAccessSiteAdaptationGuides(null), false);
});
