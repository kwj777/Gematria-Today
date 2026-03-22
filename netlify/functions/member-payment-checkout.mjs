import { getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { createMembershipCheckoutSession, getMembershipPaymentConfig } from './_stripe.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    const checkoutSession = await createMembershipCheckoutSession(event, member, sql);

    return jsonResponse(200, {
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      membership: getMembershipPaymentConfig(),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to create Stripe checkout session' });
  }
}
