import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

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

// The seeded owner account used to be written with ON CONFLICT (username) DO
// UPDATE SET password_hash = EXCLUDED.password_hash, so every cold start put
// the committed hash back: a reset or rotation of KevAdmin's password lasted
// until the next deploy. A fresh copy of the module stands in for a new lambda
// instance, since the bootstrap is memoized per instance.
let bootstrapColdStarts = 0;
async function coldStartBootstrap(sql) {
  bootstrapColdStarts += 1;
  const module = await import(`../netlify/functions/_admin.mjs?bootstrap-cold-start=${bootstrapColdStarts}`);
  const previousAdminUsername = process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_USERNAME;
  try {
    await module.syncBootstrapAdminUser(sql);
  } finally {
    if (previousAdminUsername !== undefined) process.env.ADMIN_USERNAME = previousAdminUsername;
  }
}

// A users table that applies the conflict clause the seed insert is written
// with, so the test checks the row the owner ends up with, not only SQL text.
function createUsersTable(rows) {
  const users = new Map(rows.map((row) => [row.username, { ...row }]));
  const sql = (strings, ...values) => {
    const text = strings.join('?');
    if (/INSERT INTO users \(id, username, password_hash, role, is_admin\)/.test(text)) {
      const [id, username, passwordHash, role] = values;
      const existing = users.get(username) || [...users.values()].find((user) => user.id === id);
      if (!existing) {
        users.set(username, { id, username, password_hash: passwordHash, role, is_admin: true });
      } else if (/DO UPDATE SET[^]*password_hash = EXCLUDED\.password_hash/.test(text)) {
        Object.assign(existing, { password_hash: passwordHash, role, is_admin: true });
      } else if (!/ON CONFLICT DO NOTHING/.test(text)) {
        return Promise.reject(new Error(`unexpected seed conflict handling: ${text}`));
      }
    }
    return Promise.resolve([]);
  };
  return { sql, users };
}

test('a cold start keeps the owner account\'s rotated password instead of restoring the seeded hash', async () => {
  const rotatedHash = 'scrypt$00112233445566778899aabbccddeeff$rotated';
  const { sql, users } = createUsersTable([
    { id: 'KevAdmin', username: 'KevAdmin', password_hash: rotatedHash, role: 'super_admin', is_admin: true },
  ]);

  await coldStartBootstrap(sql);

  assert.equal(users.get('KevAdmin').password_hash, rotatedHash);
  assert.equal(users.get('KevAdmin').role, 'super_admin');
});

test('an empty database still gets the seeded owner account', async () => {
  const { sql, users } = createUsersTable([]);

  await coldStartBootstrap(sql);

  const owner = users.get('KevAdmin');
  assert.ok(owner, 'the owner account is created');
  assert.match(owner.password_hash, /^scrypt\$/);
  assert.equal(owner.role, 'super_admin');
});

test('a renamed owner row that keeps the seeded id does not fail the cold start', async () => {
  const { sql, users } = createUsersTable([
    { id: 'KevAdmin', username: 'Kev', password_hash: 'scrypt$aa$bb', role: 'super_admin', is_admin: true },
  ]);

  await coldStartBootstrap(sql);

  assert.equal(users.size, 1);
  assert.equal(users.get('Kev').password_hash, 'scrypt$aa$bb');
});

// README tells people to run sql/admin_schema.sql to bootstrap a database. Its
// seed of the kevandmel admin -- same committed hash as KevAdmin, and the
// seeded posts are created_by it -- was ON CONFLICT (username) DO UPDATE SET
// password_hash = EXCLUDED.password_hash, so any re-run put the public hash
// back on a live admin account and undid a rotation.
test('no SQL bootstrap file resets an existing account\'s password', async () => {
  const sqlDir = new URL('../sql/', import.meta.url);
  const files = (await fs.readdir(sqlDir)).filter((name) => name.endsWith('.sql'));
  const userSeeds = [];
  for (const file of files) {
    const source = await fs.readFile(new URL(file, sqlDir), 'utf8');
    for (const [statement] of source.matchAll(/INSERT INTO users\b[^;]*;/gi)) {
      userSeeds.push({ file, statement });
    }
  }

  assert.ok(
    userSeeds.some(({ file, statement }) => file === 'admin_schema.sql' && /'kevandmel'/.test(statement)),
    'expected the kevandmel seed in admin_schema.sql',
  );
  for (const { file, statement } of userSeeds) {
    assert.doesNotMatch(statement, /DO\s+UPDATE/i, `${file}: a user seed must not update an existing row`);
    assert.match(statement, /ON CONFLICT DO NOTHING\s*;$/i, `${file}: a user seed must skip any existing row`);
  }
});
