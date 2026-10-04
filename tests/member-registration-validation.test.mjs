import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBER_PASSWORD_MAX_LENGTH,
  MEMBER_PASSWORD_MIN_LENGTH,
  MEMBER_USERNAME_PATTERN,
  buildInitialMemberPreferences,
  registerMember,
} from '../netlify/functions/_member.mjs';

// registerMember runs the schema bootstrap before it validates, so the stub has
// to answer every DDL statement. Returning an empty row set for everything is
// enough: the validation this file covers throws before the first real query,
// and `recorded` proves it never reached the INSERT.
function createSqlStub() {
  const recorded = [];
  const sql = (strings, ...values) => {
    recorded.push({ text: strings.join('?'), values });
    return Promise.resolve([]);
  };
  sql.recorded = recorded;
  sql.wrote = () => recorded.some((entry) => /INSERT INTO users/i.test(entry.text));
  return sql;
}

const VALID = {
  username: 'kev_777',
  email: 'kev@example.com',
  password: 'correct-horse',
};

async function expectRejection(overrides, messageMatch) {
  const sql = createSqlStub();
  await assert.rejects(
    () => registerMember(sql, { ...VALID, ...overrides }),
    (error) => {
      assert.equal(error.statusCode, 400, `expected a 400, got ${error.statusCode}`);
      assert.match(error.message, messageMatch);
      return true;
    },
  );
  assert.equal(sql.wrote(), false, 'rejected registration must not insert a user row');
}

// ---------- password floor ----------

test('registerMember rejects a password below the minimum length', async () => {
  await expectRejection({ password: 'short' }, /Password must be between 8 and 200 characters/);
});

test('registerMember rejects a password above the maximum length', async () => {
  await expectRejection({ password: 'a'.repeat(MEMBER_PASSWORD_MAX_LENGTH + 1) }, /Password must be between/);
});

test('registerMember rejects a non-string password instead of throwing from the hasher', async () => {
  // A JSON body of {"password":{}} used to reach hashPassword and come back as a
  // 500 carrying Node's raw ERR_INVALID_ARG_TYPE text.
  await expectRejection({ password: {} }, /Password must be between/);
  await expectRejection({ password: 12345678 }, /Password must be between/);
});

test('registerMember accepts a password exactly at the minimum length', async () => {
  const sql = createSqlStub();
  // The stub reports no existing user and no inserted row, so this gets past
  // validation and fails later -- which is the point: not on the password.
  await assert.rejects(
    () => registerMember(sql, { ...VALID, password: 'a'.repeat(MEMBER_PASSWORD_MIN_LENGTH) }),
    (error) => {
      assert.doesNotMatch(String(error.message), /Password must be between/);
      return true;
    },
  );
});

// ---------- username charset ----------

test('registerMember rejects usernames the badge routes cannot serve', async () => {
  // public-badge, badge-share and badge-share-image all enforce
  // /^[A-Za-z0-9._-]{1,40}$/, and member.html builds share links as /b/<username>.
  for (const username of ['Kev Smith', 'kev@home', 'kèv', 'kev/../admin', 'ke', 'a'.repeat(41)]) {
    await expectRejection({ username }, /Username must be 3-40 characters/);
  }
});

test('registerMember accepts the usernames the badge routes accept', async () => {
  for (const username of ['kev', 'kev_777', 'kev.smith', 'kev-smith', 'A'.repeat(40)]) {
    assert.equal(MEMBER_USERNAME_PATTERN.test(username), true, `${username} should be valid`);
  }
});

test('MEMBER_USERNAME_PATTERN is a subset of what the badge endpoints accept', () => {
  const badgePattern = /^[A-Za-z0-9._-]{1,40}$/;
  for (const username of ['kev', 'kev_777', 'kev.smith', 'kev-smith', 'A'.repeat(40)]) {
    assert.equal(
      MEMBER_USERNAME_PATTERN.test(username) && badgePattern.test(username),
      MEMBER_USERNAME_PATTERN.test(username),
      `${username} passes signup but not the badge routes`,
    );
  }
});

// ---------- username uniqueness ignores case ----------

// Answers the duplicate check the way Postgres would for whichever comparison
// the query asks for, so an exact-match lookup is caught letting a twin through.
function createUsersTableStub(existingUsernames) {
  const recordOnly = createSqlStub();
  const sql = (strings, ...values) => {
    const result = recordOnly(strings, ...values);
    const lookup = /FROM users\s+WHERE (LOWER\(username\) = LOWER\(\?\)|username = \?)/i.exec(strings.join('?'));
    if (!lookup) {
      return result;
    }
    const candidate = String(values[0]);
    const caseInsensitive = lookup[1].startsWith('LOWER');
    const match = existingUsernames.find((username) => (caseInsensitive
      ? username.toLowerCase() === candidate.toLowerCase()
      : username === candidate));
    return Promise.resolve(match ? [{ id: `id-${match}`, username: match, email: `${match}@example.com` }] : []);
  };
  sql.wrote = recordOnly.wrote;
  return sql;
}

async function expectTaken(sql, username) {
  await assert.rejects(
    () => registerMember(sql, { ...VALID, username }),
    (error) => {
      assert.equal(error.statusCode, 409, `${username}: expected a 409, got ${error.statusCode} (${error.message})`);
      assert.match(error.message, /already exists/);
      return true;
    },
  );
  assert.equal(sql.wrote(), false, `${username} must not insert a user row`);
}

async function withStaffEnv(overrides, run) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('registerMember refuses a username that differs from an existing one only in case', async () => {
  // The badge routes resolve /b/<username> case-insensitively, so "johnsmith"
  // beside "JohnSmith" made the original member's share page ambiguous.
  for (const username of ['johnsmith', 'JOHNSMITH', 'johnSmith']) {
    await expectTaken(createUsersTableStub(['JohnSmith']), username);
  }
});

test('registerMember refuses the staff usernames in any letter case', async () => {
  // Registering "kevadmin" used to succeed, and the bootstrap's case-folded
  // promotion then made that account a super admin on the next cold start.
  for (const username of ['KevAdmin', 'kevadmin', 'KEVADMIN']) {
    await expectTaken(createUsersTableStub([]), username);
  }

  await withStaffEnv({ SUPER_ADMIN_USERNAMES: 'Moderator, Editor', ADMIN_USERNAME: 'SiteOps' }, async () => {
    for (const username of ['moderator', 'EDITOR', 'siteops', 'SiteOps']) {
      await expectTaken(createUsersTableStub([]), username);
    }
  });
});

test('registerMember still lets a genuinely new username past the duplicate check', async () => {
  const sql = createUsersTableStub(['JohnSmith']);
  // Nothing matches, so the stub's empty INSERT result fails later -- but not
  // with the duplicate-username 409.
  await assert.rejects(
    () => registerMember(sql, { ...VALID, username: 'john.smith' }),
    (error) => {
      assert.notEqual(error.statusCode, 409);
      return true;
    },
  );
  assert.equal(sql.wrote(), true, 'a free username should reach the INSERT');
});

// ---------- blog opt-in ----------

test('buildInitialMemberPreferences records the signup blog opt-in alongside the learning-path intent', () => {
  assert.deepEqual(buildInitialMemberPreferences({}), {});
  assert.deepEqual(buildInitialMemberPreferences({ blogSubscribe: true }), { blogSubscriptionPending: true });
  // Only a real boolean counts; a stray string from a hand-written POST does not.
  assert.deepEqual(buildInitialMemberPreferences({ blogSubscribe: 'yes' }), {});
  assert.deepEqual(
    buildInitialMemberPreferences({ signupSource: 'learning_path_level_0', blogSubscribe: true }),
    { learningPathStep1Intent: true, blogSubscriptionPending: true },
  );
});

test('registerMember keeps the blog opt-in on the new profile, not only in the signup browser', async () => {
  // The checkbox used to be remembered in that browser's localStorage alone,
  // so verifying and signing in on another device dropped it silently.
  const recordOnly = createSqlStub();
  const sql = (strings, ...values) => {
    recordOnly(strings, ...values);
    const text = strings.join('?');
    if (/INSERT INTO users/i.test(text)) {
      return Promise.resolve([{ id: values[0], username: values[1], email: values[2], display_name: values[3], membership_level: 'free', status: 'pending', email_verified: false }]);
    }
    if (/INSERT INTO member_profiles/i.test(text)) {
      return Promise.resolve([{ user_id: values[0], preferences: JSON.parse(values[1]) }]);
    }
    return Promise.resolve([]);
  };

  const registration = await registerMember(sql, { ...VALID, blogSubscribe: true });
  assert.deepEqual(registration.profile.preferences, { blogSubscriptionPending: true });
  const profileInsert = recordOnly.recorded.find((entry) => /INSERT INTO member_profiles/i.test(entry.text));
  assert.deepEqual(JSON.parse(profileInsert.values[1]), { blogSubscriptionPending: true });
});
