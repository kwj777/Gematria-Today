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
