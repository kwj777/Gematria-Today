import test from 'node:test';
import assert from 'node:assert/strict';

import { handler as publicPostsHandler } from '../netlify/functions/public-posts.mjs';
import { handler as publicFaqsHandler } from '../netlify/functions/public-faqs.mjs';
import { handler as publicFeedsHandler } from '../netlify/functions/public-feeds.mjs';
import { handler as memberSessionHandler } from '../netlify/functions/member-session.mjs';
import { handler as memberLogoutHandler } from '../netlify/functions/member-logout.mjs';
import { handler as memberLoginHandler } from '../netlify/functions/member-login.mjs';
import { handler as memberRegisterHandler } from '../netlify/functions/member-register.mjs';
import { handler as memberLearningPathConsumeHandler } from '../netlify/functions/member-learning-path-consume.mjs';
import { handler as memberLearningPathCompleteHandler } from '../netlify/functions/member-learning-path-complete.mjs';
import { handler as memberAccountRecoveryHandler } from '../netlify/functions/member-account-recovery.mjs';
import { handler as memberPaymentCheckoutHandler } from '../netlify/functions/member-payment-checkout.mjs';
import { handler as memberPaymentConfirmHandler } from '../netlify/functions/member-payment-confirm.mjs';
import { handler as stripeWebhookHandler } from '../netlify/functions/stripe-webhook.mjs';
import { handler as adminSessionHandler } from '../netlify/functions/admin-session.mjs';
import { handler as adminLogoutHandler } from '../netlify/functions/admin-logout.mjs';
import { handler as adminLoginHandler } from '../netlify/functions/admin-login.mjs';
import { handler as adminClickTrackingHandler } from '../netlify/functions/admin-click-tracking.mjs';
import { handler as adminReportsHandler } from '../netlify/functions/admin-reports.mjs';
import { handler as adminMembershipsHandler } from '../netlify/functions/admin-memberships.mjs';
import { handler as wordnikDefinitionHandler } from '../netlify/functions/wordnikDefinition.mjs';
import { handler as wordnikRelatedWordsHandler } from '../netlify/functions/wordnikRelatedWords.mjs';

function parseBody(response) {
  return JSON.parse(response.body || '{}');
}

function assertErrorShape(payload) {
  assert.equal(typeof payload, 'object');
  assert.equal(typeof payload.error, 'string');
  assert.ok(payload.error.length > 0);
}

function assertSecurityHeaders(response) {
  const headers = response.headers || {};
  assert.equal(headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(headers['cache-control'], 'no-store');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'same-origin');
}

const methodGuardCases = [
  { name: 'public-posts', handler: publicPostsHandler, allowedMethod: 'GET' },
  { name: 'public-faqs', handler: publicFaqsHandler, allowedMethod: 'GET' },
  { name: 'public-feeds', handler: publicFeedsHandler, allowedMethod: 'GET' },
  { name: 'member-session', handler: memberSessionHandler, allowedMethod: 'GET' },
  { name: 'member-logout', handler: memberLogoutHandler, allowedMethod: 'POST' },
  { name: 'member-login', handler: memberLoginHandler, allowedMethod: 'POST' },
  { name: 'member-register', handler: memberRegisterHandler, allowedMethod: 'POST' },
  { name: 'member-learning-path-consume', handler: memberLearningPathConsumeHandler, allowedMethod: 'POST' },
  { name: 'member-learning-path-complete', handler: memberLearningPathCompleteHandler, allowedMethod: 'POST' },
  { name: 'member-account-recovery', handler: memberAccountRecoveryHandler, allowedMethod: 'POST' },
  { name: 'member-payment-checkout', handler: memberPaymentCheckoutHandler, allowedMethod: 'POST' },
  { name: 'member-payment-confirm', handler: memberPaymentConfirmHandler, allowedMethod: 'POST' },
  { name: 'stripe-webhook', handler: stripeWebhookHandler, allowedMethod: 'POST' },
  { name: 'admin-session', handler: adminSessionHandler, allowedMethod: 'GET' },
  { name: 'admin-logout', handler: adminLogoutHandler, allowedMethod: 'POST' },
  { name: 'admin-login', handler: adminLoginHandler, allowedMethod: 'POST' },
  { name: 'admin-click-tracking', handler: adminClickTrackingHandler, allowedMethod: 'GET' },
  { name: 'admin-reports', handler: adminReportsHandler, allowedMethod: 'GET' },
  { name: 'admin-memberships', handler: adminMembershipsHandler, allowedMethod: 'POST' },
];

for (const endpoint of methodGuardCases) {
  test(`${endpoint.name} rejects non-${endpoint.allowedMethod} with 405 + standard error payload + security headers`, async () => {
    const response = await endpoint.handler({ httpMethod: 'TRACE', headers: {} });
    assert.equal(response.statusCode, 405);
    const payload = parseBody(response);
    assert.deepEqual(payload, { error: 'Method not allowed' });
    assertErrorShape(payload);
    assertSecurityHeaders(response);
  });
}

test('wordnikRelatedWords validates missing word parameter boundary with 400 + error shape + security headers', async () => {
  const response = await wordnikRelatedWordsHandler({
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {},
  });

  assert.equal(response.statusCode, 400);
  const payload = parseBody(response);
  assert.equal(payload.error, 'Missing required query parameter: word');
  assertErrorShape(payload);
  assertSecurityHeaders(response);
});

test('wordnikDefinition validates missing word parameter boundary with 400 + error shape + security headers', async () => {
  const response = await wordnikDefinitionHandler({
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {},
  });

  assert.equal(response.statusCode, 400);
  const payload = parseBody(response);
  assert.equal(payload.error, 'Missing required query parameter: word');
  assertErrorShape(payload);
  assertSecurityHeaders(response);
});
