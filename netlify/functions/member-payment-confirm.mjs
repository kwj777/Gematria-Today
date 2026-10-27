import {
  activateYearlyMembership,
  createMemberTierCookie,
  getAuthenticatedMember,
  getYearlyMembershipTerm,
  isPremiumSubscriptionStatus,
  isUnsettledSubscriptionStatus,
  jsonResponse,
} from './_member.mjs';
import { getCheckoutSession, getMembershipPaymentConfig, getSubscription } from './_stripe.mjs';
import { logRequestAudit } from './_security.mjs';
import { mapSubscriptionPayload } from './stripe-webhook.mjs';

const MEMBER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

// A Checkout Session stays paid and complete in Stripe for good, so it only
// proves the member paid once. Premium has to follow the subscription that
// session started: re-sending the session ID from the success URL after a
// cancellation or refund used to switch premium straight back on, and with the
// subscription gone no webhook would ever switch it off again. A session with
// no subscription (a one-off payment) is held to its one-year term instead.
export function resolveCheckoutMembershipTerm(checkoutSession, subscription, now = new Date()) {
  // A new checkout is never past due or unpaid; only a renewal Stripe could
  // not collect is. Confirming it would grant the whole unpaid year that the
  // webhook holds to a short grace (see getSubscriptionPremiumExpiry), and a
  // new checkout is refused while it stays open, so the member settles it in
  // the billing portal.
  if (subscription && isUnsettledSubscriptionStatus(subscription.status)) {
    return { error: 'The renewal payment for this membership is overdue. Update your payment method under Manage subscription to restore supporter access.' };
  }

  if (subscription && !isPremiumSubscriptionStatus(subscription.status)) {
    return { error: 'This membership subscription is no longer active. Start a new checkout to renew supporter access.' };
  }

  const purchasedAt = checkoutSession.created ? new Date(checkoutSession.created * 1000) : new Date(now);
  const subscriptionCurrentPeriodEnd = subscription ? mapSubscriptionPayload(subscription).currentPeriodEnd : null;
  const { expiresAt } = getYearlyMembershipTerm({ purchasedAt, subscriptionCurrentPeriodEnd });
  if (expiresAt.getTime() <= now.getTime()) {
    return { error: 'The membership this payment covered has ended. Start a new checkout to renew supporter access.' };
  }

  return { purchasedAt, subscriptionCurrentPeriodEnd };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    const body = event.body ? JSON.parse(event.body) : {};
    const sessionId = String(body.sessionId || '').trim();

    if (!sessionId) {
      return jsonResponse(400, { error: 'Missing Stripe session ID' });
    }

    const checkoutSession = await getCheckoutSession(sessionId, sql);
    if (checkoutSession.payment_status !== 'paid' || checkoutSession.status !== 'complete') {
      return jsonResponse(409, { error: 'Payment has not completed yet' });
    }

    if (checkoutSession.client_reference_id !== member.id && checkoutSession.metadata?.user_id !== member.id) {
      return jsonResponse(403, { error: 'This checkout session does not belong to the signed-in member' });
    }

    const membership = getMembershipPaymentConfig();
    if (checkoutSession.metadata?.membership_product !== membership.product) {
      return jsonResponse(400, { error: 'Unsupported membership product' });
    }

    const subscriptionId = typeof checkoutSession.subscription === 'string' ? checkoutSession.subscription : checkoutSession.subscription?.id || '';
    const subscription = subscriptionId ? await getSubscription(subscriptionId, sql) : null;

    const term = resolveCheckoutMembershipTerm(checkoutSession, subscription);
    if (term.error) {
      await logRequestAudit(sql, event, {
        route: 'member-payment-confirm',
        action: 'payment_confirm',
        outcome: 'membership_inactive',
        metadata: { memberId: member.id, sessionId: checkoutSession.id, subscriptionStatus: subscription?.status || null },
      });
      return jsonResponse(409, { error: term.error });
    }

    const updatedMember = await activateYearlyMembership(sql, member.id, {
      stripeCustomerId: checkoutSession.customer || null,
      stripeCheckoutSessionId: checkoutSession.id,
      stripeSubscriptionId: subscription?.id || subscriptionId || null,
      stripeSubscriptionStatus: subscription?.status || null,
      subscriptionCurrentPeriodEnd: term.subscriptionCurrentPeriodEnd,
      purchasedAt: term.purchasedAt,
    });

    await logRequestAudit(sql, event, {
      route: 'member-payment-confirm',
      action: 'payment_confirm',
      outcome: 'success',
      metadata: { memberId: member.id, sessionId: checkoutSession.id },
    });

    const tierExpiresAt = new Date(Date.now() + MEMBER_SESSION_TTL_MS);
    return jsonResponse(200, {
      confirmed: true,
      member: updatedMember,
      payment: {
        sessionId: checkoutSession.id,
        amountTotal: checkoutSession.amount_total,
        currency: checkoutSession.currency,
        status: checkoutSession.payment_status,
        subscriptionId: subscription?.id || subscriptionId || null,
      },
      membership,
    }, {
      'set-cookie': createMemberTierCookie(updatedMember?.membershipLevel || 'premium', tierExpiresAt),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to confirm membership payment' }, error.headers || {});
  }
}
