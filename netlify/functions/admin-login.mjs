import {
  assertJsonRequestFromThisSite,
  AUTH_COOKIES,
  clearSessionCookie,
  createAdminSessionCookies,
  createMemberTierCookie,
  createSession,
  jsonResponse,
  parseBody,
} from './_auth.mjs';
import { authenticateCredentials, getSqlClient, requireHttpMethod } from './_admin.mjs';
import {
  applyRateLimit,
  claimLoginAttempt,
  getClientRateLimitKey,
  logRequestAudit,
  releaseLoginAttempt,
  rememberLoginSource,
} from './_security.mjs';

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'POST');
  if (methodError) return methodError;

  try {
    assertJsonRequestFromThisSite(event);
    const sql = getSqlClient();
    const { username = '', password = '' } = parseBody(event);
    const normalizedUsername = String(username).trim().toLowerCase();
    // An IPv6 caller is keyed by its /64, which is what one subscriber gets.
    const clientIp = getClientRateLimitKey(event);

    // Throttling used to be skipped whenever the caller already held a session.
    // getOptionalAuthenticatedSession accepts the *member* cookie too, so a free
    // member account -- which anyone can create -- turned admin password guessing
    // into an unthrottled endpoint. Attempts are rate limited unconditionally.
    await applyRateLimit(sql, event, {
      scope: 'admin-login-ip',
      key: clientIp,
      limit: 5,
      windowMs: 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many admin login attempts from this IP address.',
      auditMetadata: { username: normalizedUsername },
    });

    // This limit counts attempts before the password is checked, and it used to
    // be keyed by the username alone: four bad guesses from anywhere blocked
    // that account for an hour from every address, the real admin's included,
    // and repeating them hourly kept the only super admin out. Keyed by account
    // and caller address, guessing at an account only ever blocks the guesser.
    let accountClaim = null;
    if (normalizedUsername) {
      await applyRateLimit(sql, event, {
        scope: 'admin-login-username',
        key: `${normalizedUsername}|${clientIp}`,
        limit: 4,
        windowMs: 10 * 60_000,
        blockMs: 60 * 60_000,
        message: 'Too many admin login attempts for this account.',
      });
      // The cap on the account itself, across every address, claimed before
      // the password is checked. See claimLoginAttempt: it only counts and
      // refuses addresses that have never signed in to this account.
      accountClaim = await claimLoginAttempt(sql, event, { account: normalizedUsername });
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

    await releaseLoginAttempt(sql, accountClaim);
    await rememberLoginSource(sql, event, [normalizedUsername, user.username, user.email]);
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
        ...createAdminSessionCookies(token, expiresAt),
        createMemberTierCookie('lifetime', expiresAt),
      ],
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to log in' }, error.headers || {});
  }
}
