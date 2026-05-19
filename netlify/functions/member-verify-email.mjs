import {
  clearSessionCookie,
  finalizeMemberEmailVerification,
  getSqlClient,
  jsonResponse,
  parseBody,
} from './_member.mjs';
import { AUTH_COOKIES, hashToken } from './_auth.mjs';
import { applyRateLimit, getClientIp } from './_security.mjs';

function readToken(event) {
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    return String(params.token || '').trim();
  }

  const body = parseBody(event);
  return String(body.token || '').trim();
}

export async function handler(event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    const token = readToken(event);
    if (!token) {
      return jsonResponse(400, { error: 'Verification token is required' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
    }

    await applyRateLimit(sql, event, {
      scope: 'member-verify-email-ip',
      key: getClientIp(event),
      limit: 20,
      windowMs: 15 * 60_000,
      blockMs: 30 * 60_000,
      message: 'Too many email verification attempts from this IP address.',
    });

    await applyRateLimit(sql, event, {
      scope: 'member-verify-email-token',
      key: hashToken(token),
      limit: 5,
      windowMs: 15 * 60_000,
      blockMs: 60 * 60_000,
      message: 'Too many attempts for this verification token.',
    });

    const member = await finalizeMemberEmailVerification(sql, token);
    if (!member) {
      return jsonResponse(400, { error: 'Verification token is invalid or expired' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
    }

    return jsonResponse(200, {
      ok: true,
      member,
      message: 'Email verified. Your account is now active and you can sign in.',
    }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to verify email' }, error.headers || {});
  }
}
