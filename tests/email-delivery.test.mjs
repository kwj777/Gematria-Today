import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEmailDeliveryConfig,
  sendMemberVerificationEmail,
  sendRecoveryEmail,
  sendTransactionalEmail,
} from '../netlify/functions/_email.mjs';

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
