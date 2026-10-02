import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  buildMemberVerificationUrl,
  getEmailDeliveryConfig,
  sendMemberVerificationEmail,
  sendRecoveryEmail,
  sendTransactionalEmail,
} from '../netlify/functions/_email.mjs';
import { buildRegistrationMessage } from '../netlify/functions/member-register.mjs';
import { releaseUnverifiedMemberClaim } from '../netlify/functions/_member.mjs';

// Pin a clean env so SendGrid stays "not configured" for every test in this
// file. The helpers each accept sql=null which bypasses the DB lookup, so we
// only need to neutralize the env-var fallback path.
const ENV_KEYS = [
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  'SENDGRID_FROM_NAME',
  'SENDGRID_REPLY_TO_EMAIL',
  'PUBLIC_SITE_URL',
  'URL',
];

const PRIOR_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

test.before(() => clearEnv());
test.after(() => {
  for (const [k, v] of Object.entries(PRIOR_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ---------- getEmailDeliveryConfig ----------

test('getEmailDeliveryConfig returns enabled=false when no api key or from email is set', async () => {
  clearEnv();
  const config = await getEmailDeliveryConfig(null);
  assert.equal(config.enabled, false);
  assert.equal(config.apiKey, '');
  assert.equal(config.fromEmail, '');
});

test('getEmailDeliveryConfig defaults the from name to "Gematria.Today"', async () => {
  clearEnv();
  const config = await getEmailDeliveryConfig(null);
  assert.equal(config.fromName, 'Gematria.Today');
});

test('getEmailDeliveryConfig is enabled only when BOTH apiKey AND fromEmail are present', async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = 'SG.testkey';
  // No fromEmail -> still not enabled.
  let config = await getEmailDeliveryConfig(null);
  assert.equal(config.enabled, false);

  process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';
  config = await getEmailDeliveryConfig(null);
  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, 'SG.testkey');
  assert.equal(config.fromEmail, 'no-reply@example.com');
});

test('getEmailDeliveryConfig normalizes from/reply-to emails (trims + lowercases)', async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = 'SG.k';
  process.env.SENDGRID_FROM_EMAIL = '  No-Reply@Example.COM  ';
  process.env.SENDGRID_REPLY_TO_EMAIL = '  Support@EXAMPLE.com  ';
  const config = await getEmailDeliveryConfig(null);
  assert.equal(config.fromEmail, 'no-reply@example.com');
  assert.equal(config.replyTo, 'support@example.com');
});

test('getEmailDeliveryConfig strips a trailing slash from appBaseUrl', async () => {
  clearEnv();
  process.env.PUBLIC_SITE_URL = 'https://gematria.today/';
  const config = await getEmailDeliveryConfig(null);
  assert.equal(config.appBaseUrl, 'https://gematria.today');
});

test('getEmailDeliveryConfig falls back from PUBLIC_SITE_URL to URL', async () => {
  clearEnv();
  process.env.URL = 'https://deploy-preview.netlify.app';
  const config = await getEmailDeliveryConfig(null);
  assert.equal(config.appBaseUrl, 'https://deploy-preview.netlify.app');
});

// ---------- sendTransactionalEmail (graceful fallback) ----------

test('sendTransactionalEmail returns onscreen-preview when SendGrid is not configured', async () => {
  clearEnv();
  const result = await sendTransactionalEmail({
    toEmail: 'someone@example.com',
    subject: 's',
    text: 't',
    html: 'h',
    sql: null,
  });
  assert.deepEqual(result, { delivered: false, delivery: 'onscreen-preview', reason: 'sendgrid-not-configured' });
});

test('sendTransactionalEmail returns onscreen-preview when configured but recipient is empty', async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = 'SG.k';
  process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';
  const result = await sendTransactionalEmail({
    toEmail: '   ',
    subject: 's',
    text: 't',
    html: 'h',
    sql: null,
  });
  assert.deepEqual(result, { delivered: false, delivery: 'onscreen-preview', reason: 'missing-recipient-email' });
});

// ---------- sendRecoveryEmail (strict throw) ----------

test('sendRecoveryEmail throws 503 sendgrid-not-configured when delivery is disabled', async () => {
  clearEnv();
  await assert.rejects(
    sendRecoveryEmail({
      toEmail: 'kev@example.com',
      username: 'kev',
      recoveryCode: 'abc123',
      expiresAt: new Date(Date.now() + 60_000),
      role: 'member',
      recoveryType: 'forgot-password',
      sql: null,
    }),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.reason, 'sendgrid-not-configured');
      return true;
    },
  );
});

test('sendRecoveryEmail throws 503 missing-recipient-email when recipient is blank', async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = 'SG.k';
  process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';
  await assert.rejects(
    sendRecoveryEmail({
      toEmail: '',
      username: 'kev',
      recoveryCode: 'abc123',
      expiresAt: new Date(Date.now() + 60_000),
      role: 'member',
      recoveryType: 'forgot-password',
      sql: null,
    }),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.reason, 'missing-recipient-email');
      return true;
    },
  );
});

// ---------- sendMemberVerificationEmail (graceful fallback + URL composition) ----------

test('sendMemberVerificationEmail returns onscreen-preview when SendGrid is not configured', async () => {
  clearEnv();
  const result = await sendMemberVerificationEmail({
    toEmail: 'kev@example.com',
    username: 'kev',
    verificationToken: 'abc',
    expiresAt: new Date(Date.now() + 60_000),
    sql: null,
  });
  assert.equal(result.delivered, false);
  assert.equal(result.delivery, 'onscreen-preview');
  assert.equal(result.reason, 'sendgrid-not-configured');
});

test('sendMemberVerificationEmail returns onscreen-preview when recipient is empty (does not call SendGrid)', async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = 'SG.k';
  process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';
  const result = await sendMemberVerificationEmail({
    toEmail: '',
    username: 'kev',
    verificationToken: 'abc',
    expiresAt: new Date(Date.now() + 60_000),
    sql: null,
  });
  assert.equal(result.delivered, false);
  assert.equal(result.reason, 'missing-recipient-email');
});

test('unverified members are only pruned when the verification email was delivered', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/_member.mjs', import.meta.url), 'utf8');

  // Deleting an account because our own email failed destroys the signup and
  // the evidence of the outage at the same time.
  const pruneQuery = source.slice(source.indexOf('deleteExpiredUnverifiedMembers'));
  assert.match(pruneQuery, /email_delivered = TRUE/);
});

test('registration does not claim an email was sent when delivery failed', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/member-register.mjs', import.meta.url), 'utf8');
  assert.match(source, /markVerificationEmailDelivered/);

  assert.match(
    buildRegistrationMessage({ delivered: true }),
    /Check your email/,
  );
  assert.match(
    buildRegistrationMessage({ delivered: false, verificationUrl: 'https://gematria.today/member.html?verify_email_token=t' }),
    /could not send your verification email/,
  );
});

test('registration never points at an on-screen verification link', () => {
  // The link is a bearer credential for the address, so it only travels by
  // email. The copy used to send the member to "the verification link below",
  // which the response carried to whoever registered -- owner or not.
  for (const delivery of [
    { delivered: false, verificationUrl: null },
    { delivered: false, verificationUrl: 'https://gematria.today/member.html?verify_email_token=t' },
  ]) {
    const message = buildRegistrationMessage(delivery);
    assert.match(message, /could not send your verification email/);
    assert.doesNotMatch(message, /link below/);
    assert.match(message, /[Cc]ontact support/);
  }
});

test('no page sends an undelivered signup to an on-screen verification link', async () => {
  // member-register no longer returns one, and the "Verify my email now"
  // anchors are gone. The member.html hero still said "Use the verification
  // link above" after a failed send, so every outage signup was pointed at
  // something that does not exist.
  for (const file of [
    '../page-scripts/member-1.js',
    '../page-scripts/gematria-account-setup-1.js',
    '../src/member.html',
    '../src/gematria-account-setup.html',
  ]) {
    const source = await fs.readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /verification link (above|below)/i, `${file} points at an on-screen link`);
    assert.doesNotMatch(source, /Verify my email now|VerifyLink/, `${file} still renders an on-screen link`);
  }

  // The hero sends them to the resend form instead, by the label its button
  // actually carries.
  const script = await fs.readFile(new URL('../page-scripts/member-1.js', import.meta.url), 'utf8');
  const page = await fs.readFile(new URL('../src/member.html', import.meta.url), 'utf8');
  assert.match(script, /could not send your verification email\. Send a fresh link with the form below/);
  assert.match(page, /id="resendVerificationSubmit"[^>]*>Send a fresh link</);
});

test('admin reports expose verification email delivery health', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/admin-reports.mjs', import.meta.url), 'utf8');

  assert.match(source, /verificationDelivery/);
  assert.match(source, /verificationEmail: \{/);
  assert.match(source, /undelivered/);
});

// ---------- SendGrid rejecting the send ----------

async function withStubbedFetch(response, run) {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => response(...args);
  try {
    return await run();
  } finally {
    globalThis.fetch = priorFetch;
  }
}

test('sendMemberVerificationEmail reports a SendGrid rejection instead of throwing', async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = 'SG.k';
  process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';
  process.env.PUBLIC_SITE_URL = 'https://gematria.today';

  // member-register creates the account before this call. A throw here used to
  // 502 the whole registration: the member could neither verify nor sign up
  // again, and the delivery outcome was never logged because the caller's
  // audit write comes after the send.
  const result = await withStubbedFetch(
    () => new Response(
      JSON.stringify({ errors: [{ message: 'The from address does not match a verified Sender Identity.' }] }),
      { status: 403 },
    ),
    () => sendMemberVerificationEmail({
      toEmail: 'kev@example.com',
      username: 'kev',
      verificationToken: 'tok-123',
      expiresAt: new Date(Date.now() + 60_000),
      sql: null,
    }),
  );

  assert.equal(result.delivered, false);
  assert.equal(result.delivery, 'send-failed');
  assert.match(result.reason, /sender identity is not verified/);
  // A failed send must not hand the link back for the caller to show instead.
  assert.equal('verificationUrl' in result, false);
  assert.doesNotMatch(JSON.stringify(result), /tok-123/);
});

test('sendMemberVerificationEmail reports a SendGrid timeout instead of throwing', async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = 'SG.k';
  process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';

  const result = await withStubbedFetch(
    () => { throw new Error('Request timed out after 10000ms'); },
    () => sendMemberVerificationEmail({
      toEmail: 'kev@example.com',
      username: 'kev',
      verificationToken: 'tok-123',
      expiresAt: new Date(Date.now() + 60_000),
      sql: null,
    }),
  );

  assert.equal(result.delivered, false);
  assert.equal(result.delivery, 'send-failed');
});

test('sendMemberVerificationEmail still returns delivered on a SendGrid 202', async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = 'SG.k';
  process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';
  process.env.PUBLIC_SITE_URL = 'https://gematria.today';

  let sentPayload = null;
  const result = await withStubbedFetch(
    (url, init) => {
      sentPayload = JSON.parse(init.body);
      return new Response('', { status: 202 });
    },
    () => sendMemberVerificationEmail({
      toEmail: 'kev@example.com',
      username: 'kev',
      verificationToken: 'tok-123',
      expiresAt: new Date(Date.now() + 60_000),
      sql: null,
    }),
  );

  // The link goes in the email and nowhere else. It used to ride along on the
  // result too, and member-register copied it into its public 201 response.
  assert.deepEqual(result, { delivered: true, delivery: 'email' });
  const verificationUrl = 'https://gematria.today/member.html?verify_email_token=tok-123&auth=login#authSection';
  const [plain, html] = sentPayload.content.map((part) => part.value);
  assert.ok(plain.includes(`Verify email: ${verificationUrl}`));
  assert.ok(html.includes(`href="${verificationUrl.replace(/&/g, '&amp;')}"`));
});

test('an undelivered verification never hands the link back to the caller', async () => {
  clearEnv();
  // SendGrid unconfigured. The account stays pending and is not pruned, so a
  // resend can finish it once delivery works. Returning the link here instead
  // let anyone who registered someone else's address verify it themselves.
  process.env.PUBLIC_SITE_URL = 'https://gematria.today';
  const result = await sendMemberVerificationEmail({
    toEmail: 'kev@example.com',
    username: 'kev',
    verificationToken: 'tok-123',
    expiresAt: new Date(Date.now() + 60_000),
    sql: null,
  });

  assert.deepEqual(result, { delivered: false, delivery: 'onscreen-preview', reason: 'sendgrid-not-configured' });
});

test('buildMemberVerificationUrl returns null without a site url or token', () => {
  assert.equal(buildMemberVerificationUrl('', 'tok'), null);
  assert.equal(buildMemberVerificationUrl('https://gematria.today', ''), null);
  assert.equal(
    buildMemberVerificationUrl('https://gematria.today/', 'a b'),
    'https://gematria.today/member.html?verify_email_token=a%20b&auth=login#authSection',
  );
});

// ---------- callers record the outcome ----------

test('resend records the delivery outcome instead of failing the request', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/member-resend-verification.mjs', import.meta.url), 'utf8');

  assert.match(source, /resend_undelivered/, 'a failed resend needs its own audit outcome');
  assert.match(source, /markVerificationEmailDelivered/, 'a failed resend must not leave the account prunable');
  assert.match(source, /verificationDeliveryError/);
});

test('registration records why a verification email did not send', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/member-register.mjs', import.meta.url), 'utf8');
  assert.match(source, /verificationDeliveryError/);
});

test('the reason a send failed never reaches the visitor', async () => {
  const register = await fs.readFile(new URL('../netlify/functions/member-register.mjs', import.meta.url), 'utf8');
  const responseBody = register.slice(register.indexOf('return jsonResponse(201'));

  // interpretSendGridError names our sender domain and API-key configuration.
  assert.doesNotMatch(responseBody, /delivery\.reason/);
});

test('admin reports surface the most recent delivery failure reason', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/admin-reports.mjs', import.meta.url), 'utf8');

  assert.match(source, /verificationDeliveryError/);
  assert.match(source, /lastFailure:/);
});

// ---------- a signup that never got its email can start over ----------

function createSqlStub(deleteResult = []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    return Promise.resolve(text.includes('DELETE FROM users') ? deleteResult : []);
  };
  return { sql, calls, userDeletes: () => calls.filter((call) => call.text.includes('DELETE FROM users')) };
}

test('releaseUnverifiedMemberClaim frees a pending account with no live verification link', async () => {
  const stub = createSqlStub([{ id: 'u-1' }]);
  const released = await releaseUnverifiedMemberClaim(stub.sql, { username: ' kev ', email: '  KEV@Example.COM ' });

  assert.equal(released, 1);
  const [del] = stub.userDeletes();
  // Only pending, unverified members, and only once their link is dead.
  assert.match(del.text, /status = 'pending'/);
  assert.match(del.text, /email_verified = FALSE/);
  assert.match(del.text, /NOT EXISTS/);
  assert.match(del.text, /expires_at > NOW\(\)/);
  // Identifiers are normalized the same way registerMember normalizes them.
  // A missing identifier is passed as NULL rather than '', so it matches
  // nothing instead of matching a row with an empty column.
  assert.deepEqual(del.values, ['kev', 'kev@example.com']);
});

test('releaseUnverifiedMemberClaim deletes nothing when given no identifiers', async () => {
  const stub = createSqlStub([{ id: 'u-1' }]);
  assert.equal(await releaseUnverifiedMemberClaim(stub.sql, {}), 0);
  assert.equal(stub.userDeletes().length, 0);
});

test('registration releases a stale claim before it tries to create the account', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/member-register.mjs', import.meta.url), 'utf8');
  const release = source.indexOf('releaseUnverifiedMemberClaim(sql');
  const register = source.indexOf('registerMember(sql');

  assert.ok(release > 0, 'member-register must release a stale unverified claim');
  assert.ok(release < register, 'the claim has to be released before the insert that would collide with it');
});

test('the delivery record outlives the link, so the prune can actually reach an account', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/_member.mjs', import.meta.url), 'utf8');
  const cleanup = source.slice(source.indexOf('DELETE FROM member_email_verification_requests r'));

  // email_delivered lives on these rows and the prune 23 days later reads it.
  // Deleting them at link expiry left that check with nothing to find.
  assert.match(cleanup.slice(0, 600), /NOT EXISTS/);
  assert.match(cleanup.slice(0, 600), /u\.status = 'pending'/);
});

test('the pages tell members how long a verification link actually lasts', async () => {
  for (const file of ['../src/member.html', '../src/gematria-account-setup.html']) {
    const source = await fs.readFile(new URL(file, import.meta.url), 'utf8');
    // EMAIL_VERIFICATION_TTL_MS is 7 days; the copy used to say 24 hours, so
    // anyone who came back on day two was told a working link was dead.
    assert.doesNotMatch(source, /expires? (in )?24 hours/i, `${file} still promises a 24-hour link`);
    assert.match(source, /good for 7 days/);
  }
});
