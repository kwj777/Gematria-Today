import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { neonConfig } from '@neondatabase/serverless';

import { syncMembershipFromStripeSubscription } from '../netlify/functions/_member.mjs';
import { handler as stripeWebhookHandler, syncSubscriptionEvent } from '../netlify/functions/stripe-webhook.mjs';

const DAY_SECONDS = 24 * 60 * 60;
const nowSeconds = Math.floor(Date.now() / 1000);

function subscription(status, overrides = {}) {
  return {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status,
    metadata: { user_id: 'member-1', membership_product: 'yearly' },
    items: {
      data: [{
        current_period_start: nowSeconds - 30 * DAY_SECONDS,
        current_period_end: nowSeconds + 335 * DAY_SECONDS,
      }],
    },
    ...overrides,
  };
}

// ---------- the sync statement ----------

function createSqlStub({ storedSubscriptionRows = [] } = {}) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ strings, text, values });
    if (/SELECT id\s+FROM users\s+WHERE stripe_subscription_id/.test(text)) {
      return Promise.resolve(storedSubscriptionRows);
    }
    if (/UPDATE users\s+SET membership_level = \?/.test(text)) {
      return Promise.resolve([{ id: 'member-1', membership_level: values[0] }]);
    }
    return Promise.resolve([]);
  };
  return {
    sql,
    calls,
    updates: () => calls.filter((call) => /UPDATE users\s+SET membership_level = \?/.test(call.text)),
  };
}

// The value bound right after the SQL fragment that ends with `pattern`.
function boundAfter(call, pattern) {
  const index = call.strings.findIndex((fragment) => pattern.test(fragment));
  assert.notEqual(index, -1, `no fragment matches ${pattern}`);
  return call.values[index];
}

test('an ended subscription only lowers an account still following that subscription', async () => {
  const stub = createSqlStub();
  await syncMembershipFromStripeSubscription(stub.sql, {
    memberId: 'member-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_old',
    stripeSubscriptionStatus: 'canceled',
  });

  const [update] = stub.updates();
  // Cancelling an old or duplicate subscription matched the member by
  // metadata.user_id and set them free while a newer one was still paying.
  assert.match(update.text, /\)\s+AND \(\s*\?::boolean\s+OR stripe_subscription_id = \?\s*\)\s+RETURNING/);
  assert.equal(boundAfter(update, /AND \(\s*$/), false);
  assert.equal(boundAfter(update, /::boolean\s+OR stripe_subscription_id = $/), 'sub_old');
  assert.equal(update.values[0], 'free');
});

test('a live subscription grants premium and becomes the one the account follows', async () => {
  const stub = createSqlStub();
  await syncMembershipFromStripeSubscription(stub.sql, {
    memberId: 'member-1',
    stripeSubscriptionId: 'sub_new',
    stripeSubscriptionStatus: 'active',
    currentPeriodEnd: new Date('2027-10-01T00:00:00Z'),
  });

  const [update] = stub.updates();
  assert.equal(update.values[0], 'premium');
  assert.equal(boundAfter(update, /AND \(\s*$/), true);
  assert.equal(boundAfter(update, /stripe_subscription_id = COALESCE\($/), 'sub_new');
  assert.equal(boundAfter(update, /membership_expires_at = $/), '2027-10-01T00:00:00.000Z');
});

test('a past-due subscription keeps premium only from the start of its unpaid period', async () => {
  const stub = createSqlStub();
  await syncMembershipFromStripeSubscription(stub.sql, {
    memberId: 'member-1',
    stripeSubscriptionId: 'sub_1',
    stripeSubscriptionStatus: 'past_due',
    currentPeriodStart: new Date('2026-09-30T00:00:00Z'),
    currentPeriodEnd: new Date('2027-09-30T00:00:00Z'),
  });

  const [update] = stub.updates();
  assert.equal(update.values[0], 'premium');
  assert.equal(boundAfter(update, /membership_expires_at = $/), '2026-09-30T00:00:00.000Z');
  // The stored Stripe period end still says what Stripe says.
  assert.equal(boundAfter(update, /stripe_subscription_current_period_end = $/), '2027-09-30T00:00:00.000Z');
});

test('an unpaid subscription takes premium away', async () => {
  const stub = createSqlStub();
  await syncMembershipFromStripeSubscription(stub.sql, {
    memberId: 'member-1',
    stripeSubscriptionId: 'sub_1',
    stripeSubscriptionStatus: 'unpaid',
  });
  assert.equal(stub.updates()[0].values[0], 'free');
});

// ---------- each event re-reads the subscription ----------

test('a retried "active" event is synced from the subscription as Stripe has it now', async () => {
  const stub = createSqlStub();
  const fetched = [];
  const result = await syncSubscriptionEvent(stub.sql, subscription('active'), {
    fetchSubscription: async (id) => {
      fetched.push(id);
      return subscription('canceled');
    },
  });

  assert.deepEqual(fetched, ['sub_1']);
  assert.equal(result.outcome, 'synced');
  const [update] = stub.updates();
  assert.equal(update.values[0], 'free');
  assert.equal(boundAfter(update, /stripe_subscription_status = COALESCE\($/), 'canceled');
});

test('a late event with an old status cannot downgrade a member Stripe shows as active', async () => {
  const stub = createSqlStub();
  await syncSubscriptionEvent(stub.sql, subscription('incomplete'), {
    fetchSubscription: async () => subscription('active'),
  });
  assert.equal(stub.updates()[0].values[0], 'premium');
});

test('subscriptions that belong to other apps on the Stripe account are left alone', async () => {
  const stub = createSqlStub();
  let fetchedCount = 0;
  const result = await syncSubscriptionEvent(stub.sql, subscription('active', { id: 'sub_other', metadata: { app: 'stellarreach', user_id: '42' } }), {
    fetchSubscription: async () => {
      fetchedCount += 1;
      return subscription('active');
    },
  });

  assert.equal(result.outcome, 'ignored');
  assert.equal(fetchedCount, 0);
  assert.equal(stub.updates().length, 0);
});

test('a subscription an account already follows is synced even without the membership metadata', async () => {
  const stub = createSqlStub({ storedSubscriptionRows: [{ id: 'member-1' }] });
  const result = await syncSubscriptionEvent(stub.sql, subscription('active', { metadata: {} }), {
    fetchSubscription: async () => subscription('canceled', { metadata: {} }),
  });
  assert.equal(result.outcome, 'synced');
  assert.equal(stub.updates()[0].values[0], 'free');
});

test('a Stripe read failure is an error, never a quiet success', async () => {
  const stub = createSqlStub();
  await assert.rejects(
    () => syncSubscriptionEvent(stub.sql, subscription('active'), {
      fetchSubscription: async () => {
        throw Object.assign(new Error('Rate limited'), { statusCode: 429 });
      },
    }),
    (error) => error.statusCode === 502 && /sub_1/.test(error.message),
  );
  assert.equal(stub.updates().length, 0);
});

// ---------- through the real handler ----------

// The handler builds its own client from DATABASE_URL, so the fake sits at
// Neon's HTTP boundary; Stripe is reached through the global fetch.
const SIGNING_SECRET = 'whsec_sync_test';
const PRIOR = {
  DATABASE_URL: process.env.DATABASE_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SIGNING_SECRET: process.env.STRIPE_WEBHOOK_SIGNING_SECRET,
  STRIPE_ACCOUNT_ID: process.env.STRIPE_ACCOUNT_ID,
};
const PRIOR_NEON_FETCH = neonConfig.fetchFunction;
const PRIOR_FETCH = globalThis.fetch;

test.after(() => {
  neonConfig.fetchFunction = PRIOR_NEON_FETCH;
  globalThis.fetch = PRIOR_FETCH;
  for (const [key, value] of Object.entries(PRIOR)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function neonResult(rows) {
  const names = rows.length ? Object.keys(rows[0]) : [];
  return {
    command: 'SELECT',
    rowCount: rows.length,
    fields: names.map((name) => ({ name, dataTypeID: 25 })),
    rows: rows.map((row) => names.map((name) => (row[name] === null ? null : String(row[name])))),
  };
}

async function deliver(stripeEvent, { stripeResponse }) {
  process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
  process.env.STRIPE_SECRET_KEY = 'sk_test_webhook';
  process.env.STRIPE_WEBHOOK_SIGNING_SECRET = SIGNING_SECRET;
  delete process.env.STRIPE_ACCOUNT_ID;

  const db = { updates: [], audits: [] };
  neonConfig.fetchFunction = async (_url, init) => {
    const { query, params } = JSON.parse(init.body);
    let rows = [];
    if (/UPDATE users\s+SET membership_level = \$1/.test(query)) {
      db.updates.push(params);
      rows = [{ id: 'member-1', membership_level: params[0] }];
    } else if (/INSERT INTO request_audit_log/.test(query)) {
      db.audits.push(params);
    }
    return new Response(JSON.stringify(neonResult(rows)), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const stripeCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    stripeCalls.push({ url: String(url), headers: init.headers || {} });
    const { status = 200, body } = stripeResponse;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };

  const payload = JSON.stringify(stripeEvent);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(`${timestamp}.${payload}`).digest('hex');
  const response = await stripeWebhookHandler({
    httpMethod: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}`, 'x-forwarded-for': '203.0.113.9' },
    body: payload,
  });
  return { response, db, stripeCalls };
}

function subscriptionEvent(type, object) {
  return { id: `evt_${type}`, type, data: { object } };
}

test('the webhook syncs a retried event from the live subscription, not its stale payload', async () => {
  const { response, db, stripeCalls } = await deliver(
    subscriptionEvent('customer.subscription.updated', subscription('active')),
    { stripeResponse: { body: subscription('canceled') } },
  );

  assert.equal(response.statusCode, 200);
  assert.equal(stripeCalls.length, 1);
  assert.match(stripeCalls[0].url, /\/v1\/subscriptions\/sub_1$/);
  assert.equal(db.updates.length, 1);
  assert.equal(db.updates[0][0], 'free');
  assert.ok(db.updates[0].includes('canceled'));
});

test('the webhook answers 5xx when Stripe cannot be read, so Stripe retries the event', async () => {
  const { response, db } = await deliver(
    subscriptionEvent('customer.subscription.deleted', subscription('canceled')),
    { stripeResponse: { status: 500, body: { error: { message: 'Stripe is down' } } } },
  );

  assert.equal(response.statusCode, 502);
  assert.equal(db.updates.length, 0);
  assert.equal(db.audits.length, 0);
});

test('the webhook acknowledges subscription events from other apps without touching members', async () => {
  const { response, db, stripeCalls } = await deliver(
    subscriptionEvent('customer.subscription.updated', subscription('active', { id: 'sub_stellar', metadata: { app: 'stellarreach' } })),
    { stripeResponse: { body: {} } },
  );

  assert.equal(response.statusCode, 200);
  assert.equal(stripeCalls.length, 0);
  assert.equal(db.updates.length, 0);
});
