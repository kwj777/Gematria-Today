import { getAuthenticatedMember, getSqlClient, jsonResponse } from './_member.mjs';
import { createMembershipCheckoutSession, getMembershipPaymentConfig } from './_stripe.mjs';
import { logRequestAudit } from './_security.mjs';
import { assertSiteModuleEnabled } from './_site-modules.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    // Existing members keep their dashboard and billing portal when membership
    // is switched off; it is new charges that stop.
    await assertSiteModuleEnabled(getSqlClient(), 'membership', {
      message: 'Membership upgrades are currently unavailable.',
    });
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });

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
