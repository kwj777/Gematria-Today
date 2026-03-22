import { getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { createMembershipCheckoutSession, getMembershipPaymentConfig } from './_stripe.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    await applyRateLimit(sql, event, {
      scope: 'member-payment-checkout-ip',
      key: getClientIp(event),
      limit: 3,
      windowMs: 10 * 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many checkout attempts from this IP address.',
      auditMetadata: { memberId: member.id },
    });
    await applyRateLimit(sql, event, {
      scope: 'member-payment-checkout-member',
      key: member.id,
      limit: 3,
      windowMs: 10 * 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many checkout attempts for this membership account.',
    });

    const checkoutSession = await createMembershipCheckoutSession(event, member, sql);
    await logRequestAudit(sql, event, {
      route: 'member-payment-checkout',
      action: 'checkout_session',
      outcome: 'success',
      metadata: { memberId: member.id, sessionId: checkoutSession.id },
    });

    return jsonResponse(200, {
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      membership: getMembershipPaymentConfig(),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to create Stripe checkout session' }, error.headers || {});
  }
}
