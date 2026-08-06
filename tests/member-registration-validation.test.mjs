import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBER_PASSWORD_MAX_LENGTH,
  MEMBER_PASSWORD_MIN_LENGTH,
  MEMBER_USERNAME_PATTERN,
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
