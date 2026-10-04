import {
  AUTH_COOKIES,
  authenticateMemberCredentials,
  clearMemberTierCookie,
  clearSessionCookie,
  createMemberTierCookie,
  createSession,
  createSessionCookie,
  ensureMemberProfile,
  formatMemberUser,
  getSqlClient,
  jsonResponse,
  parseBody,
} from './_member.mjs';
import { assertJsonRequestFromThisSite, createAdminSessionCookies, generateCsrfToken } from './_auth.mjs';
import { authenticateCredentials, syncBootstrapAdminUser } from './_admin.mjs';
import {
  applyRateLimit,
  assertHoneypotEmpty,
  claimLoginAttempt,
  getClientRateLimitKey,
  logRequestAudit,
  releaseLoginAttempt,
  rememberLoginSource,
} from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertJsonRequestFromThisSite(event);
    const sql = getSqlClient();
    await syncBootstrapAdminUser(sql);
    const body = parseBody(event);
    const { identifier = '', password = '' } = body;
    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    await assertHoneypotEmpty(sql, event, body, {
      route: 'member-login',
      auditMetadata: { identifier: normalizedIdentifier },
    });
    // An IPv6 caller is keyed by its /64, which is what one subscriber gets.
    const clientIp = getClientRateLimitKey(event);

    // Holding any session used to skip these limits, and a session is one free
    // signup away, so password guessing against member accounts was unthrottled
    // for anyone who bothered to register first. Always rate limit.
    await applyRateLimit(sql, event, {
      scope: 'member-login-ip',
      key: clientIp,
      limit: 8,
      windowMs: 60_000,
      blockMs: 15 * 60_000,
      message: 'Too many member login attempts from this IP address.',
      auditMetadata: { identifier: normalizedIdentifier },
    });

    // Counted before the password is checked, so keyed by account and caller
    // address: keyed by the identifier alone, six bad guesses from anywhere
    // locked the real member (or, through the admin fallback below, the super
    // admin) out from every address for half an hour.
    let accountClaim = null;
    if (normalizedIdentifier) {
      await applyRateLimit(sql, event, {
        scope: 'member-login-identifier',
        key: `${normalizedIdentifier}|${clientIp}`,
        limit: 5,
        windowMs: 10 * 60_000,
        blockMs: 30 * 60_000,
        message: 'Too many login attempts for this account identifier.',
      });
      // The cap on the account itself, across every address, shared with
      // admin-login and claimed before the password is checked. It only counts
      // and refuses addresses that never signed in to it.
      accountClaim = await claimLoginAttempt(sql, event, { account: normalizedIdentifier });
    }

    const member = await authenticateMemberCredentials(sql, identifier, password);
    const admin = member ? null : await authenticateCredentials(sql, identifier, password);

    if (!member && !admin) {
      await logRequestAudit(sql, event, {
        route: 'member-login',
        action: 'authenticate',
        outcome: 'invalid_credentials',
        metadata: { identifier: normalizedIdentifier },
      });

      return jsonResponse(401, { error: 'Invalid username/email or password' }, {
        'set-cookie': [...clearSessionCookie(AUTH_COOKIES.member), ...clearMemberTierCookie()],
      });
    }

    await releaseLoginAttempt(sql, accountClaim);
    await rememberLoginSource(sql, event, member
      ? [normalizedIdentifier, member.username, member.email]
      : [normalizedIdentifier, admin.username, admin.email]);

    if (admin) {
      const { token, expiresAt } = await createSession(sql, admin.id);
      await logRequestAudit(sql, event, {
        route: 'member-login',
        action: 'authenticate',
        outcome: 'success_admin',
        metadata: { userId: admin.id },
      });

      const adminMemberRows = await sql`
        SELECT id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, stripe_subscription_id, stripe_subscription_status, stripe_subscription_current_period_end, status, email_verified, created_at, updated_at
        FROM users
        WHERE id = ${admin.id}
        LIMIT 1
      `;
      const adminMember = adminMemberRows.length ? formatMemberUser(adminMemberRows[0]) : null;
      if (adminMember) {
        adminMember.membershipLevel = 'lifetime';
      }
      const adminProfile = adminMember ? await ensureMemberProfile(sql, admin.id, {}) : null;

      return jsonResponse(200, {
        authenticated: true,
        user: {
          id: admin.id,
          username: admin.username,
          role: admin.role,
          isAdmin: admin.role === 'admin' || admin.role === 'super_admin' || Boolean(admin.isAdmin),
        },
        member: adminMember,
        profile: adminProfile,
        route: 'admin',
        csrfToken: generateCsrfToken(token),
      }, {
        'set-cookie': [
          ...createAdminSessionCookies(token, expiresAt),
          createMemberTierCookie('lifetime', expiresAt),
        ],
      });
    }

    const profile = await ensureMemberProfile(sql, member.id, {});
    const { token, expiresAt } = await createSession(sql, member.id);
    const userRows = await sql`
      SELECT id, username, role, COALESCE(is_admin, FALSE) AS is_admin
      FROM users
      WHERE id = ${member.id}
      LIMIT 1
    `;
    const authenticatedUser = userRows.length ? {
      id: userRows[0].id,
      username: userRows[0].username,
      role: userRows[0].role,
      isAdmin: Boolean(userRows[0].is_admin),
    } : {
      id: member.id,
      username: member.username,
      role: 'member',
      isAdmin: false,
    };

    await logRequestAudit(sql, event, {
      route: 'member-login',
      action: 'authenticate',
      outcome: 'success',
      metadata: { memberId: member.id },
    });

    return jsonResponse(200, {
      authenticated: true,
      user: authenticatedUser,
      member,
      profile,
      csrfToken: generateCsrfToken(token),
    }, {
      'set-cookie': [
        createSessionCookie(token, expiresAt, AUTH_COOKIES.member),
        createMemberTierCookie(member.membershipLevel, expiresAt),
      ],
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const safeToExpose = error.expose === true || (error.statusCode && error.statusCode < 500);
    if (!safeToExpose) {
      console.error('[member-login] unhandled error:', error);
    }
    const clientMessage = safeToExpose && error.message ? error.message : 'Failed to sign in';
    return jsonResponse(statusCode, { error: clientMessage }, error.headers || {});
  }
}
