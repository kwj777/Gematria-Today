import { ensureMemberSchema, getSqlClient, jsonResponse, syncMembershipFromStripeSubscription } from './_member.mjs';
import { getMembershipPaymentConfig, getStripeConfig, getSubscription, verifyStripeWebhookSignature } from './_stripe.mjs';
import { logRequestAudit } from './_security.mjs';

const SUBSCRIPTION_EVENT_TYPES = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

function getHeader(event, name) {
  const headers = event.headers || {};
  const direct = headers[name];
  if (direct) {
    return direct;
  }
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

function parseEventBody(event) {
  if (!event.body) {
    return '';
  }
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return String(event.body);
}

export function toDateFromStripeEpoch(value) {
  return Number.isFinite(Number(value)) ? new Date(Number(value) * 1000) : null;
}

export function mapSubscriptionPayload(payload = {}) {
  const item = payload.items?.data?.[0] || {};
  const memberId = payload.metadata?.user_id || null;
  return {
    memberId,
    stripeCustomerId: payload.customer || null,
    stripeSubscriptionId: payload.id || null,
    stripeSubscriptionStatus: payload.status || null,
    currentPeriodStart: toDateFromStripeEpoch(item.current_period_start || payload.current_period_start),
    currentPeriodEnd: toDateFromStripeEpoch(item.current_period_end || payload.current_period_end),
  };
}

// Other apps bill through the same Stripe account, so subscription events
// arrive for subscriptions that are not memberships. Ours carry the membership
// product in their metadata (set at checkout); one an account already follows
// counts too.
async function isMembershipSubscription(sql, subscriptionId, payload) {
  if (payload?.metadata?.membership_product === getMembershipPaymentConfig().product) {
    return true;
  }
  await ensureMemberSchema(sql);
  const rows = await sql`
    SELECT id
    FROM users
    WHERE stripe_subscription_id = ${subscriptionId}
    LIMIT 1
  `;
  return rows.length > 0;
}

// Stripe neither orders its events nor stops retrying a failed one for days,
// so an event's copy of the subscription can be older than what the account
// already shows: a retried "active" update landing after the cancellation
// used to switch premium back on. Each event is only a cue to read the
// subscription as it is now and sync from that.
export async function syncSubscriptionEvent(sql, payload, { fetchSubscription = getSubscription } = {}) {
  const subscriptionId = String(payload?.id || '').trim();
  if (!subscriptionId || !(await isMembershipSubscription(sql, subscriptionId, payload))) {
    return { outcome: 'ignored', subscriptionId: subscriptionId || null };
  }

  let subscription;
  try {
    subscription = await fetchSubscription(subscriptionId, sql);
  } catch (error) {
    // Answering 2xx would tell Stripe the event was handled and it would never
    // be sent again; a 5xx has it retry once Stripe can be read.
    throw Object.assign(new Error(`Unable to read subscription ${subscriptionId} from Stripe: ${error.message || 'request failed'}`), { statusCode: 502 });
  }

  const member = await syncMembershipFromStripeSubscription(sql, mapSubscriptionPayload(subscription));
  return {
    outcome: member ? 'synced' : 'no_member',
    subscriptionId,
    subscriptionStatus: subscription?.status || null,
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const body = parseEventBody(event);
  if (!body) {
    return jsonResponse(400, { error: 'Missing request body' });
  }

  const signatureHeader = getHeader(event, 'stripe-signature');

  try {
    const sql = getSqlClient();
    const stripeConfig = await getStripeConfig(sql);
    if (!stripeConfig.webhookSigningSecret) {
      return jsonResponse(503, { error: 'Stripe webhook signing secret is not configured' });
    }

    const signatureValid = verifyStripeWebhookSignature({
      payload: body,
      signatureHeader,
      signingSecret: stripeConfig.webhookSigningSecret,
    });

    if (!signatureValid) {
      return jsonResponse(400, { error: 'Invalid Stripe webhook signature' });
    }

    let stripeEvent;
    try {
      stripeEvent = JSON.parse(body);
    } catch {
      return jsonResponse(400, { error: 'Invalid Stripe webhook payload' });
    }
    const eventType = String(stripeEvent.type || '');
    const object = stripeEvent.data?.object || {};

    const subscriptionSync = SUBSCRIPTION_EVENT_TYPES.has(eventType)
      ? await syncSubscriptionEvent(sql, object)
      : null;

    await logRequestAudit(sql, event, {
      route: 'stripe-webhook',
      action: 'event_received',
      outcome: 'success',
      metadata: { eventId: stripeEvent.id || null, eventType: eventType || null, ...(subscriptionSync ? { subscriptionSync } : {}) },
    });

    return jsonResponse(200, { received: true });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process Stripe webhook event' }, error.headers || {});
  }
}
