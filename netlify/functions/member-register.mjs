import {
  AUTH_COOKIES,
  clearMemberTierCookie,
  clearSessionCookie,
  createMemberEmailVerificationRequest,
  getOptionalAuthenticatedSession,
  getSqlClient,
  jsonResponse,
  parseBody,
  registerMember,
  verifyTurnstileToken,
} from './_member.mjs';
import { sendMemberVerificationEmail } from './_email.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    const body = parseBody(event);
    const normalizedUsername = String(body.username || '').trim().toLowerCase();
    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    const { user } = await getOptionalAuthenticatedSession(event, { sql });

    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'member-register-ip',
        key: getClientIp(event),
        limit: 4,
        windowMs: 10 * 60_000,
        blockMs: 60 * 60_000,
        message: 'Too many registration attempts from this IP address.',
        auditMetadata: { username: normalizedUsername, email: normalizedEmail },
      });
    }

    await verifyTurnstileToken(event, body.challengeToken);

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
      },
    });

    return jsonResponse(201, {
      authenticated: false,
      member: registration.member,
      profile: registration.profile,
      message: 'Membership account created. Check your email to verify your account before signing in.',
      verification: {
        required: true,
        expiresAt: verification.expiresAt.toISOString(),
        delivery: delivery.delivery || 'unknown',
      },
      ...(delivery.verificationUrl ? { verificationUrl: delivery.verificationUrl } : {}),
    }, {
      'set-cookie': [...clearSessionCookie(AUTH_COOKIES.member), ...clearMemberTierCookie()],
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to register member' }, error.headers || {});
  }
}
