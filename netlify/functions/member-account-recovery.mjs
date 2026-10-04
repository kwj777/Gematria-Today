import {
  assertJsonRequestFromThisSite,
  AUTH_COOKIES,
  clearSessionCookie,
  consumeAccountRecoveryRequest,
  createAccountRecoveryRequest,
  createSession,
  createSessionCookie,
  ensureAccountRecoverySchema,
  getSqlClient,
  hashPassword,
  hashToken,
  jsonResponse,
  parseBody,
} from './_auth.mjs';
import { ensureAdminSchema, syncBootstrapAdminUser } from './_admin.mjs';
import { ensureMemberProfile, ensureMemberSchema, formatMemberUser } from './_member.mjs';
import { ensureOAuthSchema, revokeUnprovenOAuthIdentities } from './_oauth.mjs';
import { sendRecoveryEmail } from './_email.mjs';
import { applyRateLimit, assertHoneypotEmpty, getClientIp, logRequestAudit } from './_security.mjs';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeIdentifier(value) {
  return String(value || '').trim();
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertJsonRequestFromThisSite(event);
    const sql = getSqlClient();
    await ensureMemberSchema(sql);
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    await ensureAccountRecoverySchema(sql);
    const body = parseBody(event);
    const action = String(body.action || '').trim();
    const clientIp = getClientIp(event);

    await assertHoneypotEmpty(sql, event, body, {
      route: 'member-account-recovery',
      auditMetadata: { action },
    });

    await applyRateLimit(sql, event, {
      scope: 'member-recovery-ip',
      key: clientIp,
      limit: 10,
      windowMs: 15 * 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many member account recovery attempts from this IP address.',
      auditMetadata: { action },
    });

    if (action === 'forgot-userid' || action === 'forgot-both') {
      const email = normalizeEmail(body.email);
      if (!email) {
        return jsonResponse(400, { error: 'Email is required' });
      }

      await applyRateLimit(sql, event, {
        scope: 'member-recovery-email',
        key: email,
        limit: 5,
        windowMs: 60 * 60_000,
        blockMs: 60 * 60_000,
        message: 'Too many recovery requests for this email address.',
        auditMetadata: { action },
      });

      const rows = await sql`
        SELECT id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, role, COALESCE(is_admin, FALSE) AS is_admin, created_at, updated_at
        FROM users
        WHERE LOWER(email) = ${email}
          AND (role = 'member' OR role = 'admin' OR COALESCE(is_admin, FALSE) = TRUE)
        LIMIT 1
      `;

      let member = null;
      let accountRole = null;
      if (rows.length) {
        accountRole = rows[0].role === 'member' ? 'member' : 'admin';
        member = formatMemberUser(rows[0]);
        // The page promises forgot-both in one email, and the reset email
        // already names the username, so it is the only one sent. Two used to
        // go out, and the first -- the username reminder -- looked complete.
        const recovery = await createAccountRecoveryRequest(sql, {
          userId: member.id,
          role: accountRole,
          recoveryType: action === 'forgot-both' ? 'forgot-password' : 'forgot-userid',
          lookupKey: email,
        });
        await sendRecoveryEmail({
          sql,
          toEmail: member.email,
          username: member.username,
          recoveryCode: recovery.token,
          expiresAt: recovery.expiresAt,
          role: accountRole,
          recoveryType: action,
        });
      }

      await logRequestAudit(sql, event, {
        route: 'member-account-recovery',
        action,
        outcome: rows.length ? 'match' : 'no_match',
        metadata: { email },
      });

      return jsonResponse(200, {
        ok: true,
        message: 'If an account matches that email, recovery details have been sent by email.',
      });
    }

    if (action === 'forgot-password') {
      const identifier = normalizeIdentifier(body.identifier || body.email);
      if (!identifier) {
        return jsonResponse(400, { error: 'Username or email is required' });
      }

      await applyRateLimit(sql, event, {
        scope: 'member-recovery-identifier',
        key: identifier.toLowerCase(),
        limit: 5,
        windowMs: 60 * 60_000,
        blockMs: 60 * 60_000,
        message: 'Too many password reset requests for this account.',
        auditMetadata: { action },
      });

      const email = normalizeEmail(identifier);
      const rows = await sql`
        SELECT id, username, email, role, COALESCE(is_admin, FALSE) AS is_admin
        FROM users
        WHERE (role = 'member' OR role = 'admin' OR COALESCE(is_admin, FALSE) = TRUE)
          AND (username = ${identifier} OR LOWER(email) = ${email})
        LIMIT 1
      `;

      let recovery = null;
      if (rows.length) {
        const accountRole = rows[0].role === 'member' ? 'member' : 'admin';
        recovery = await createAccountRecoveryRequest(sql, {
          userId: rows[0].id,
          role: accountRole,
          recoveryType: 'forgot-password',
          lookupKey: identifier,
        });
        await sendRecoveryEmail({
          sql,
          toEmail: rows[0].email || email || null,
          username: rows[0].username,
          recoveryCode: recovery.token,
          expiresAt: recovery.expiresAt,
          role: accountRole,
          recoveryType: 'forgot-password',
        });
      }

      await logRequestAudit(sql, event, {
        route: 'member-account-recovery',
        action,
        outcome: rows.length ? 'match' : 'no_match',
        metadata: { identifier: identifier.toLowerCase() },
      });

      return jsonResponse(200, {
        ok: true,
        message: 'If that account exists, a one-time password reset code has been sent by email.',
      }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
    }

    if (action === 'reset-password') {
      // Codes are lowercase hex, but a phone keyboard or a reader copying one
      // by hand can send it in capitals, which hashed to a different value and
      // was refused as invalid until the per-email limit locked them out.
      const recoveryCode = String(body.recoveryCode || '').trim().toLowerCase();
      const newPassword = String(body.newPassword || '');
      if (!recoveryCode || !newPassword) {
        return jsonResponse(400, { error: 'Recovery code and new password are required' });
      }
      if (newPassword.length < 8) {
        return jsonResponse(400, { error: 'New password must be at least 8 characters long' });
      }

      await applyRateLimit(sql, event, {
        scope: 'member-recovery-reset-token',
        key: hashToken(recoveryCode),
        limit: 5,
        windowMs: 15 * 60_000,
        blockMs: 60 * 60_000,
        message: 'Too many attempts for this recovery code.',
        auditMetadata: { action },
      });

      const recovery = await consumeAccountRecoveryRequest(sql, {
        role: 'member',
        recoveryType: 'forgot-password',
        token: recoveryCode,
      }) || await consumeAccountRecoveryRequest(sql, {
        role: 'admin',
        recoveryType: 'forgot-password',
        token: recoveryCode,
      });

      if (!recovery) {
        return jsonResponse(400, { error: 'Recovery code is invalid or expired' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
      }

      const passwordHash = await hashPassword(newPassword);
      if (recovery.role === 'admin') {
        const rows = await sql`
          UPDATE users
          SET password_hash = ${passwordHash}, updated_at = NOW()
          WHERE id = ${recovery.user_id}
            AND (role = 'admin' OR COALESCE(is_admin, FALSE) = TRUE)
          RETURNING id, username, role
        `;

        if (!rows.length) {
          return jsonResponse(404, { error: 'Admin account not found' });
        }

        const user = rows[0];
        // A reset is how you take an account back. Leaving the old sessions
        // alive left whoever you were locking out still signed in. Revoke
        // before minting the new session, or we sign the owner straight out.
        await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;
        const { token, expiresAt } = await createSession(sql, user.id);
        await logRequestAudit(sql, event, {
          route: 'member-account-recovery',
          action,
          outcome: 'success_admin',
          metadata: { userId: user.id },
        });

        return jsonResponse(200, {
          ok: true,
          authenticated: true,
          user: { id: user.id, username: user.username, role: user.role },
          message: 'Password reset complete. You are now signed in.',
          route: 'admin',
        }, {
          'set-cookie': createSessionCookie(token, expiresAt, AUTH_COOKIES.admin),
        });
      }

      const accountRows = await sql`
        SELECT status, email_verified
        FROM users
        WHERE id = ${recovery.user_id} AND role = 'member'
        LIMIT 1
      `;

      if (!accountRows.length) {
        return jsonResponse(404, { error: 'Member account not found' });
      }

      // Login refuses suspended and deleted accounts, so a reset code must not
      // become the way around that.
      const accountStatus = accountRows[0].status;
      if (accountStatus !== 'active' && accountStatus !== 'pending') {
        return jsonResponse(403, { error: `This membership account is ${accountStatus}` }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
      }

      // Account pre-hijacking, the mirror of the case _oauth.mjs guards. A
      // provider account claiming an address it never verified can create a
      // pending member here with its identity attached. Activating that row
      // below would arm the identity against the owner who just proved the
      // address, so retire whatever was linked before the proof arrived.
      if (accountStatus === 'pending' && !accountRows[0].email_verified) {
        await ensureOAuthSchema(sql);
        await sql`DELETE FROM member_oauth_identities WHERE user_id = ${recovery.user_id}`;
      } else {
        // Already active is not proof the identities are the owner's: the
        // verification link activates a pending row with whatever provider
        // identity created it still attached. A reset is how the owner takes
        // the account back, so keep only identities whose provider vouches for
        // this same address, or the reset revokes every session and leaves the
        // intruder a provider sign-in straight back in.
        await revokeUnprovenOAuthIdentities(sql, recovery.user_id);
      }

      // The code was emailed to this address and typed back, which proves the
      // member controls it just as the verification link does. Leaving the row
      // pending signed the member in to an account the unverified-signup
      // cleanup still treated as abandoned, and deleted with everything they
      // had paid for and posted.
      const rows = await sql`
        UPDATE users
        SET password_hash = ${passwordHash},
            email_verified = TRUE,
            status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
            updated_at = NOW()
        WHERE id = ${recovery.user_id}
          AND role = 'member'
          AND status IN ('active', 'pending')
        RETURNING id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, created_at, updated_at
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'Member account not found' });
      }

      const member = formatMemberUser(rows[0]);
      const profile = await ensureMemberProfile(sql, member.id, {});
      await sql`DELETE FROM sessions WHERE user_id = ${member.id}`;
      const { token, expiresAt } = await createSession(sql, member.id);

      await logRequestAudit(sql, event, {
        route: 'member-account-recovery',
        action,
        outcome: 'success',
        metadata: { memberId: member.id },
      });

      return jsonResponse(200, {
        ok: true,
        authenticated: true,
        member,
        profile,
        message: 'Password reset complete. You are now signed in.',
      }, {
        'set-cookie': createSessionCookie(token, expiresAt, AUTH_COOKIES.member),
      });
    }

    return jsonResponse(400, { error: 'Unsupported recovery action' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Member recovery failed' }, error.headers || {});
  }
}
