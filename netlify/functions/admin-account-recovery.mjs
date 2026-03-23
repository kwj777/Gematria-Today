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
import { ensureAdminSchema, syncBootstrapAdminUser } from './_admin.mjs';
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
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    await ensureAccountRecoverySchema(sql);
    const body = parseBody(event);
    const action = String(body.action || '').trim();

    await applyRateLimit(sql, event, {
      scope: 'admin-recovery-ip',
      key: getClientIp(event),
      limit: 6,
      windowMs: 15 * 60_000,
      blockMs: 60 * 60_000,
      message: 'Too many admin recovery attempts from this IP address.',
      auditMetadata: { action },
    });

    await verifyTurnstileToken(event, body.challengeToken);

    if (action === 'forgot-userid') {
      const email = normalizeEmail(body.email);
      if (!email) {
        return jsonResponse(400, { error: 'Email is required' });
      }

      const rows = await sql`SELECT id, username, email FROM users WHERE role = 'admin' AND LOWER(email) = ${email} LIMIT 1`;
      const recovery = rows.length ? await createAccountRecoveryRequest(sql, {
        userId: rows[0].id,
        role: 'admin',
        recoveryType: 'forgot-userid',
        lookupKey: email,
      }) : null;
      if (recovery) {
        await sendRecoveryEmail({
          toEmail: rows[0].email,
          username: rows[0].username,
          recoveryCode: recovery.token,
          expiresAt: recovery.expiresAt,
          role: 'admin',
          recoveryType: 'forgot-userid',
        });
      }

      await logRequestAudit(sql, event, {
        route: 'admin-account-recovery',
        action,
        outcome: rows.length ? 'match' : 'no_match',
        metadata: { email },
      });

      return jsonResponse(200, {
        ok: true,
        message: 'If that admin email is configured, recovery details have been sent by email.',
      });
    }

    if (action === 'forgot-password') {
      const identifier = normalizeIdentifier(body.identifier);
      if (!identifier) {
        return jsonResponse(400, { error: 'Username or email is required' });
      }

      const email = normalizeEmail(identifier);
      const rows = await sql`SELECT id, username, email FROM users WHERE role = 'admin' AND (username = ${identifier} OR LOWER(email) = ${email}) LIMIT 1`;
      const recovery = rows.length ? await createAccountRecoveryRequest(sql, {
        userId: rows[0].id,
        role: 'admin',
        recoveryType: 'forgot-password',
        lookupKey: identifier,
      }) : null;
      if (recovery) {
        await sendRecoveryEmail({
          toEmail: rows[0].email || email,
          username: rows[0].username,
          recoveryCode: recovery.token,
          expiresAt: recovery.expiresAt,
          role: 'admin',
          recoveryType: 'forgot-password',
        });
      }

      await logRequestAudit(sql, event, {
        route: 'admin-account-recovery',
        action,
        outcome: rows.length ? 'match' : 'no_match',
        metadata: { identifier: identifier.toLowerCase() },
      });

      return jsonResponse(200, {
        ok: true,
        message: 'If that admin account exists, a one-time password reset code has been sent by email.',
      }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.admin) });
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
        role: 'admin',
        recoveryType: 'forgot-password',
        token: recoveryCode,
      });
      if (!recovery) {
        return jsonResponse(400, { error: 'Recovery code is invalid or expired' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.admin) });
      }

      const passwordHash = await hashPassword(newPassword);
      const rows = await sql`
        UPDATE users
        SET password_hash = ${passwordHash}, updated_at = NOW()
        WHERE id = ${recovery.user_id} AND role = 'admin'
        RETURNING id, username, role
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'Admin account not found' });
      }

      const user = rows[0];
      const { token, expiresAt } = await createSession(sql, user.id);
      await logRequestAudit(sql, event, {
        route: 'admin-account-recovery',
        action,
        outcome: 'success',
        metadata: { userId: user.id },
      });

      return jsonResponse(200, {
        ok: true,
        authenticated: true,
        user: { id: user.id, username: user.username, role: user.role },
        message: 'Admin password reset complete. You are now signed in.',
      }, {
        'set-cookie': createSessionCookie(token, expiresAt, AUTH_COOKIES.admin),
      });
    }

    return jsonResponse(400, { error: 'Unsupported recovery action' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Admin recovery failed' }, error.headers || {});
  }
}
