import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBERSHIP_RENEWAL_GRACE_MS,
  authenticateMemberCredentials,
  formatCalculationHistory,
  formatMemberProfile,
  formatMemberUser,
  getEffectiveMembershipLevel,
  getYearlyMembershipTerm,
  isPremiumSubscriptionStatus,
  normalizeEmail,
} from '../netlify/functions/_member.mjs';
import { hashPassword } from '../netlify/functions/_auth.mjs';

// ---------- normalizeEmail ----------

test('normalizeEmail trims surrounding whitespace and lowercases', () => {
  assert.equal(normalizeEmail('  Foo@Example.COM  '), 'foo@example.com');
});

test('normalizeEmail returns an empty string for null, undefined, and empty input', () => {
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail('   '), '');
});

test('normalizeEmail coerces non-string input via String()', () => {
  assert.equal(normalizeEmail(42), '42');
});

// ---------- formatMemberUser ----------

test('formatMemberUser maps every column the function reads from the users row', () => {
  const row = {
    id: 'u-1',
    username: 'kev',
    email: 'kev@example.com',
    display_name: 'Kev',
    membership_level: 'premium',
    membership_started_at: '2025-01-01T00:00:00Z',
    membership_expires_at: '2026-01-01T00:00:00Z',
    stripe_customer_id: 'cus_abc',
    stripe_last_checkout_session_id: 'cs_xyz',
    stripe_subscription_id: 'sub_def',
    stripe_subscription_status: 'active',
    stripe_subscription_current_period_end: '2026-01-01T00:00:00Z',
    status: 'active',
    email_verified: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2025-06-01T00:00:00Z',
  };
  const result = formatMemberUser(row);
  assert.equal(result.id, 'u-1');
  assert.equal(result.username, 'kev');
  assert.equal(result.email, 'kev@example.com');
  assert.equal(result.displayName, 'Kev');
  assert.equal(result.membershipLevel, 'premium');
  assert.equal(result.membershipStartedAt, '2025-01-01T00:00:00Z');
  assert.equal(result.membershipExpiresAt, '2026-01-01T00:00:00Z');
  assert.equal(result.stripeCustomerId, 'cus_abc');
  assert.equal(result.stripeLastCheckoutSessionId, 'cs_xyz');
  assert.equal(result.stripeSubscriptionId, 'sub_def');
  assert.equal(result.stripeSubscriptionStatus, 'active');
  assert.equal(result.stripeSubscriptionCurrentPeriodEnd, '2026-01-01T00:00:00Z');
  assert.equal(result.status, 'active');
  assert.equal(result.emailVerified, true);
});

test('formatMemberUser does NOT expose the password_hash column (security invariant)', () => {
  const row = {
    id: 'u-1',
    username: 'kev',
    email: 'kev@example.com',
    password_hash: 'scrypt$salt$secret',
    display_name: 'Kev',
  };
  const result = formatMemberUser(row);
  assert.equal(Object.hasOwn(result, 'password_hash'), false);
  assert.equal(Object.hasOwn(result, 'passwordHash'), false);
  // Defense-in-depth: any property whose name contains "password" is forbidden.
  for (const key of Object.keys(result)) {
    assert.equal(/password/i.test(key), false, `formatMemberUser leaked a password-related field: ${key}`);
  }
});

test('formatMemberUser leaves missing columns as undefined rather than crashing', () => {
  const result = formatMemberUser({ id: 'u-1' });
  assert.equal(result.id, 'u-1');
  assert.equal(result.username, undefined);
  assert.equal(result.email, undefined);
});

// ---------- formatMemberProfile ----------

test('formatMemberProfile renames snake_case columns', () => {
  const row = {
    user_id: 'u-1',
    preferences: { learningPathStep1Intent: true },
    favorite_cipher: 'english-base-6',
    timezone: 'UTC',
    created_at: '2024-01-01',
    updated_at: '2025-01-01',
  };
  const result = formatMemberProfile(row);
  assert.equal(result.userId, 'u-1');
  assert.deepEqual(result.preferences, { learningPathStep1Intent: true });
  assert.equal(result.favoriteCipher, 'english-base-6');
  assert.equal(result.timezone, 'UTC');
  assert.equal(result.createdAt, '2024-01-01');
  assert.equal(result.updatedAt, '2025-01-01');
});

// ---------- formatCalculationHistory ----------

test('formatCalculationHistory maps every documented field', () => {
  const row = {
    id: 'c-1',
    user_id: 'u-1',
    query_text: 'gematria',
    query_type: 'word',
    calculator_source: 'calculator',
    gematria_total: 444,
    digital_root: 3,
    is_base_root: false,
    result_payload: { word: 'gematria' },
    note: 'spot check',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  };
  const result = formatCalculationHistory(row);
  assert.equal(result.userId, 'u-1');
  assert.equal(result.queryText, 'gematria');
  assert.equal(result.queryType, 'word');
  assert.equal(result.calculatorSource, 'calculator');
  assert.equal(result.gematriaTotal, 444);
  assert.equal(result.digitalRoot, 3);
  assert.equal(result.isBaseRoot, false);
  assert.deepEqual(result.resultPayload, { word: 'gematria' });
  assert.equal(result.note, 'spot check');
});

test('formatCalculationHistory normalizes a null note to an empty string', () => {
  const result = formatCalculationHistory({ id: 'c-1', note: null });
  assert.equal(result.note, '');
});

test('formatCalculationHistory normalizes a missing note column to an empty string', () => {
  const result = formatCalculationHistory({ id: 'c-1' });
  assert.equal(result.note, '');
});

// ---------- membership expiry ----------

const NOW = new Date('2026-10-02T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function premiumMember(overrides = {}) {
  return {
    membershipLevel: 'premium',
    membershipExpiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
    stripeSubscriptionStatus: null,
    ...overrides,
  };
}

test('isPremiumSubscriptionStatus accepts only the Stripe states that still carry premium', () => {
  for (const status of ['trialing', 'active', 'past_due', 'unpaid']) {
    assert.equal(isPremiumSubscriptionStatus(status), true, status);
  }
  for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'paused', '', null, undefined]) {
    assert.equal(isPremiumSubscriptionStatus(status), false, String(status));
  }
});

test('getEffectiveMembershipLevel keeps premium until membership_expires_at', () => {
  assert.equal(getEffectiveMembershipLevel(premiumMember(), NOW), 'premium');
});

test('getEffectiveMembershipLevel drops an admin-granted premium year to free once it ends', () => {
  // grant-premium writes a 365-day expiry and no Stripe subscription, so no
  // webhook will ever lower the level; only the expiry date can.
  const member = premiumMember({ membershipExpiresAt: '2025-09-30T00:00:00Z' });
  assert.equal(getEffectiveMembershipLevel(member, NOW), 'free');
});

test('getEffectiveMembershipLevel treats a lapsed premium row with a cancelled subscription as free', () => {
  const member = premiumMember({
    membershipExpiresAt: new Date(NOW.getTime() - DAY_MS),
    stripeSubscriptionStatus: 'canceled',
  });
  assert.equal(getEffectiveMembershipLevel(member, NOW), 'free');
});

test('getEffectiveMembershipLevel gives a live Stripe subscription a short renewal grace, and no more', () => {
  const justPast = premiumMember({
    membershipExpiresAt: new Date(NOW.getTime() - DAY_MS),
    stripeSubscriptionStatus: 'active',
  });
  assert.equal(getEffectiveMembershipLevel(justPast, NOW), 'premium');

  const pastGrace = premiumMember({
    membershipExpiresAt: new Date(NOW.getTime() - MEMBERSHIP_RENEWAL_GRACE_MS - 1000),
    stripeSubscriptionStatus: 'active',
  });
  assert.equal(getEffectiveMembershipLevel(pastGrace, NOW), 'free');

  // Without a live subscription there is no renewal to wait for.
  const noSubscription = premiumMember({ membershipExpiresAt: new Date(NOW.getTime() - 1000) });
  assert.equal(getEffectiveMembershipLevel(noSubscription, NOW), 'free');
});

test('getEffectiveMembershipLevel leaves premium without an end date, lifetime and free untouched', () => {
  assert.equal(getEffectiveMembershipLevel(premiumMember({ membershipExpiresAt: null }), NOW), 'premium');
  assert.equal(getEffectiveMembershipLevel({ membershipLevel: 'lifetime', membershipExpiresAt: '2020-01-01T00:00:00Z' }, NOW), 'lifetime');
  assert.equal(getEffectiveMembershipLevel({ membershipLevel: 'free', membershipExpiresAt: '2099-01-01T00:00:00Z' }, NOW), 'free');
  assert.equal(getEffectiveMembershipLevel(null, NOW), undefined);
});

test('getYearlyMembershipTerm uses the subscription period end, or one year from purchase without one', () => {
  const purchasedAt = new Date('2026-01-15T00:00:00Z');
  const periodEnd = new Date('2027-01-15T00:00:00Z');
  assert.equal(getYearlyMembershipTerm({ purchasedAt, subscriptionCurrentPeriodEnd: periodEnd }).expiresAt.getTime(), periodEnd.getTime());

  const term = getYearlyMembershipTerm({ purchasedAt });
  assert.equal(term.startedAt.getTime(), purchasedAt.getTime());
  assert.equal(term.expiresAt.toISOString(), '2027-01-15T00:00:00.000Z');
});

function createLoginSql(userRow) {
  return function sql(strings) {
    const query = strings.join('?');
    if (/password_hash[\s\S]*FROM users/i.test(query)) {
      return Promise.resolve([userRow]);
    }
    return Promise.resolve([]);
  };
}

async function memberLoginRow(overrides = {}) {
  return {
    id: 'u-1',
    username: 'kev',
    email: 'kev@example.com',
    display_name: 'Kev',
    membership_level: 'premium',
    membership_started_at: '2024-09-01T00:00:00Z',
    membership_expires_at: '2025-09-01T00:00:00Z',
    stripe_customer_id: null,
    stripe_last_checkout_session_id: null,
    stripe_subscription_status: null,
    status: 'active',
    email_verified: true,
    role: 'member',
    password_hash: await hashPassword('correct horse battery'),
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

test('authenticateMemberCredentials signs in a lapsed premium member as free', async () => {
  const sql = createLoginSql(await memberLoginRow());
  const member = await authenticateMemberCredentials(sql, 'kev', 'correct horse battery');
  assert.equal(member.membershipLevel, 'free');
  // The stored term is still reported so the member page can say when it ended.
  assert.equal(member.membershipExpiresAt, '2025-09-01T00:00:00Z');
});

test('authenticateMemberCredentials keeps a current premium member premium', async () => {
  const sql = createLoginSql(await memberLoginRow({ membership_expires_at: '2099-01-01T00:00:00Z' }));
  const member = await authenticateMemberCredentials(sql, 'kev', 'correct horse battery');
  assert.equal(member.membershipLevel, 'premium');
});
