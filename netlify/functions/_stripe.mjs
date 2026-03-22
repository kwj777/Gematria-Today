import { ensureAdminSchema } from './_admin.mjs';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const YEARLY_MEMBERSHIP_PRICE_CENTS = 555;
const YEARLY_MEMBERSHIP_LABEL = 'One Year Membership';
const YEARLY_MEMBERSHIP_INTERVAL_DAYS = 365;

async function getStoredStripeSetting(sql, key) {
  if (!sql) {
    return '';
  }

  await ensureAdminSchema(sql);
  const rows = await sql`
    SELECT setting_value
    FROM admin_settings
    WHERE setting_key = ${key}
    LIMIT 1
  `;

  return rows[0]?.setting_value || '';
}

export async function getStripeConfig(sql = null) {
  const secretKey = (await getStoredStripeSetting(sql, 'stripe_secret_key')) || process.env.STRIPE_SECRET_KEY || '';
  const publishableKey = (await getStoredStripeSetting(sql, 'stripe_publishable_key')) || process.env.STRIPE_PUBLISHABLE_KEY || '';
  const accountId = (await getStoredStripeSetting(sql, 'stripe_account_id')) || process.env.STRIPE_ACCOUNT_ID || '';
  const webhookSigningSecret = (await getStoredStripeSetting(sql, 'stripe_webhook_signing_secret')) || process.env.STRIPE_WEBHOOK_SIGNING_SECRET || '';

  if (!secretKey) {
    throw Object.assign(new Error('Missing Stripe secret key. Add it in the admin back-office or set STRIPE_SECRET_KEY.'), { statusCode: 500 });
  }

  return { secretKey, publishableKey, accountId, webhookSigningSecret };
}

async function stripeRequest(path, { sql = null, method = 'POST', body = null } = {}) {
  const stripeConfig = await getStripeConfig(sql);
  const headers = {
    Authorization: `Bearer ${stripeConfig.secretKey}`,
    ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
  };

  if (stripeConfig.accountId) {
    headers['Stripe-Account'] = stripeConfig.accountId;
  }

  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers,
    body: body ? body.toString() : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'Stripe request failed';
    throw Object.assign(new Error(message), { statusCode: response.status || 502 });
  }

  return payload;
}

function getSiteUrl(event) {
  const headers = event.headers || {};
  const host = headers['x-forwarded-host'] || headers.host || process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL;
  const protocol = headers['x-forwarded-proto'] || (String(host).includes('localhost') ? 'http' : 'https');

  if (!host) {
    throw Object.assign(new Error('Unable to determine site URL for Stripe checkout'), { statusCode: 500 });
  }

  return String(host).startsWith('http') ? String(host) : `${protocol}://${host}`;
}

export function getMembershipPaymentConfig() {
  return {
    product: 'yearly',
    amountCents: YEARLY_MEMBERSHIP_PRICE_CENTS,
    amountDisplay: '$5.55',
    label: YEARLY_MEMBERSHIP_LABEL,
    durationDays: YEARLY_MEMBERSHIP_INTERVAL_DAYS,
  };
}

export async function createMembershipCheckoutSession(event, member, sql = null) {
  const siteUrl = getSiteUrl(event);
  const membership = getMembershipPaymentConfig();
  const params = new URLSearchParams({
    mode: 'payment',
    success_url: `${siteUrl}/member.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/member.html?payment=cancelled`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': membership.label,
    'line_items[0][price_data][product_data][description]': 'Unlock one year of premium EndTimes.Today membership access.',
    'line_items[0][price_data][unit_amount]': String(membership.amountCents),
    'line_items[0][quantity]': '1',
    'metadata[user_id]': member.id,
    'metadata[membership_product]': membership.product,
    'customer_email': member.email,
    'client_reference_id': member.id,
    'allow_promotion_codes': 'false',
    'billing_address_collection': 'auto',
    'submit_type': 'pay',
  });

  return stripeRequest('/checkout/sessions', { sql, method: 'POST', body: params });
}

export async function getCheckoutSession(sessionId, sql = null) {
  if (!sessionId) {
    throw Object.assign(new Error('Missing Stripe session ID'), { statusCode: 400 });
  }

  return stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, { sql, method: 'GET' });
}
