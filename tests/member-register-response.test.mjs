import test from 'node:test';
import assert from 'node:assert/strict';

import { handler as registerHandler } from '../netlify/functions/member-register.mjs';

// Runs the real member-register handler end to end. getSqlClient() builds a
// real neon() client, and the neon HTTP driver posts each query to the
// database host through the global fetch -- so stubbing fetch stands in for
// both Neon and SendGrid without touching the handler's own code path.
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
const PRIOR_FETCH = globalThis.fetch;

test.after(() => {
  globalThis.fetch = PRIOR_FETCH;
  for (const [key, value] of Object.entries(PRIOR_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// Neon's HTTP wire format: column descriptors plus rows of raw text values,
// which the driver parses by Postgres type id.
function toNeonResult(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const typeOf = (value) => {
    if (typeof value === 'boolean') return 16;
    if (typeof value === 'number') return 23;
    if (value && typeof value === 'object') return 3802;
    return 25;
  };
  const encode = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? 't' : 'f';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  return {
    fields: columns.map((name) => ({ name, dataTypeID: typeOf(rows[0][name]) })),
    rows: rows.map((row) => columns.map((name) => encode(row[name]))),
  };
}

function routeQuery(query, params) {
  if (/INSERT INTO request_rate_limits/i.test(query)) {
    return [{ count: 1, window_started_at: '2026-01-01T00:00:00.000Z', blocked_until: null }];
  }
  if (/INSERT INTO users/i.test(query)) {
    return [{
      id: params[0],
      username: params[1],
      email: params[2],
      display_name: params[3],
      role: 'member',
      membership_level: 'free',
      status: 'pending',
      email_verified: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }];
  }
  if (/INSERT INTO member_profiles/i.test(query)) {
    return [{
      user_id: params[0],
      preferences: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }];
  }
  // Schema DDL, settings lookups, audit inserts and the "already taken" check
  // all come back empty: no existing member, no stored SendGrid settings.
  return [];
}

function installFakeBackends({ sendgridStatus }) {
  const sentEmails = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('api.sendgrid.com')) {
      sentEmails.push(JSON.parse(init.body));
      return new Response(sendgridStatus === 202 ? '' : '{"errors":[{"message":"quota exceeded"}]}', { status: sendgridStatus });
    }
    const body = JSON.parse(init.body);
    if (Array.isArray(body.queries)) {
      return Response.json({ results: body.queries.map((q) => toNeonResult(routeQuery(q.query, q.params))) });
    }
    return Response.json(toNeonResult(routeQuery(body.query, body.params)));
  };
  return { sentEmails };
}

function configureEnv({ sendgrid }) {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.DATABASE_URL = 'postgres://user:pass@neon.invalid/neondb';
  process.env.PUBLIC_SITE_URL = 'https://gematria.today';
  if (sendgrid) {
    process.env.SENDGRID_API_KEY = 'SG.test';
    process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';
  }
}

async function registerSomeoneElsesAddress() {
  const response = await registerHandler({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({
      username: 'attacker1',
      email: 'victim@example.com',
      password: 'attacker-chosen-password',
    }),
  });
  return { response, body: JSON.parse(response.body) };
}

// Anyone can POST any address here. Whatever comes back must not let them
// prove they own it: the link sets email_verified and status='active', and
// _oauth.mjs only retires the registrant's password on Google linking while
// the row is still unverified.
function assertNoVerificationCredential(response, body) {
  assert.equal(response.statusCode, 201);
  assert.equal('verificationUrl' in body, false);
  assert.doesNotMatch(response.body, /verify_email_token/);
  assert.equal(body.member.status, 'pending');
}

test('member-register does not return the verification link when the email was sent', async () => {
  configureEnv({ sendgrid: true });
  const { sentEmails } = installFakeBackends({ sendgridStatus: 202 });

  const { response, body } = await registerSomeoneElsesAddress();

  assertNoVerificationCredential(response, body);
  assert.equal(body.emailDelivered, true);
  assert.equal(sentEmails.length, 1);
  const emailedToken = sentEmails[0].content[0].value.match(/verify_email_token=([0-9a-f]+)/)?.[1];
  assert.ok(emailedToken, 'the link must still go out by email');
  assert.ok(!response.body.includes(emailedToken), 'the emailed token must not appear in the response');
});

test('member-register does not return the verification link when SendGrid is not configured', async () => {
  configureEnv({ sendgrid: false });
  const { sentEmails } = installFakeBackends({ sendgridStatus: 202 });

  const { response, body } = await registerSomeoneElsesAddress();

  assertNoVerificationCredential(response, body);
  assert.equal(body.emailDelivered, false);
  assert.equal(sentEmails.length, 0);
  assert.match(body.message, /[Cc]ontact support/);
  assert.doesNotMatch(body.message, /link below/);
});

test('member-register does not return the verification link when SendGrid rejects the send', async () => {
  // A quota or rate-limit rejection is something an attacker can provoke with
  // mass signups, so it must not open a path to the link either.
  configureEnv({ sendgrid: true });
  const { sentEmails } = installFakeBackends({ sendgridStatus: 429 });

  const { response, body } = await registerSomeoneElsesAddress();

  assertNoVerificationCredential(response, body);
  assert.equal(body.emailDelivered, false);
  assert.equal(body.verification.delivery, 'send-failed');
  assert.equal(sentEmails.length, 1);
});
