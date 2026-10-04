import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCheckoutMembershipTerm } from '../netlify/functions/member-payment-confirm.mjs';

const NOW = new Date('2026-10-02T12:00:00Z');
const DAY_SECONDS = 24 * 60 * 60;
const nowSeconds = Math.floor(NOW.getTime() / 1000);

// A Checkout Session keeps payment_status 'paid' and status 'complete' in Stripe
// forever, which is all the confirm endpoint used to look at.
function paidCheckoutSession(overrides = {}) {
  return {
    id: 'cs_123',
    payment_status: 'paid',
    status: 'complete',
    created: nowSeconds - 400 * DAY_SECONDS,
    subscription: 'sub_1',
    ...overrides,
  };
}

function subscription(status, periodEndSeconds, { itemLevel = true } = {}) {
  return itemLevel
    ? { id: 'sub_1', status, items: { data: [{ current_period_end: periodEndSeconds }] } }
    : { id: 'sub_1', status, current_period_end: periodEndSeconds };
}

test('replaying a paid session after the subscription was cancelled does not restore premium', () => {
  const result = resolveCheckoutMembershipTerm(
    paidCheckoutSession(),
    subscription('canceled', nowSeconds - 35 * DAY_SECONDS),
    NOW,
  );
  assert.match(result.error, /no longer active/);
  assert.equal(result.subscriptionCurrentPeriodEnd, undefined);
});

test('a subscription that never went live cannot be confirmed into premium', () => {
  for (const status of ['incomplete', 'incomplete_expired', 'paused', 'unpaid']) {
    const result = resolveCheckoutMembershipTerm(paidCheckoutSession(), subscription(status, nowSeconds + DAY_SECONDS), NOW);
    assert.ok(result.error, status);
  }
});

test('a live subscription is confirmed with its item-level period end as the expiry', () => {
  const periodEnd = nowSeconds + 300 * DAY_SECONDS;
  const result = resolveCheckoutMembershipTerm(paidCheckoutSession({ created: nowSeconds - 60 }), subscription('active', periodEnd), NOW);
  assert.equal(result.error, undefined);
  assert.equal(result.subscriptionCurrentPeriodEnd.getTime(), periodEnd * 1000);
  assert.equal(result.purchasedAt.getTime(), (nowSeconds - 60) * 1000);
});

test('older Stripe API versions that report the period end on the subscription still work', () => {
  const periodEnd = nowSeconds + 300 * DAY_SECONDS;
  const result = resolveCheckoutMembershipTerm(
    paidCheckoutSession(),
    subscription('trialing', periodEnd, { itemLevel: false }),
    NOW,
  );
  assert.equal(result.error, undefined);
  assert.equal(result.subscriptionCurrentPeriodEnd.getTime(), periodEnd * 1000);
});

test('a session with no subscription is held to one year from the purchase', () => {
  const recent = resolveCheckoutMembershipTerm(
    paidCheckoutSession({ subscription: null, created: nowSeconds - 30 * DAY_SECONDS }),
    null,
    NOW,
  );
  assert.equal(recent.error, undefined);
  assert.equal(recent.subscriptionCurrentPeriodEnd, null);

  const lapsed = resolveCheckoutMembershipTerm(
    paidCheckoutSession({ subscription: null, created: nowSeconds - 400 * DAY_SECONDS }),
    null,
    NOW,
  );
  assert.match(lapsed.error, /has ended/);
});

test('replaying a paid session while the renewal is past due does not grant the unpaid year', () => {
  const result = resolveCheckoutMembershipTerm(
    paidCheckoutSession(),
    subscription('past_due', nowSeconds + 360 * DAY_SECONDS),
    NOW,
  );
  assert.match(result.error, /overdue/);
  assert.equal(result.subscriptionCurrentPeriodEnd, undefined);
});

test('an unpaid renewal is sent to Manage subscription, not to a new checkout that would be refused', () => {
  for (const status of ['past_due', 'unpaid']) {
    const result = resolveCheckoutMembershipTerm(
      paidCheckoutSession(),
      subscription(status, nowSeconds + 360 * DAY_SECONDS),
      NOW,
    );
    assert.match(result.error, /Manage subscription/, status);
    assert.doesNotMatch(result.error, /new checkout/, status);
  }
});
