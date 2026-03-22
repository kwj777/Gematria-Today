import {
  AUTH_COOKIES,
  authenticateMemberCredentials,
  clearSessionCookie,
  createSession,
  createSessionCookie,
  ensureMemberProfile,
  getSqlClient,
  jsonResponse,
  parseBody,
} from './_member.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    const { identifier = '', password = '', challengeToken = '' } = parseBody(event);
    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const clientIp = getClientIp(event);

    await applyRateLimit(sql, event, {
      scope: 'member-login-ip',
      key: clientIp,
      limit: 8,
      windowMs: 60_000,
      blockMs: 15 * 60_000,
      message: 'Too many member login attempts from this IP address.',
      auditMetadata: { identifier: normalizedIdentifier },
    });

    if (normalizedIdentifier) {
      await applyRateLimit(sql, event, {
        scope: 'member-login-identifier',
        key: normalizedIdentifier,
        limit: 5,
        windowMs: 10 * 60_000,
        blockMs: 30 * 60_000,
        message: 'Too many login attempts for this account identifier.',
      });
    }

    if (process.env.TURNSTILE_SECRET_KEY && !String(challengeToken || '').trim()) {
      return jsonResponse(400, { error: 'Missing anti-bot challenge token' });
    }

    const member = await authenticateMemberCredentials(sql, identifier, password);

    if (!member) {
      await logRequestAudit(sql, event, {
        route: 'member-login',
        action: 'authenticate',
        outcome: 'invalid_credentials',
        metadata: { identifier: normalizedIdentifier },
      });

      return jsonResponse(401, { error: 'Invalid username/email or password' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
    }

    const profile = await ensureMemberProfile(sql, member.id, {});
    const { token, expiresAt } = await createSession(sql, member.id);
    await logRequestAudit(sql, event, {
      route: 'member-login',
      action: 'authenticate',
      outcome: 'success',
      metadata: { memberId: member.id },
    });

    return jsonResponse(200, {
      authenticated: true,
      member,
      profile,
    }, {
      'set-cookie': createSessionCookie(token, expiresAt, AUTH_COOKIES.member),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to sign in' }, error.headers || {});
  }
}
