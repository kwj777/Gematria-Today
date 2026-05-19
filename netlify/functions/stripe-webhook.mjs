import { getSqlClient, jsonResponse, syncMembershipFromStripeSubscription } from './_member.mjs';
import { getStripeConfig, verifyStripeWebhookSignature } from './_stripe.mjs';
import { logRequestAudit } from './_security.mjs';

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

function toDateFromStripeEpoch(value) {
  return Number.isFinite(Number(value)) ? new Date(Number(value) * 1000) : null;
}

function mapSubscriptionPayload(payload = {}) {
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

    if (eventType === 'customer.subscription.created'
      || eventType === 'customer.subscription.updated'
      || eventType === 'customer.subscription.deleted') {
      const mapped = mapSubscriptionPayload(object);
      await syncMembershipFromStripeSubscription(sql, mapped);
    }

    await logRequestAudit(sql, event, {
      route: 'stripe-webhook',
      action: 'event_received',
      outcome: 'success',
      metadata: { eventId: stripeEvent.id || null, eventType: eventType || null },
    });

    return jsonResponse(200, { received: true });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process Stripe webhook event' }, error.headers || {});
  }
}
