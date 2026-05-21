import { getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { createBillingPortalSession } from './_stripe.mjs';
import { logRequestAudit } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });

    const portalSession = await createBillingPortalSession(event, member.stripeCustomerId, sql);
    await logRequestAudit(sql, event, {
      route: 'member-billing-portal',
      action: 'billing_portal_session',
      outcome: 'success',
      metadata: { memberId: member.id, sessionId: portalSession.id },
    });

    return jsonResponse(200, {
      portalUrl: portalSession.url,
      sessionId: portalSession.id,
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to open the Stripe billing portal' }, error.headers || {});
  }
}
