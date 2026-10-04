import {
  AUTH_COOKIES,
  clearMemberTierCookie,
  clearSessionCookie,
  createMemberEmailVerificationRequest,
  getSqlClient,
  jsonResponse,
  parseBody,
  registerMember,
  releaseUnverifiedMemberClaim,
  markVerificationEmailDelivered,
} from './_member.mjs';
import { assertJsonRequestFromThisSite } from './_auth.mjs';
import { sendMemberVerificationEmail } from './_email.mjs';
import { applyRateLimit, assertHoneypotEmpty, getClientIp, logRequestAudit } from './_security.mjs';
import { assertSiteModuleEnabled } from './_site-modules.mjs';

// There is no on-screen link to point at. The verification link proves the
// caller owns the mailbox, so it only ever travels by email; a member whose
// email did not send can resend once delivery recovers, or ask support.
export function buildRegistrationMessage(delivery = {}) {
  if (delivery.delivered) {
    return 'Membership account created. Check your email to verify your account before signing in.';
  }
  return 'Membership account created, but we could not send your verification email. Contact support to finish activating your account.';
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertJsonRequestFromThisSite(event);
    const sql = getSqlClient();
    await assertSiteModuleEnabled(sql, 'membership');
    const body = parseBody(event);
    const normalizedUsername = String(body.username || '').trim().toLowerCase();
    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    await assertHoneypotEmpty(sql, event, body, {
      route: 'member-register',
      auditMetadata: { username: normalizedUsername, email: normalizedEmail },
    });
    // Signing up once used to exempt the caller from this limit for as long as
    // the session cookie lasted, which is the opposite of what it is for.
    await applyRateLimit(sql, event, {
      scope: 'member-register-ip',
      key: getClientIp(event),
      limit: 4,
      windowMs: 10 * 60_000,
      blockMs: 60 * 60_000,
      message: 'Too many registration attempts from this IP address.',
      auditMetadata: { username: normalizedUsername, email: normalizedEmail },
    });

    // Someone whose verification email never arrived is otherwise locked out
    // for good: their own pending account makes the username and email taken.
    const releasedStaleClaims = await releaseUnverifiedMemberClaim(sql, {
      username: body.username,
      email: body.email,
    });

    const registration = await registerMember(sql, body);
    const verification = await createMemberEmailVerificationRequest(sql, registration.member.id);
    const delivery = await sendMemberVerificationEmail({
      sql,
      toEmail: registration.member.email,
      username: registration.member.username,
      verificationToken: verification.token,
      expiresAt: verification.expiresAt,
    });
    await logRequestAudit(sql, event, {
      route: 'member-register',
      action: 'register',
      outcome: 'success',
      metadata: {
        memberId: registration.member.id,
        username: normalizedUsername,
        email: normalizedEmail,
        verificationDelivery: delivery.delivery || 'unknown',
        ...(releasedStaleClaims ? { releasedStaleClaims } : {}),
        // Why it did not send, for the delivery panel in admin reports. It
        // describes our own SendGrid configuration, so it stays out of the
        // response body below.
        ...(delivery.delivered ? {} : { verificationDeliveryError: delivery.reason || 'unknown' }),
      },
    });

    // Registration used to report success identically whether or not the
    // verification email sent. When delivery fails the member is told to check
    // an inbox nothing was sent to, and the account is pruned 24h later -- so
    // the signup and the evidence both disappear. Say what actually happened.
    await markVerificationEmailDelivered(sql, registration.member.id, delivery.delivered);

    return jsonResponse(201, {
      authenticated: false,
      member: registration.member,
      profile: registration.profile,
      message: buildRegistrationMessage(delivery),
      emailDelivered: Boolean(delivery.delivered),
      verification: {
        required: true,
        expiresAt: verification.expiresAt.toISOString(),
        delivery: delivery.delivery || 'unknown',
      },
      // Never the verification link or token, delivered or not. Anyone can POST
      // here with someone else's address; returning the link let them verify
      // it themselves and keep a working password on the victim's account.
    }, {
      'set-cookie': [...clearSessionCookie(AUTH_COOKIES.member), ...clearMemberTierCookie()],
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to register member' }, error.headers || {});
  }
}
