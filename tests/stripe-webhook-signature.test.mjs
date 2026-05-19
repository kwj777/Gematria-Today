import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { verifyStripeWebhookSignature } from '../netlify/functions/_stripe.mjs';

const SIGNING_SECRET = 'whsec_test_secret_value';

function signPayload(payload, secret, timestamp) {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
}

function currentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function buildSignatureHeader(timestamp, signatures) {
  const parts = [`t=${timestamp}`, ...signatures.map((sig) => `v1=${sig}`)];
  return parts.join(',');
}

test('verifyStripeWebhookSignature accepts a valid v1 signature within tolerance', () => {
  const payload = JSON.stringify({ id: 'evt_test', type: 'customer.subscription.created' });
  const timestamp = currentTimestamp();
  const signature = signPayload(payload, SIGNING_SECRET, timestamp);
  const signatureHeader = buildSignatureHeader(timestamp, [signature]);

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    true,
  );
});

test('verifyStripeWebhookSignature rejects when payload is empty', () => {
  const timestamp = currentTimestamp();
  const signature = signPayload('', SIGNING_SECRET, timestamp);
  const signatureHeader = buildSignatureHeader(timestamp, [signature]);

  assert.equal(
    verifyStripeWebhookSignature({ payload: '', signatureHeader, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature rejects when signing secret is missing', () => {
  const payload = '{"id":"evt_test"}';
  const timestamp = currentTimestamp();
  const signature = signPayload(payload, SIGNING_SECRET, timestamp);
  const signatureHeader = buildSignatureHeader(timestamp, [signature]);

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: '' }),
    false,
  );
});

test('verifyStripeWebhookSignature rejects when signature header is missing or empty', () => {
  const payload = '{"id":"evt_test"}';
  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader: '', signingSecret: SIGNING_SECRET }),
    false,
  );
  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader: undefined, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature rejects malformed signature header without v1 entries', () => {
  const payload = '{"id":"evt_test"}';
  const timestamp = currentTimestamp();
  // Header carries a timestamp but no v1 signature.
  const signatureHeader = `t=${timestamp}`;

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature rejects when timestamp is missing', () => {
  const payload = '{"id":"evt_test"}';
  const signature = signPayload(payload, SIGNING_SECRET, currentTimestamp());
  const signatureHeader = `v1=${signature}`;

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature rejects timestamps outside the default 5-minute tolerance', () => {
  const payload = '{"id":"evt_test"}';
  const oldTimestamp = currentTimestamp() - 600; // 10 minutes ago
  const signature = signPayload(payload, SIGNING_SECRET, oldTimestamp);
  const signatureHeader = buildSignatureHeader(oldTimestamp, [signature]);

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature accepts older timestamps when toleranceSeconds is widened', () => {
  const payload = '{"id":"evt_test"}';
  const oldTimestamp = currentTimestamp() - 600;
  const signature = signPayload(payload, SIGNING_SECRET, oldTimestamp);
  const signatureHeader = buildSignatureHeader(oldTimestamp, [signature]);

  assert.equal(
    verifyStripeWebhookSignature({
      payload,
      signatureHeader,
      signingSecret: SIGNING_SECRET,
      toleranceSeconds: 1200,
    }),
    true,
  );
});

test('verifyStripeWebhookSignature rejects future timestamps beyond tolerance', () => {
  const payload = '{"id":"evt_test"}';
  const futureTimestamp = currentTimestamp() + 600;
  const signature = signPayload(payload, SIGNING_SECRET, futureTimestamp);
  const signatureHeader = buildSignatureHeader(futureTimestamp, [signature]);

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature rejects a valid timestamp paired with a wrong signature', () => {
  const payload = '{"id":"evt_test"}';
  const timestamp = currentTimestamp();
  // Sign with a different secret to simulate tampering.
  const wrongSignature = signPayload(payload, 'whsec_attacker_secret', timestamp);
  const signatureHeader = buildSignatureHeader(timestamp, [wrongSignature]);

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature detects tampered payloads even with a valid header', () => {
  const originalPayload = '{"amount":100}';
  const tamperedPayload = '{"amount":999}';
  const timestamp = currentTimestamp();
  const signature = signPayload(originalPayload, SIGNING_SECRET, timestamp);
  const signatureHeader = buildSignatureHeader(timestamp, [signature]);

  assert.equal(
    verifyStripeWebhookSignature({
      payload: tamperedPayload,
      signatureHeader,
      signingSecret: SIGNING_SECRET,
    }),
    false,
  );
});

test('verifyStripeWebhookSignature accepts when any v1 candidate matches (key rotation)', () => {
  const payload = '{"id":"evt_test"}';
  const timestamp = currentTimestamp();
  const validSignature = signPayload(payload, SIGNING_SECRET, timestamp);
  const garbageSignature = 'a'.repeat(64);
  const signatureHeader = buildSignatureHeader(timestamp, [garbageSignature, validSignature]);

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    true,
  );
});

test('verifyStripeWebhookSignature rejects candidates whose length differs from expected', () => {
  const payload = '{"id":"evt_test"}';
  const timestamp = currentTimestamp();
  // Truncated hex string — wrong byte length after hex decode.
  const shortSignature = 'abcdef';
  const signatureHeader = buildSignatureHeader(timestamp, [shortSignature]);

  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature does not throw on non-hex candidate signatures', () => {
  const payload = '{"id":"evt_test"}';
  const timestamp = currentTimestamp();
  // Non-hex characters in candidate — Buffer.from(..., 'hex') silently truncates;
  // the resulting length mismatch (or comparison failure) must return false, not throw.
  const signatureHeader = buildSignatureHeader(timestamp, ['not-hex-zzzzzz']);

  assert.doesNotThrow(() => {
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET });
  });
  assert.equal(
    verifyStripeWebhookSignature({ payload, signatureHeader, signingSecret: SIGNING_SECRET }),
    false,
  );
});

test('verifyStripeWebhookSignature coerces non-string payloads via String()', () => {
  // Stripe's webhook documentation requires the raw body; in practice the handler
  // always passes a string. This test pins the defensive String() coercion.
  const payloadObj = '[object Object]';
  const timestamp = currentTimestamp();
  const signature = signPayload(payloadObj, SIGNING_SECRET, timestamp);
  const signatureHeader = buildSignatureHeader(timestamp, [signature]);

  assert.equal(
    verifyStripeWebhookSignature({
      payload: { foo: 'bar' },
      signatureHeader,
      signingSecret: SIGNING_SECRET,
    }),
    true,
  );
});
