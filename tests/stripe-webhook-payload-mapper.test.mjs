import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mapSubscriptionPayload,
  toDateFromStripeEpoch,
} from '../netlify/functions/stripe-webhook.mjs';

// ---------- toDateFromStripeEpoch ----------

test('toDateFromStripeEpoch converts a Unix epoch seconds value to a Date', () => {
  const date = toDateFromStripeEpoch(1700000000);
  assert.ok(date instanceof Date);
  assert.equal(date.getTime(), 1700000000 * 1000);
});

test('toDateFromStripeEpoch coerces numeric strings', () => {
  const date = toDateFromStripeEpoch('1700000000');
  assert.equal(date.getTime(), 1700000000 * 1000);
});

test('toDateFromStripeEpoch returns null for non-numeric strings, undefined, and NaN', () => {
  // Note: Number(null) and Number('') both equal 0 (finite), so those coerce to
  // the unix epoch rather than returning null. Only truly non-finite values
  // (undefined -> NaN, NaN itself, non-numeric strings) round-trip to null.
  assert.equal(toDateFromStripeEpoch(undefined), null);
  assert.equal(toDateFromStripeEpoch('not-a-number'), null);
  assert.equal(toDateFromStripeEpoch(NaN), null);
});

test('toDateFromStripeEpoch accepts 0 as a valid epoch (unix epoch start)', () => {
  // Some Stripe payloads return 0 for "unknown" period boundaries. The current
  // implementation accepts 0 since 0 is finite; this pin documents that
  // behavior so a future refactor doesn't silently change it.
  const date = toDateFromStripeEpoch(0);
  assert.ok(date instanceof Date);
  assert.equal(date.getTime(), 0);
});

// ---------- mapSubscriptionPayload ----------

test('mapSubscriptionPayload extracts the standard subscription fields', () => {
  const payload = {
    id: 'sub_abc123',
    customer: 'cus_xyz789',
    status: 'active',
    metadata: { user_id: 'member-uuid-1' },
    items: {
      data: [{
        current_period_start: 1700000000,
        current_period_end: 1731622400,
      }],
    },
  };
  const result = mapSubscriptionPayload(payload);
  assert.equal(result.memberId, 'member-uuid-1');
  assert.equal(result.stripeCustomerId, 'cus_xyz789');
  assert.equal(result.stripeSubscriptionId, 'sub_abc123');
  assert.equal(result.stripeSubscriptionStatus, 'active');
  assert.equal(result.currentPeriodStart.getTime(), 1700000000 * 1000);
  assert.equal(result.currentPeriodEnd.getTime(), 1731622400 * 1000);
});

test('mapSubscriptionPayload falls back to top-level period fields when items[].current_period_* are absent', () => {
  // Stripe API 2024+ moved current_period_start/end onto subscription items
  // but older versions and some test fixtures still emit them at the top level.
  const payload = {
    id: 'sub_legacy',
    customer: 'cus_legacy',
    status: 'trialing',
    current_period_start: 1690000000,
    current_period_end: 1721536000,
    items: { data: [{}] },
    metadata: { user_id: 'm-2' },
  };
  const result = mapSubscriptionPayload(payload);
  assert.equal(result.currentPeriodStart.getTime(), 1690000000 * 1000);
  assert.equal(result.currentPeriodEnd.getTime(), 1721536000 * 1000);
});

test('mapSubscriptionPayload prefers items[].current_period_* over top-level when both are present', () => {
  const payload = {
    id: 'sub_x',
    customer: 'cus_x',
    status: 'active',
    current_period_start: 1000000000,
    current_period_end: 1100000000,
    items: {
      data: [{ current_period_start: 2000000000, current_period_end: 2100000000 }],
    },
  };
  const result = mapSubscriptionPayload(payload);
  assert.equal(result.currentPeriodStart.getTime(), 2000000000 * 1000);
  assert.equal(result.currentPeriodEnd.getTime(), 2100000000 * 1000);
});

test('mapSubscriptionPayload returns null memberId when metadata.user_id is absent', () => {
  const result = mapSubscriptionPayload({
    id: 'sub_no_meta',
    customer: 'cus_no_meta',
    status: 'active',
    items: { data: [{ current_period_end: 1700000000 }] },
  });
  assert.equal(result.memberId, null);
});

test('mapSubscriptionPayload tolerates missing items array entirely', () => {
  const result = mapSubscriptionPayload({
    id: 'sub_no_items',
    customer: 'cus_no_items',
    status: 'canceled',
  });
  assert.equal(result.stripeSubscriptionId, 'sub_no_items');
  assert.equal(result.stripeSubscriptionStatus, 'canceled');
  assert.equal(result.currentPeriodStart, null);
  assert.equal(result.currentPeriodEnd, null);
});

test('mapSubscriptionPayload returns nulls for every field when payload is empty', () => {
  const result = mapSubscriptionPayload({});
  assert.deepEqual(result, {
    memberId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeSubscriptionStatus: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
  });
});

test('mapSubscriptionPayload returns nulls when called with no argument', () => {
  // Defensive default-parameter behavior: defends against malformed Stripe events.
  const result = mapSubscriptionPayload();
  assert.equal(result.stripeSubscriptionId, null);
  assert.equal(result.memberId, null);
});

test('mapSubscriptionPayload returns null period boundaries when both sources are non-numeric', () => {
  const result = mapSubscriptionPayload({
    id: 'sub_bad',
    customer: 'cus_bad',
    status: 'active',
    current_period_start: 'never',
    current_period_end: null,
    items: { data: [{ current_period_start: undefined, current_period_end: 'soon' }] },
  });
  assert.equal(result.currentPeriodStart, null);
  assert.equal(result.currentPeriodEnd, null);
});
