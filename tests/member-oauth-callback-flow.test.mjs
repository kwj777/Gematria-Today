import test from 'node:test';
import assert from 'node:assert/strict';
import { neonConfig } from '@neondatabase/serverless';

import { OAUTH_STATE_COOKIE, createOAuthState } from '../netlify/functions/_oauth.mjs';
import { handler as callbackHandler } from '../netlify/functions/member-oauth-callback.mjs';

// Drives the real callback end to end -- Google's token endpoint faked at
// fetch, the database faked at Neon's HTTP boundary -- so what the page is told
// and what the account gets are checked through the handler, not a helper.

process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret';

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

function memberRow(id) {
  return {
    id,
    username: 'renee-owner',
    email: 'renee@example.com',
    display_name: 'Renee Owner',
    membership_level: 'free',
    membership_started_at: null,
    membership_expires_at: null,
    stripe_customer_id: null,
    stripe_last_checkout_session_id: null,
    stripe_subscription_id: null,
    stripe_subscription_status: null,
    stripe_subscription_current_period_end: null,
    status: 'active',
    email_verified: true,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  };
}

// Nothing matches an existing identity, and an email match only when the test
// sets one, so the callback takes the create or the link path. Everything else
// (schema, rate limits, audit) gets no rows back.
function answer(db, query, params) {
  if (/SELECT id, role, status, email_verified\s+FROM users/.test(query)) {
    if (db.existing) db.userId = db.existing.id;
    return db.existing ? [db.existing] : [];
  }
  if (/UPDATE users\s+SET username/.test(query)) {
    db.renamedTo = params[0];
    return db.existing && db.existing.status === 'pending' ? [{ id: db.existing.id }] : [];
  }
  if (/INSERT INTO users/.test(query)) {
    db.userId = params[0];
    return [{ id: params[0] }];
  }
  if (/INSERT INTO member_profiles/.test(query)) {
    db.preferences.push(JSON.parse(params[1]));
    return [{
      user_id: params[0],
      preferences: params[1],
      favorite_cipher: null,
      timezone: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    }];
  }
  if (/FROM users\s+WHERE id =/.test(query)) {
    return db.userId ? [memberRow(db.userId)] : [];
  }
  return [];
}

function idToken(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.signature-not-checked`;
}

const PRIOR = {
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  },
  neonFetch: neonConfig.fetchFunction,
  fetch: globalThis.fetch,
};

test.after(() => {
  neonConfig.fetchFunction = PRIOR.neonFetch;
  globalThis.fetch = PRIOR.fetch;
  for (const [key, value] of Object.entries(PRIOR.env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function completeGoogleSignup({ signupSource = '', existing = null } = {}) {
  const db = { userId: null, preferences: [], existing, renamedTo: null };
  process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-123';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
  process.env.PUBLIC_SITE_URL = 'https://gematria.today';
  neonConfig.fetchFunction = async (_url, init) => {
    const { query, params } = JSON.parse(init.body);
    return new Response(JSON.stringify(neonResult(answer(db, query, params))), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const { state, nonce, cookieValue } = createOAuthState({
    provider: 'google',
    returnTo: '/member.html?auth=register',
    signupSource,
  });

  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://oauth2.googleapis.com/token');
    return new Response(JSON.stringify({
      access_token: 'access-token',
      id_token: idToken({
        iss: 'https://accounts.google.com',
        aud: 'client-123',
        exp: Math.floor(Date.now() / 1000) + 600,
        nonce,
        sub: 'google-sub-renee',
        email: 'renee@example.com',
        email_verified: true,
        name: 'Renee Owner',
      }),
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const response = await callbackHandler({
    httpMethod: 'GET',
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${encodeURIComponent(cookieValue)}`, 'x-forwarded-for': '203.0.113.9' },
    queryStringParameters: { state, code: 'auth-code' },
  });
  return { response, db };
}

test('a Google signup started on the learning path seeds the step-1 intent on the new account', async () => {
  const { response, db } = await completeGoogleSignup({ signupSource: 'learning_path_level_0' });

  assert.equal(response.statusCode, 302);
  const location = new URL(response.headers.location, 'https://gematria.today');
  assert.equal(location.searchParams.get('oauth'), 'success');
  assert.equal(location.searchParams.get('oauth_new'), '1');
  assert.deepEqual(db.preferences, [{ learningPathStep1Intent: true }]);
});

test('a Google signup started anywhere else seeds nothing', async () => {
  const { response, db } = await completeGoogleSignup({ signupSource: '' });

  assert.equal(response.statusCode, 302);
  assert.equal(new URL(response.headers.location, 'https://gematria.today').searchParams.get('oauth_new'), '1');
  assert.deepEqual(db.preferences, [{}]);
});

test('adopting a never-verified pending account tells the page its name was replaced', async () => {
  // The learning-path source seeds only a brand new account, as with the
  // password form; adopting a row leaves its preferences alone.
  const { response, db } = await completeGoogleSignup({
    signupSource: 'learning_path_level_0',
    existing: { id: 'user-pending', role: 'member', status: 'pending', email_verified: false },
  });

  assert.equal(response.statusCode, 302);
  const location = new URL(response.headers.location, 'https://gematria.today');
  assert.equal(location.searchParams.get('oauth'), 'success');
  assert.equal(location.searchParams.get('oauth_linked'), '1');
  assert.equal(location.searchParams.get('oauth_password_retired'), '1');
  assert.equal(location.searchParams.get('oauth_username_replaced'), '1');
  assert.equal(db.renamedTo, 'renee-owner');
  assert.deepEqual(db.preferences, [{}]);
});

test('linking an active account that predates verification does not report a rename', async () => {
  const { response, db } = await completeGoogleSignup({
    existing: { id: 'user-legacy', role: 'member', status: 'active', email_verified: false },
  });

  const location = new URL(response.headers.location, 'https://gematria.today');
  assert.equal(location.searchParams.get('oauth_linked'), '1');
  assert.equal(location.searchParams.has('oauth_username_replaced'), false);
  assert.equal(db.renamedTo, null);
});
