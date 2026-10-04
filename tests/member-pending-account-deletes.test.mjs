import test from 'node:test';
import assert from 'node:assert/strict';
import { neonConfig } from '@neondatabase/serverless';

import { handler as registerHandler } from '../netlify/functions/member-register.mjs';
import { handler as resendHandler } from '../netlify/functions/member-resend-verification.mjs';

// Only the nightly prune may delete a pending signup, and only once it has
// been abandoned. These drive the real unauthenticated handlers through a fake
// at Neon's HTTP boundary and record every statement they send, so a DELETE
// anywhere on the path shows up whatever helper issues it.
const ENV_KEYS = [
  'DATABASE_URL',
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  'SENDGRID_FROM_NAME',
  'SENDGRID_REPLY_TO_EMAIL',
  'PUBLIC_SITE_URL',
  'URL',
];
const PRIOR_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const PRIOR_FETCH_FUNCTION = neonConfig.fetchFunction;

test.after(() => {
  neonConfig.fetchFunction = PRIOR_FETCH_FUNCTION;
  for (const [key, value] of Object.entries(PRIOR_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

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

// A month-old pending signup whose link expired long ago: exactly what the
// identifier-based deletes used to remove.
const STALE_PENDING_MEMBER = {
  id: 'u-alice',
  username: 'alice',
  email: 'alice@example.com',
  status: 'pending',
  email_verified: false,
  created_at: '2026-08-01T00:00:00.000Z',
};

function installFakeDatabase({ verificationWindowClosed = false } = {}) {
  const queries = [];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
  neonConfig.fetchFunction = async (_url, init) => {
    const { query, params } = JSON.parse(init.body);
    queries.push({ query, params });
    let rows = [];
    if (/SELECT id, username, email(, status, email_verified, created_at)?\s+FROM users/.test(query)) {
      rows = [STALE_PENDING_MEMBER];
    } else if (/SELECT 1 AS verification_window_closed/.test(query) && verificationWindowClosed) {
      rows = [{ verification_window_closed: 1 }];
    }
    return new Response(JSON.stringify(neonResult(rows)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return {
    queries,
    userDeletes: () => queries.filter(({ query }) => /DELETE FROM users/.test(query)),
  };
}

function post(handler, body) {
  return handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.21' },
    body: JSON.stringify(body),
  });
}

test('a registration missing its email and password deletes nothing', async () => {
  const db = installFakeDatabase();

  // The stale-claim release ran before the input was validated, so this
  // request deleted alice's account and only then answered 400.
  const response = await post(registerHandler, { username: 'alice' });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(db.userDeletes(), []);
});

test('registering a name held by an expired pending signup is refused, not released', async () => {
  const db = installFakeDatabase();

  const response = await post(registerHandler, {
    username: 'alice',
    email: 'attacker@example.com',
    password: 'attacker-chosen-password',
  });
  const body = JSON.parse(response.body);

  // Releasing it let anyone take the name, or re-create the signup with their
  // own password for the owner to verify. The owner resends instead.
  assert.equal(response.statusCode, 409);
  assert.deepEqual(db.userDeletes(), []);
  assert.equal(db.queries.some(({ query }) => /INSERT INTO users/.test(query)), false);
  assert.match(body.error, /already exists/);
  assert.match(body.error, /fresh verification link/);
});

test('a resend for a month-old pending account issues a fresh link instead of deleting it', async () => {
  const db = installFakeDatabase();

  const response = await post(resendHandler, { identifier: 'alice' });

  assert.equal(response.statusCode, 200);
  // It used to delete the account first and still answer that a link was sent.
  assert.deepEqual(db.userDeletes(), []);
  const issued = db.queries.find(({ query }) => /INSERT INTO member_email_verification_requests/.test(query));
  assert.ok(issued, 'the pending account must get a new verification request');
  assert.ok(issued.params.includes(STALE_PENDING_MEMBER.id));
});

test('a month-old pending account our email already reached gets no new link', async () => {
  const db = installFakeDatabase({ verificationWindowClosed: true });

  const response = await post(resendHandler, { identifier: 'alice@example.com' });

  // The prune spares an account while its link is live, so a fresh link for
  // any age let whoever registered someone else's address re-send one weekly
  // and hold it for good. Past the retention window, once delivered, the
  // last link runs out and the prune takes the account.
  assert.equal(response.statusCode, 200);
  assert.match(JSON.parse(response.body).message, /If a pending account matches/);
  assert.equal(db.queries.some(({ query }) => /INSERT INTO member_email_verification_requests/.test(query)), false);
  assert.deepEqual(db.userDeletes(), []);
  const check = db.queries.find(({ query }) => /SELECT 1 AS verification_window_closed/.test(query));
  assert.ok(check, 'the resend must check the retention window');
  assert.match(check.query, /created_at <= NOW\(\) - \$\d+::interval/);
  assert.match(check.query, /r\.email_delivered = TRUE/);
  const audit = db.queries.find(({ query, params }) => /INSERT INTO request_audit_log/.test(query) && params.includes('refresh_window_closed'));
  assert.ok(audit, 'the refusal is recorded for admins');
});
