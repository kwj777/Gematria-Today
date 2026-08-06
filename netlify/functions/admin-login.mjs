import {
  AUTH_COOKIES,
  clearSessionCookie,
  createMemberTierCookie,
  createSession,
  createSessionCookie,
  jsonResponse,
  parseBody,
} from './_auth.mjs';
import { authenticateCredentials, getSqlClient, requireHttpMethod } from './_admin.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'POST');
  if (methodError) return methodError;

  try {
    const sql = getSqlClient();
    const { username = '', password = '' } = parseBody(event);
    const normalizedUsername = String(username).trim().toLowerCase();

    // Throttling used to be skipped whenever the caller already held a session.
    // getOptionalAuthenticatedSession accepts the *member* cookie too, so a free
    // member account -- which anyone can create -- turned admin password guessing
    // into an unthrottled endpoint. Attempts are rate limited unconditionally.
    await applyRateLimit(sql, event, {
      scope: 'admin-login-ip',
      key: getClientIp(event),
      limit: 5,
      windowMs: 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many admin login attempts from this IP address.',
      auditMetadata: { username: normalizedUsername },
    });

    if (normalizedUsername) {
      await applyRateLimit(sql, event, {
        scope: 'admin-login-username',
        key: normalizedUsername,
        limit: 4,
        windowMs: 10 * 60_000,
        blockMs: 60 * 60_000,
        message: 'Too many admin login attempts for this account.',
      });
    }

    const user = await authenticateCredentials(sql, username.trim(), password);

    if (!user) {
      await logRequestAudit(sql, event, {
        route: 'admin-login',
        action: 'authenticate',
        outcome: 'invalid_credentials',
        metadata: { username: normalizedUsername },
      });
      return jsonResponse(401, { error: 'Invalid username or password' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.admin) });
    }

    const { token, expiresAt } = await createSession(sql, user.id);
    await logRequestAudit(sql, event, {
      route: 'admin-login',
      action: 'authenticate',
      outcome: 'success',
      metadata: { userId: user.id },
    });
    return jsonResponse(200, {
      authenticated: true,
      user: { id: user.id, username: user.username, role: user.role },
    }, {
      'set-cookie': [
        createSessionCookie(token, expiresAt, AUTH_COOKIES.admin),
        createMemberTierCookie('lifetime', expiresAt),
      ],
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to log in' }, error.headers || {});
  }
}
