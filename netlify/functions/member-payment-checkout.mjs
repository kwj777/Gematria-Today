import { getAuthenticatedMember, getSqlClient, isUnsettledSubscriptionStatus, jsonResponse } from './_member.mjs';
import { createMembershipCheckoutSession, getMembershipPaymentConfig } from './_stripe.mjs';
import { logRequestAudit } from './_security.mjs';
import { assertSiteModuleEnabled } from './_site-modules.mjs';

// A second checkout for an account that is already premium starts a second
// subscription billed every year alongside the first, and cancelling either
// one used to switch premium off. Premium members manage or renew the
// subscription they have through the billing portal instead. So does a member
// whose renewal is overdue: their premium has ended, but the open subscription
// still charges if Stripe's retry or the invoice is paid later.
export function getCheckoutRefusal(member) {
  if (member?.membershipLevel === 'lifetime') {
    return 'This account already has lifetime premium access, so there is nothing to buy.';
  }
  if (member?.membershipLevel === 'premium') {
    return member.stripeCustomerId
      ? 'Your premium membership is already active. Use Manage subscription to update billing or renewal.'
      : 'Your premium membership is already active. You can subscribe once it ends.';
  }
  if (member?.stripeCustomerId && isUnsettledSubscriptionStatus(member.stripeSubscriptionStatus)) {
    return 'The renewal payment for your membership is overdue. Use Manage subscription to update your payment method, or to cancel that subscription before starting a new one.';
  }
  return '';
}

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

    const refusal = getCheckoutRefusal(member);
    if (refusal) {
      return jsonResponse(409, { error: refusal });
    }

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
