import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import {
  STRIPE_API_VERSION,
  createMembershipCheckoutSession,
  getMembershipPaymentConfig,
  getSubscription,
} from '../netlify/functions/_stripe.mjs';
import { getCheckoutRefusal } from '../netlify/functions/member-payment-checkout.mjs';

// The Stripe helpers fall back to these when no sql client is passed, and
// reach Stripe through the global fetch, which each test replaces.
const PRIOR_ENV = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_ACCOUNT_ID: process.env.STRIPE_ACCOUNT_ID,
};
const PRIOR_FETCH = globalThis.fetch;

test.before(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_membership';
  process.env.STRIPE_ACCOUNT_ID = 'acct_gematria';
});

test.after(() => {
  globalThis.fetch = PRIOR_FETCH;
  for (const [key, value] of Object.entries(PRIOR_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const CHECKOUT_EVENT = { headers: { host: 'gematria.today', 'x-forwarded-proto': 'https' } };
const MEMBER = { id: 'member-1', email: 'kev@example.com', stripeCustomerId: null };

function stripeError(status, code, param = null) {
  return { status, body: { error: { code, param, message: `${code} (${param || 'none'})` } } };
}

// routes maps "METHOD /path" to a queue of { status, body } answers.
function stubStripe(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const key = `${init.method || 'GET'} ${pathname.replace(/^\/v1/, '')}`;
    calls.push({ key, headers: init.headers || {}, body: new URLSearchParams(init.body || '') });
    const queue = routes[key];
    if (!queue || !queue.length) {
      throw new Error(`Unexpected Stripe request: ${key}`);
    }
    const { status = 200, body } = queue.shift();
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

const SESSION = { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' };

test('checkout bills $19 as a yearly recurring price, so every renewal is $19 too', async () => {
  const membership = getMembershipPaymentConfig();
  const calls = stubStripe({
    'POST /checkout/sessions': [{ body: SESSION }],
  });

  const session = await createMembershipCheckoutSession(CHECKOUT_EVENT, MEMBER, null);
  assert.equal(session.id, SESSION.id);
  assert.deepEqual(calls.map((call) => call.key), ['POST /checkout/sessions']);

  const checkout = calls[0].body;
  // The subscription's own price is what the first invoice and every renewal
  // bill, and it is the $19 a year the Terms and the upgrade panel state.
  assert.equal(membership.amountCents, 1900);
  assert.equal(checkout.get('line_items[0][price_data][unit_amount]'), String(membership.amountCents));
  assert.equal(checkout.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(checkout.get('line_items[0][price_data][recurring][interval]'), 'year');
  assert.equal(checkout.get('line_items[0][price_data][recurring][interval_count]'), '1');
  assert.equal([...checkout.keys()].some((key) => key.startsWith('discounts')), false);
  assert.equal(checkout.get('allow_promotion_codes'), 'false');
  assert.equal(checkout.get('customer_email'), MEMBER.email);
  assert.equal(checkout.has('customer'), false);
  assert.equal(checkout.get('subscription_data[metadata][membership_product]'), membership.product);
  const description = checkout.get('line_items[0][price_data][product_data][description]');
  assert.match(description, /\$19 per year, renewing at \$19 per year/);
  assert.doesNotMatch(description, /\$29|first year|introductory|regularly/i);
});

test('every Stripe request pins the API version and keeps the configured Stripe-Account', async () => {
  const calls = stubStripe({
    'POST /checkout/sessions': [{ body: SESSION }],
    'GET /subscriptions/sub_1': [{ body: { id: 'sub_1', status: 'active' } }],
  });

  await createMembershipCheckoutSession(CHECKOUT_EVENT, MEMBER, null);
  await getSubscription('sub_1', null);

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.headers['Stripe-Version'], STRIPE_API_VERSION, call.key);
    assert.equal(call.headers['Stripe-Account'], 'acct_gematria', call.key);
  }
  assert.equal(STRIPE_API_VERSION, '2026-02-25.clover');
});

test('a returning member checks out as their existing Stripe customer', async () => {
  const calls = stubStripe({
    'POST /checkout/sessions': [{ body: SESSION }],
  });

  await createMembershipCheckoutSession(CHECKOUT_EVENT, { ...MEMBER, stripeCustomerId: 'cus_existing' }, null);
  const checkout = calls.at(-1).body;
  assert.equal(checkout.get('customer'), 'cus_existing');
  assert.equal(checkout.get('customer_update[address]'), 'auto');
  assert.equal(checkout.get('customer_update[name]'), 'auto');
  // Stripe accepts only one of customer and customer_email.
  assert.equal(checkout.has('customer_email'), false);
});

test('a stored customer this Stripe account does not know falls back to a new one', async () => {
  const calls = stubStripe({
    'POST /checkout/sessions': [stripeError(400, 'resource_missing', 'customer'), { body: SESSION }],
  });

  const session = await createMembershipCheckoutSession(CHECKOUT_EVENT, { ...MEMBER, stripeCustomerId: 'cus_test_mode' }, null);
  assert.equal(session.id, SESSION.id);
  const retry = calls.at(-1).body;
  assert.equal(retry.has('customer'), false);
  assert.equal(retry.get('customer_email'), MEMBER.email);
});

test('other checkout failures are not retried', async () => {
  const calls = stubStripe({
    'POST /checkout/sessions': [stripeError(400, 'parameter_invalid_integer', 'line_items')],
  });

  await assert.rejects(
    () => createMembershipCheckoutSession(CHECKOUT_EVENT, { ...MEMBER, stripeCustomerId: 'cus_existing' }, null),
    (error) => error.statusCode === 400,
  );
  assert.equal(calls.filter((call) => call.key === 'POST /checkout/sessions').length, 1);
});

// ---------- a second subscription for a premium account ----------

test('checkout is refused to members who already have premium', () => {
  assert.match(getCheckoutRefusal({ membershipLevel: 'premium', stripeCustomerId: 'cus_1' }), /Manage subscription/);
  assert.match(getCheckoutRefusal({ membershipLevel: 'premium', stripeCustomerId: null }), /already active/);
  assert.match(getCheckoutRefusal({ membershipLevel: 'lifetime' }), /lifetime/);
  assert.equal(getCheckoutRefusal({ membershipLevel: 'free' }), '');
  // getAuthenticatedMember reports a lapsed premium term as free, so a member
  // whose year ran out can subscribe again.
  assert.equal(getCheckoutRefusal({ membershipLevel: 'free', stripeCustomerId: 'cus_1' }), '');
  assert.equal(getCheckoutRefusal({ membershipLevel: 'free', stripeCustomerId: 'cus_1', stripeSubscriptionStatus: 'canceled' }), '');
});

test('checkout is refused while a renewal Stripe could not collect is still open', () => {
  // Premium ends three days into past_due and at once when unpaid, but Stripe
  // keeps the subscription open and paying its invoice makes it active again.
  // A second checkout would add another yearly subscription on the same
  // customer.
  for (const status of ['past_due', 'unpaid', ' past_due ']) {
    const refusal = getCheckoutRefusal({ membershipLevel: 'free', stripeCustomerId: 'cus_1', stripeSubscriptionStatus: status });
    assert.match(refusal, /overdue/, status);
    assert.match(refusal, /Manage subscription/, status);
  }
  // Within the renewal grace the member still reads as premium.
  assert.match(getCheckoutRefusal({ membershipLevel: 'premium', stripeCustomerId: 'cus_1', stripeSubscriptionStatus: 'past_due' }), /Manage subscription/);
  // With no Stripe customer there is no portal to send them to.
  assert.equal(getCheckoutRefusal({ membershipLevel: 'free', stripeCustomerId: null, stripeSubscriptionStatus: 'past_due' }), '');
});

test('the member page offers Manage subscription, not checkout, while a renewal is overdue', () => {
  const script = readFileSync(new URL('../page-scripts/member-1.js', import.meta.url), 'utf8');
  const unsettled = script.match(/function hasUnsettledSubscription\(member\) \{[\s\S]*?\n {6}\}/);
  assert.ok(unsettled, 'member-1.js defines hasUnsettledSubscription');
  // The page agrees with getCheckoutRefusal on who is sent to the portal.
  const hasUnsettledSubscription = vm.runInNewContext(`(${unsettled[0]})`);
  for (const status of ['past_due', 'unpaid']) {
    const member = { membershipLevel: 'free', stripeCustomerId: 'cus_1', stripeSubscriptionStatus: status };
    assert.equal(hasUnsettledSubscription(member), true, status);
    assert.notEqual(getCheckoutRefusal(member), '', status);
  }
  for (const member of [
    { membershipLevel: 'free', stripeCustomerId: 'cus_1', stripeSubscriptionStatus: 'canceled' },
    { membershipLevel: 'free', stripeCustomerId: null, stripeSubscriptionStatus: 'past_due' },
    null,
  ]) {
    assert.equal(hasUnsettledSubscription(member), false);
    assert.equal(getCheckoutRefusal(member), '');
  }

  const body = (name) => script.match(new RegExp(`function ${name}\\(member = session\\?\\.member\\) \\{([\\s\\S]*?)\\n {6}\\}`))?.[1] || '';
  // The checkout button is disabled for them ...
  assert.match(body('syncPaymentButton'), /isOverdue = [^;]*hasUnsettledSubscription\(member\)/);
  assert.match(body('syncPaymentButton'), /paymentButton\.disabled = [^;]*isOverdue/);
  // ... and Manage subscription is shown and opens for them.
  assert.match(body('syncMessageCenterAccess'), /manageSubscriptionButton[^;]*hasUnsettledSubscription\(member\)/);
  const portalClick = script.match(/manageSubscriptionButton\?\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n {6}\}\);/);
  assert.ok(portalClick, 'member-1.js handles Manage subscription clicks');
  assert.match(portalClick[1], /hasUnsettledSubscription\(session\?\.member\)/);
});

// ---------- the published prices match what Stripe bills ----------

test('the upgrade panel and the Terms state the $19 a year, renewing at $19, that checkout bills', () => {
  const { amountCents, amountDisplay } = getMembershipPaymentConfig();
  assert.equal(amountCents, 1900);
  assert.equal(amountDisplay, '$19');

  const terms = readFileSync(new URL('../src/terms.html', import.meta.url), 'utf8');
  assert.match(terms, /<strong>USD \$19 \/ year<\/strong>, renewing at <strong>USD \$19 \/ year<\/strong>/);
  assert.match(terms, /<strong>USD \$19 per year<\/strong>, and each renewal is charged at <strong>USD \$19 per year<\/strong>/);
  assert.match(terms, /the recurring USD \$19 yearly renewal charge/);

  const member = readFileSync(new URL('../src/member.html', import.meta.url), 'utf8');
  assert.equal(member.match(/<span>\$19 \/ year<\/span><small>renews at \$19 \/ year<\/small>/g)?.length, 2);
  assert.match(member, /<strong>\$19 per year<\/strong>, renewing at <strong>\$19 per year<\/strong> until you cancel/);
  assert.match(member, /Auto-renews each year at \$19\/year unless you cancel/);
  assert.match(member, /<div class="membership-price-badge">\$19 \/ year<\/div>/);
  assert.match(member, /US\$19\/year, renews at US\$19\/year/);

  // No higher renewal price, struck-through reference price or introductory
  // framing is left: the subscription renews at $19.
  for (const [name, page] of [['terms.html', terms], ['member.html', member]]) {
    assert.doesNotMatch(page, /\$\s?29|29 ?\/ ?(year|yr)/, name);
    assert.doesNotMatch(page, /introductory|regularly|regular (renewal )?price|then-current|\bintro\b|first year/i, name);
  }
  assert.doesNotMatch(member, /text-decoration-line-through/);
});
