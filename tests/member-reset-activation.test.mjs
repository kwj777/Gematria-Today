import test from 'node:test';
import assert from 'node:assert/strict';
import { neonConfig } from '@neondatabase/serverless';

import {
  authenticateMemberCredentials,
  deleteExpiredUnverifiedMembers,
} from '../netlify/functions/_member.mjs';
import { handler as accountRecoveryHandler } from '../netlify/functions/member-account-recovery.mjs';

// ---------- the unverified-member deletes spare paid and reset-proven rows ----------

function createSqlStub() {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve([]);
  };
  return { sql, calls, userDeletes: () => calls.filter((call) => call.text.includes('DELETE FROM users')) };
}

function assertSparesPaidAndResetMembers(text) {
  // A member who paid is not an abandoned signup, and the cascade from users
  // takes their history and forum threads with it while Stripe keeps billing.
  assert.match(text, /membership_level = 'free'/);
  assert.match(text, /stripe_customer_id IS NULL/);
  assert.match(text, /stripe_subscription_id IS NULL/);
  // Finishing a password reset proved the address. Accounts reset before the
  // reset activated them are still pending, so this is what protects them.
  assert.match(text, /NOT EXISTS \(\s*SELECT 1 FROM account_recovery_requests ar/);
  assert.match(text, /ar\.recovery_type = 'forgot-password'/);
  assert.match(text, /ar\.consumed_at IS NOT NULL/);
}

test('the nightly prune spares paid and reset-proven members, and their recovery table exists first', async () => {
  const stub = createSqlStub();
  await deleteExpiredUnverifiedMembers(stub.sql);

  const [del] = stub.userDeletes();
  assertSparesPaidAndResetMembers(del.text);

  // This is the first schema run in this process, so it went through the
  // stub. A fresh database must have the table before the prune reads it.
  const createIndex = stub.calls.findIndex((call) => /CREATE TABLE IF NOT EXISTS account_recovery_requests/.test(call.text));
  assert.ok(createIndex >= 0, 'ensureMemberSchema must create account_recovery_requests');
  assert.ok(createIndex < stub.calls.indexOf(del), 'the table has to exist before the delete reads it');
});

test('the nightly prune spares an account whose fresh verification link is still live', async () => {
  const stub = createSqlStub();
  await deleteExpiredUnverifiedMembers(stub.sql);

  // A member who resends on day 27 is emailed a link that works until day 34.
  // Measuring only from created_at deleted the account -- and the link with
  // it on cascade -- at the first midnight after day 30.
  const [del] = stub.userDeletes();
  assert.match(
    del.text,
    /AND NOT EXISTS \(\s*SELECT 1 FROM member_email_verification_requests r\s+WHERE r\.user_id = users\.id\s+AND r\.consumed_at IS NULL\s+AND r\.expires_at > NOW\(\)\s*\)/,
  );
});

test('a sign-in attempt deletes nothing, whatever the password', async () => {
  const stub = createSqlStub();
  // No row comes back, as for a wrong password; the attempt simply fails.
  assert.equal(await authenticateMemberCredentials(stub.sql, 'kev', 'not-the-password'), null);

  // It used to delete a month-old pending account matching the identifier
  // before the password was checked -- including the ones the nightly prune
  // keeps because our verification email never reached them.
  assert.equal(stub.userDeletes().length, 0);
});

// ---------- reset-password, driven through the real handler ----------

// The handler builds its own client from DATABASE_URL, so the fake sits at
// Neon's HTTP boundary instead. It answers only the statements the reset path
// issues; everything else (schema, rate limits, audit) gets no rows back.
function encodeValue(value) {
  if (value === null || value === undefined) return { oid: 25, text: null };
  if (typeof value === 'boolean') return { oid: 16, text: value ? 't' : 'f' };
  return { oid: 25, text: String(value) };
}

function neonResult(rows) {
  const names = rows.length ? Object.keys(rows[0]) : [];
  return {
    command: 'SELECT',
    rowCount: rows.length,
    fields: names.map((name) => ({ name, dataTypeID: encodeValue(rows[0][name]).oid })),
    rows: rows.map((row) => names.map((name) => encodeValue(row[name]).text)),
  };
}

function memberRow(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.username,
    membership_level: 'free',
    membership_started_at: null,
    membership_expires_at: null,
    stripe_customer_id: null,
    stripe_last_checkout_session_id: null,
    status: user.status,
    email_verified: user.email_verified,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

function answer(db, query, params) {
  const { user } = db;
  if (/UPDATE account_recovery_requests\s+SET consumed_at/.test(query)) {
    return params[1] === 'member' ? [{ id: 'rec-1', user_id: user.id, role: 'member', recovery_type: 'forgot-password' }] : [];
  }
  if (/SELECT status, email_verified\s+FROM users/.test(query)) {
    return [{ status: user.status, email_verified: user.email_verified }];
  }
  if (/DELETE FROM member_oauth_identities/.test(query)) {
    db.identities = [];
    return [];
  }
  if (/UPDATE users\s+SET password_hash/.test(query)) {
    // Apply what the statement says to the one row it targets, so the test
    // observes the stored result rather than only the SQL text.
    if (/status IN \('active', 'pending'\)/.test(query) && !['active', 'pending'].includes(user.status)) {
      return [];
    }
    user.password_hash = params[0];
    if (/email_verified = TRUE/.test(query)) user.email_verified = true;
    if (/status = CASE WHEN status = 'pending' THEN 'active' ELSE status END/.test(query) && user.status === 'pending') {
      user.status = 'active';
    }
    return [memberRow(user)];
  }
  if (/INSERT INTO member_profiles/.test(query)) {
    return [{ user_id: user.id, preferences: '{}', favorite_cipher: null, timezone: null }];
  }
  if (/INSERT INTO sessions/.test(query)) {
    db.sessions.push(params[1]);
    return [];
  }
  return [];
}

const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
const PRIOR_FETCH_FUNCTION = neonConfig.fetchFunction;

test.after(() => {
  neonConfig.fetchFunction = PRIOR_FETCH_FUNCTION;
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

async function resetPasswordFor(user) {
  const db = { user: { ...user }, identities: ['google:attacker-sub'], sessions: [] };
  process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
  neonConfig.fetchFunction = async (_url, init) => {
    const { query, params } = JSON.parse(init.body);
    return new Response(JSON.stringify(neonResult(answer(db, query, params))), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const response = await accountRecoveryHandler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ action: 'reset-password', recoveryCode: 'code-123', newPassword: 'a-new-password' }),
  });
  return { response, body: JSON.parse(response.body), db };
}

test('a reset on a pending account verifies the address and activates it before signing in', async () => {
  const { response, body, db } = await resetPasswordFor({
    id: 'u-1', username: 'kev', email: 'kev@example.com', status: 'pending', email_verified: false,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(body.authenticated, true);
  // Left pending, the account was signed in, could pay and post, and was
  // still deleted by the 30-day unverified-signup prune.
  assert.equal(db.user.status, 'active');
  assert.equal(db.user.email_verified, true);
  assert.equal(body.member.status, 'active');
  assert.equal(body.member.emailVerified, true);
  assert.equal(db.sessions.length, 1);
});

test('activating a never-verified account retires provider identities linked before the proof', async () => {
  const { response, db } = await resetPasswordFor({
    id: 'u-1', username: 'kev', email: 'kev@example.com', status: 'pending', email_verified: false,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(db.identities, []);
});

test('a reset on an already verified account leaves its linked identities alone', async () => {
  const { response, db } = await resetPasswordFor({
    id: 'u-1', username: 'kev', email: 'kev@example.com', status: 'active', email_verified: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.user.status, 'active');
  assert.deepEqual(db.identities, ['google:attacker-sub']);
});

for (const status of ['suspended', 'deleted']) {
  test(`a reset code does not sign in a ${status} account`, async () => {
    const { response, body, db } = await resetPasswordFor({
      id: 'u-1', username: 'kev', email: 'kev@example.com', status, email_verified: true,
    });

    // Login refuses these accounts; the reset used to mint a session anyway.
    assert.equal(response.statusCode, 403);
    assert.match(body.error, new RegExp(status));
    assert.equal(db.sessions.length, 0);
    assert.equal(db.user.password_hash, undefined);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.match(response.multiValueHeaders['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
  });
}
