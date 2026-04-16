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
