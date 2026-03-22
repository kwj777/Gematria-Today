import {
  AUTH_COOKIES,
  createSession,
  createSessionCookie,
  getSqlClient,
  jsonResponse,
  parseBody,
  registerMember,
} from './_member.mjs';
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

    await applyRateLimit(sql, event, {
      scope: 'member-register-ip',
      key: getClientIp(event),
      limit: 4,
      windowMs: 10 * 60_000,
      blockMs: 60 * 60_000,
      message: 'Too many registration attempts from this IP address.',
      auditMetadata: { username: normalizedUsername, email: normalizedEmail },
    });

    if (process.env.TURNSTILE_SECRET_KEY && !String(body.challengeToken || '').trim()) {
      return jsonResponse(400, { error: 'Missing anti-bot challenge token' });
    }

    const registration = await registerMember(sql, body);
    const { token, expiresAt } = await createSession(sql, registration.member.id);
    await logRequestAudit(sql, event, {
      route: 'member-register',
      action: 'register',
      outcome: 'success',
      metadata: { memberId: registration.member.id, username: normalizedUsername, email: normalizedEmail },
    });

    return jsonResponse(201, {
      authenticated: true,
      member: registration.member,
      profile: registration.profile,
    }, {
      'set-cookie': createSessionCookie(token, expiresAt, AUTH_COOKIES.member),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to register member' }, error.headers || {});
  }
}
