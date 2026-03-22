import {
  AUTH_COOKIES,
  clearSessionCookie,
  createSession,
  createSessionCookie,
  getOptionalAuthenticatedSession,
  jsonResponse,
  parseBody,
  verifyTurnstileToken,
} from './_auth.mjs';
import { authenticateCredentials, getSqlClient } from './_admin.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    const { username = '', password = '', challengeToken = '' } = parseBody(event);
    const normalizedUsername = String(username).trim().toLowerCase();
    const { user: authenticatedUser } = await getOptionalAuthenticatedSession(event, { sql });

    if (!authenticatedUser) {
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
    }

    await verifyTurnstileToken(event, challengeToken);

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
      'set-cookie': createSessionCookie(token, expiresAt, AUTH_COOKIES.admin),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to log in' }, error.headers || {});
  }
}
