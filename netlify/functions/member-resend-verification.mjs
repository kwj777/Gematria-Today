import {
  AUTH_COOKIES,
  clearSessionCookie,
  createMemberEmailVerificationRequest,
  deleteExpiredUnverifiedMemberByIdentifier,
  ensureMemberSchema,
  getSqlClient,
  jsonResponse,
  normalizeEmail,
  parseBody,
} from './_member.mjs';
import { sendMemberVerificationEmail } from './_email.mjs';
import { applyRateLimit, assertHoneypotEmpty, getClientIp, logRequestAudit } from './_security.mjs';

const GENERIC_RESPONSE_MESSAGE = 'If a pending account matches that identifier, a fresh verification link has been sent by email.';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    await ensureMemberSchema(sql);
    const body = parseBody(event);
    const rawIdentifier = String(body.identifier || body.email || body.username || '').trim();
    if (!rawIdentifier) {
      return jsonResponse(400, { error: 'Username or email is required' });
    }

    const clientIp = getClientIp(event);
    const normalizedIdentifier = rawIdentifier.toLowerCase();
    await assertHoneypotEmpty(sql, event, body, {
      route: 'member-resend-verification',
      auditMetadata: { identifier: normalizedIdentifier },
    });

    await applyRateLimit(sql, event, {
      scope: 'member-resend-verification-ip',
      key: clientIp,
      limit: 6,
      windowMs: 15 * 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many verification resend attempts from this IP address.',
      auditMetadata: { identifier: normalizedIdentifier },
    });

    await applyRateLimit(sql, event, {
      scope: 'member-resend-verification-identifier',
      key: normalizedIdentifier,
      limit: 3,
      windowMs: 60 * 60_000,
      blockMs: 60 * 60_000,
      message: 'Too many verification resend requests for this account.',
    });

    await deleteExpiredUnverifiedMemberByIdentifier(sql, rawIdentifier);

    const normalizedEmail = normalizeEmail(rawIdentifier);
    const rows = await sql`
      SELECT id, username, email, status, email_verified, created_at
      FROM users
      WHERE role = 'member'
        AND (username = ${rawIdentifier} OR LOWER(email) = ${normalizedEmail})
      LIMIT 1
    `;

    let outcome = 'no_match';
    let delivery = null;
    if (rows.length) {
      const candidate = rows[0];
      if (candidate.status === 'pending' && !candidate.email_verified) {
        const verification = await createMemberEmailVerificationRequest(sql, candidate.id);
        const result = await sendMemberVerificationEmail({
          sql,
          toEmail: candidate.email,
          username: candidate.username,
          verificationToken: verification.token,
          expiresAt: verification.expiresAt,
        });
        delivery = result.delivery || 'unknown';
        outcome = 'resent';
      } else if (candidate.email_verified) {
        outcome = 'already_verified';
      } else {
        outcome = 'ineligible_status';
      }
    }

    await logRequestAudit(sql, event, {
      route: 'member-resend-verification',
      action: 'resend',
      outcome,
      metadata: { identifier: normalizedIdentifier, delivery: delivery || 'none' },
    });

    return jsonResponse(200, {
      ok: true,
      message: GENERIC_RESPONSE_MESSAGE,
    }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to resend verification email' }, error.headers || {});
  }
}
