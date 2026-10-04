import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { consumeAccountRecoveryRequest, hashToken } from '../netlify/functions/_auth.mjs';
import { sendRecoveryEmail } from '../netlify/functions/_email.mjs';
import { handler as accountRecoveryHandler } from '../netlify/functions/member-account-recovery.mjs';

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

const CODE = '3f9a0c7b1d2e4f6a8b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e';
const MEMBER_ROW = {
  id: 'u-kev',
  username: 'kev',
  email: 'kev@example.com',
  display_name: 'kev',
  membership_level: 'free',
  status: 'active',
  email_verified: true,
  role: 'member',
  is_admin: false,
};

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

// SendGrid and Neon both go through the global fetch; one stub records the
// emails and answers the database with the member the recovery looks up.
function installFakeBackends() {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
  process.env.SENDGRID_API_KEY = 'SG.test';
  process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';
  process.env.PUBLIC_SITE_URL = 'https://gematria.today';

  const sentEmails = [];
  const queries = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('api.sendgrid.com')) {
      sentEmails.push(JSON.parse(init.body));
      return new Response('', { status: 202 });
    }
    const { query, params } = JSON.parse(init.body);
    queries.push({ query, params });
    const rows = /FROM users\s+WHERE LOWER\(email\) =/.test(query) ? [MEMBER_ROW] : [];
    return new Response(JSON.stringify(neonResult(rows)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { sentEmails, queries };
}

function emailParts(email) {
  return {
    subject: email.personalizations[0].subject,
    text: email.content.find((part) => part.type === 'text/plain').value,
    html: email.content.find((part) => part.type === 'text/html').value,
  };
}

async function sendOne(recoveryType, role = 'member') {
  const backends = installFakeBackends();
  await sendRecoveryEmail({
    toEmail: 'kev@example.com',
    username: 'kev',
    recoveryCode: CODE,
    expiresAt: new Date(Date.now() + 60_000),
    role,
    recoveryType,
    sql: null,
  });
  assert.equal(backends.sentEmails.length, 1);
  return emailParts(backends.sentEmails[0]);
}

// ---------- what each recovery email says ----------

test('the username reminder carries no code and links to sign-in', async () => {
  const { subject, text, html } = await sendOne('forgot-userid');

  assert.match(subject, /username/);
  assert.match(text, /Username: kev/);
  // Nothing accepts a forgot-userid code, and the page promises "no code or
  // reset needed"; the reset form refused the one this email used to show.
  for (const body of [text, html]) {
    assert.doesNotMatch(body, /Recovery code/);
    assert.ok(!body.includes(CODE), 'the username reminder must not show a code');
    assert.doesNotMatch(body, /account-recovery\.html/);
  }
  // The link said "sign-in page" and opened account recovery.
  assert.match(text, /Sign in: https:\/\/gematria\.today\/member\.html\?auth=login#authSection/);
  assert.match(html, /<a href="https:\/\/gematria\.today\/member\.html\?auth=login#authSection">Sign in<\/a>/);
});

test('an admin username reminder still links to the admin sign-in', async () => {
  const { text } = await sendOne('forgot-userid', 'admin');
  assert.match(text, /Sign in: https:\/\/gematria\.today\/admin\.html$/m);
  assert.ok(!text.includes(CODE));
});

test('the username-and-reset email names the username and carries the reset code', async () => {
  const { subject, text, html } = await sendOne('forgot-both');

  assert.match(subject, /username and password reset code/);
  assert.match(text, /Username: kev/);
  assert.match(text, new RegExp(`Recovery code: ${CODE}`));
  assert.match(text, new RegExp(`account-recovery\\.html\\?recovery_code=${CODE}`));
  assert.ok(html.includes(CODE));
});

test('the password reset email is unchanged', async () => {
  const { subject, text } = await sendOne('forgot-password');

  assert.match(subject, /^Your member password reset code/);
  assert.match(text, /^You requested a password reset code/);
  assert.match(text, new RegExp(`Reset your password: https://gematria\\.today/account-recovery\\.html\\?recovery_code=${CODE}`));
});

// ---------- the handler sends what the page promises ----------

test('"username and a reset link" arrives as one email with a usable reset code', async () => {
  const { sentEmails, queries } = installFakeBackends();

  const response = await accountRecoveryHandler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.31' },
    body: JSON.stringify({ action: 'forgot-both', email: 'kev@example.com' }),
  });

  assert.equal(response.statusCode, 200);
  // The page says "You'll get both in one email". Two went out, and the first
  // -- the username reminder -- looked complete on its own.
  assert.equal(sentEmails.length, 1);
  const { subject, text } = emailParts(sentEmails[0]);
  assert.match(subject, /username and password reset code/);
  assert.match(text, /Username: kev/);

  // The emailed code is one the reset form accepts: a forgot-password request.
  const emailedCode = text.match(/Recovery code: ([0-9a-f]+)/)?.[1];
  assert.ok(emailedCode);
  const issued = queries.filter(({ query }) => /INSERT INTO account_recovery_requests/.test(query));
  assert.equal(issued.length, 1);
  assert.ok(issued[0].params.includes('forgot-password'));
  assert.ok(issued[0].params.includes(hashToken(emailedCode)));
});

test('a username reminder request sends one email with no code', async () => {
  const { sentEmails } = installFakeBackends();

  const response = await accountRecoveryHandler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.32' },
    body: JSON.stringify({ action: 'forgot-userid', email: 'kev@example.com' }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(sentEmails.length, 1);
  const { text } = emailParts(sentEmails[0]);
  assert.match(text, /Username: kev/);
  assert.doesNotMatch(text, /Recovery code/);
});

// ---------- a recovery code typed in capitals ----------

test('a recovery code is matched whatever case it is typed in', async () => {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve([]);
  };

  // Codes are lowercase hex. A phone keyboard forced to capitals sent
  // "3F9A..." and the exact-hash lookup refused a valid, unexpired code.
  await consumeAccountRecoveryRequest(sql, {
    role: 'member',
    recoveryType: 'forgot-password',
    token: `  ${CODE.toUpperCase()}  `,
  });

  const update = calls.find(({ text }) => /UPDATE account_recovery_requests/.test(text));
  assert.ok(update.values.includes(hashToken(CODE)));
});

test('the reset handler applies its per-code limit to the code, not to how it was typed', async () => {
  const { queries } = installFakeBackends();

  await accountRecoveryHandler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.33' },
    body: JSON.stringify({ action: 'reset-password', recoveryCode: CODE.toUpperCase(), newPassword: 'a-new-password' }),
  });

  const limit = queries.find(({ query, params }) => /INSERT INTO request_rate_limits/.test(query)
    && params.includes('member-recovery-reset-token'));
  assert.ok(limit, 'the reset path must rate-limit the code');
  assert.ok(limit.params.includes(hashToken(CODE)));
});

test('the recovery code field does not force capitals on a lowercase code', async () => {
  const page = await fs.readFile(new URL('../src/account-recovery.html', import.meta.url), 'utf8');
  const input = page.match(/<input id="recoveryCode"[^>]*>/)?.[0];
  assert.ok(input);
  assert.doesNotMatch(input, /autocapitalize="characters"/);
  assert.doesNotMatch(input, /placeholder="[^"]*[A-Z]{3}/);

  const script = await fs.readFile(new URL('../page-scripts/account-recovery-1.js', import.meta.url), 'utf8');
  assert.match(script, /const recoveryCode = recoveryCodeInput\.value\.trim\(\)\.toLowerCase\(\);/);
});
