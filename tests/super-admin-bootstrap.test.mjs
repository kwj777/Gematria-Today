import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSuperAdminUsernames,
  isReservedStaffUsername,
  syncBootstrapAdminUser,
} from '../netlify/functions/_admin.mjs';

// ---------- getSuperAdminUsernames ----------

test('getSuperAdminUsernames always includes the seeded KevAdmin account', () => {
  assert.deepEqual(getSuperAdminUsernames({}), ['KevAdmin']);
});

test('getSuperAdminUsernames keeps configured names exactly as written', () => {
  // The promotion matches these exactly, so lowercasing them here would both
  // miss the real account and hit a member's case twin.
  assert.deepEqual(
    getSuperAdminUsernames({ SUPER_ADMIN_USERNAMES: ' Moderator ,KevAdmin,, Editor' }),
    ['KevAdmin', 'Moderator', 'Editor'],
  );
});

// ---------- isReservedStaffUsername ----------

test('isReservedStaffUsername reserves the seeded staff account in any case', () => {
  for (const username of ['KevAdmin', 'kevadmin', 'KEVADMIN', ' kevAdmin ']) {
    assert.equal(isReservedStaffUsername(username, {}), true, `${username} should be reserved`);
  }
});

test('isReservedStaffUsername reserves the configured super admin and admin names in any case', () => {
  const env = { SUPER_ADMIN_USERNAMES: 'Moderator, Editor', ADMIN_USERNAME: 'SiteOps' };
  for (const username of ['moderator', 'EDITOR', 'siteops', 'SiteOps']) {
    assert.equal(isReservedStaffUsername(username, env), true, `${username} should be reserved`);
  }
});

test('isReservedStaffUsername leaves ordinary member names alone', () => {
  const env = { SUPER_ADMIN_USERNAMES: 'Moderator', ADMIN_USERNAME: '' };
  for (const username of ['kev', 'kevadmin2', 'moderators', '', null, undefined]) {
    assert.equal(isReservedStaffUsername(username, env), false, `${username} should not be reserved`);
  }
});

// ---------- syncBootstrapAdminUser ----------

test('the cold-start super admin promotion matches exact names and only escalates staff', async () => {
  // It used to run WHERE LOWER(username) = ANY(lowercased names), and usernames
  // are only unique case-sensitively, so a member who registered "kevadmin"
  // became a super admin on the next cold start.
  const recorded = [];
  const sql = (strings, ...values) => {
    recorded.push({ text: strings.join('?'), values });
    return Promise.resolve([]);
  };

  const previous = {
    SUPER_ADMIN_USERNAMES: process.env.SUPER_ADMIN_USERNAMES,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  };
  process.env.SUPER_ADMIN_USERNAMES = 'Moderator';
  delete process.env.ADMIN_USERNAME;
  try {
    await syncBootstrapAdminUser(sql);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  const promotions = recorded.filter(({ text }) => /SET role = 'super_admin'/i.test(text));
  assert.equal(promotions.length, 1, 'expected exactly one super admin promotion');
  const [promotion] = promotions;
  const where = promotion.text.slice(promotion.text.search(/\bWHERE\b/i));

  assert.doesNotMatch(where, /LOWER\(/i, 'the promotion must not fold case');
  assert.match(where, /\busername = ANY\(\?\)/i);
  assert.deepEqual(promotion.values, [['KevAdmin', 'Moderator']], 'names are passed exactly as configured');
  assert.match(
    where,
    /AND \(role IN \('admin', 'super_admin'\) OR COALESCE\(is_admin, FALSE\) = TRUE\)/i,
    'only an account that is already staff may be escalated',
  );
});
