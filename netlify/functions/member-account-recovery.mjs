import {
  AUTH_COOKIES,
  clearSessionCookie,
  consumeAccountRecoveryRequest,
  createAccountRecoveryRequest,
  createSession,
  createSessionCookie,
  ensureAccountRecoverySchema,
  getSqlClient,
  hashPassword,
  jsonResponse,
  parseBody,
  verifyTurnstileToken,
} from './_auth.mjs';
import { ensureMemberProfile, ensureMemberSchema, formatMemberUser } from './_member.mjs';
import { sendRecoveryEmail } from './_email.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';

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
    const sql = getSqlClient();
    await ensureMemberSchema(sql);
    await ensureAccountRecoverySchema(sql);
    const body = parseBody(event);
    const action = String(body.action || '').trim();
    const clientIp = getClientIp(event);

    await applyRateLimit(sql, event, {
      scope: 'member-recovery-ip',
      key: clientIp,
      limit: 10,
      windowMs: 15 * 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many member account recovery attempts from this IP address.',
      auditMetadata: { action },
    });

    await verifyTurnstileToken(event, body.challengeToken);

    if (action === 'forgot-userid' || action === 'forgot-both') {
      const email = normalizeEmail(body.email);
      if (!email) {
        return jsonResponse(400, { error: 'Email is required' });
      }

      const rows = await sql`
        SELECT id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, created_at, updated_at
        FROM users
        WHERE role = 'member' AND LOWER(email) = ${email}
        LIMIT 1
      `;

      let member = null;
      if (rows.length) {
        member = formatMemberUser(rows[0]);
        const usernameRecovery = await createAccountRecoveryRequest(sql, {
          userId: member.id,
          role: 'member',
          recoveryType: 'forgot-userid',
          lookupKey: email,
        });
        await sendRecoveryEmail({
          sql,
          toEmail: member.email,
          username: member.username,
          recoveryCode: usernameRecovery.token,
          expiresAt: usernameRecovery.expiresAt,
          role: 'member',
          recoveryType: 'forgot-userid',
        });

        if (action === 'forgot-both') {
          const passwordRecovery = await createAccountRecoveryRequest(sql, {
            userId: member.id,
            role: 'member',
            recoveryType: 'forgot-password',
            lookupKey: email,
          });
          await sendRecoveryEmail({
            sql,
            toEmail: member.email,
            username: member.username,
            recoveryCode: passwordRecovery.token,
            expiresAt: passwordRecovery.expiresAt,
            role: 'member',
            recoveryType: 'forgot-password',
          });
        }
      }

      await logRequestAudit(sql, event, {
        route: 'member-account-recovery',
        action,
        outcome: rows.length ? 'match' : 'no_match',
        metadata: { email },
      });

      return jsonResponse(200, {
        ok: true,
        message: 'If a membership account matches that email, recovery details have been sent by email.',
      });
    }

    if (action === 'forgot-password') {
      const identifier = normalizeIdentifier(body.identifier || body.email);
      if (!identifier) {
        return jsonResponse(400, { error: 'Username or email is required' });
      }

      const email = normalizeEmail(identifier);
      const rows = await sql`
        SELECT id, username, email
        FROM users
        WHERE role = 'member'
          AND (username = ${identifier} OR LOWER(email) = ${email})
        LIMIT 1
      `;

      let recovery = null;
      if (rows.length) {
        recovery = await createAccountRecoveryRequest(sql, {
          userId: rows[0].id,
          role: 'member',
          recoveryType: 'forgot-password',
          lookupKey: identifier,
        });
        await sendRecoveryEmail({
          sql,
          toEmail: rows[0].email || email || null,
          username: rows[0].username,
          recoveryCode: recovery.token,
          expiresAt: recovery.expiresAt,
          role: 'member',
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
        message: 'If that membership account exists, a one-time password reset code has been sent by email.',
      }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
    }

    if (action === 'reset-password') {
      const recoveryCode = String(body.recoveryCode || '').trim();
      const newPassword = String(body.newPassword || '');
      if (!recoveryCode || !newPassword) {
        return jsonResponse(400, { error: 'Recovery code and new password are required' });
      }
      if (newPassword.length < 8) {
        return jsonResponse(400, { error: 'New password must be at least 8 characters long' });
      }

      const recovery = await consumeAccountRecoveryRequest(sql, {
        role: 'member',
        recoveryType: 'forgot-password',
        token: recoveryCode,
      });

      if (!recovery) {
        return jsonResponse(400, { error: 'Recovery code is invalid or expired' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
      }

      const passwordHash = await hashPassword(newPassword);
      const rows = await sql`
        UPDATE users
        SET password_hash = ${passwordHash}, updated_at = NOW()
        WHERE id = ${recovery.user_id} AND role = 'member'
        RETURNING id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, created_at, updated_at
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'Member account not found' });
      }

      const member = formatMemberUser(rows[0]);
      const profile = await ensureMemberProfile(sql, member.id, {});
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
