import { activateYearlyMembership, getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { getCheckoutSession, getMembershipPaymentConfig } from './_stripe.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    await applyRateLimit(sql, event, {
      scope: 'member-payment-confirm-ip',
      key: getClientIp(event),
      limit: 6,
      windowMs: 10 * 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many payment confirmation attempts from this IP address.',
      auditMetadata: { memberId: member.id },
    });

    const body = event.body ? JSON.parse(event.body) : {};
    const sessionId = String(body.sessionId || '').trim();

    if (!sessionId) {
      return jsonResponse(400, { error: 'Missing Stripe session ID' });
    }

    await applyRateLimit(sql, event, {
      scope: 'member-payment-confirm-session',
      key: sessionId,
      limit: 5,
      windowMs: 10 * 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many confirmation attempts for this Stripe session.',
    });

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

    const updatedMember = await activateYearlyMembership(sql, member.id, {
      stripeCustomerId: checkoutSession.customer || null,
      stripeCheckoutSessionId: checkoutSession.id,
      purchasedAt: checkoutSession.created ? new Date(checkoutSession.created * 1000) : new Date(),
    });

    await logRequestAudit(sql, event, {
      route: 'member-payment-confirm',
      action: 'payment_confirm',
      outcome: 'success',
      metadata: { memberId: member.id, sessionId: checkoutSession.id },
    });

    return jsonResponse(200, {
      confirmed: true,
      member: updatedMember,
      payment: {
        sessionId: checkoutSession.id,
        amountTotal: checkoutSession.amount_total,
        currency: checkoutSession.currency,
        status: checkoutSession.payment_status,
      },
      membership,
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to confirm membership payment' }, error.headers || {});
  }
}
