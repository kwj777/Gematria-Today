/**
 * hub-login.mjs — Spoke-side hub login endpoint
 *
 * Each site that participates as a "spoke" in the multi-site admin hub exposes
 * this endpoint.  The hub generates a short-lived HMAC-signed token and redirects
 * the super admin here.  This function validates the token, prevents replay, and
 * issues a full admin session cookie before sending the user to /admin.html.
 *
 * Required environment variable on the spoke site:
 *   HUB_SHARED_SECRET — a secret string known only to this site and the hub.
 *                        Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import crypto from 'node:crypto';
import { AUTH_COOKIES, createSession, createSessionCookie, getSqlClient } from './_auth.mjs';
import { ensureAdminSchema, requireHttpMethod, syncBootstrapAdminUser } from './_admin.mjs';

const HUB_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getHubSecret() {
  const secret = String(process.env.HUB_SHARED_SECRET || '').trim();
  if (!secret) {
    throw Object.assign(new Error('HUB_SHARED_SECRET is not configured on this site'), { statusCode: 503 });
  }
  return secret;
}

/**
 * Verify and decode a hub token.
 * Token format: <base64url(JSON payload)>.<hex HMAC-SHA256 signature>
 * Payload shape: { userId: string, ts: number (unix ms), nonce: string }
 */
function verifyHubToken(rawToken) {
  const dotIndex = rawToken.lastIndexOf('.');
  if (dotIndex === -1) {
    throw Object.assign(new Error('Malformed hub token'), { statusCode: 400 });
  }

  const payloadB64 = rawToken.slice(0, dotIndex);
  const providedSig = rawToken.slice(dotIndex + 1);

  const secret = getHubSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  // Constant-time comparison — both must be valid hex strings of the same length
  let sigValid = false;
  try {
    const pBuf = Buffer.from(providedSig, 'hex');
    const eBuf = Buffer.from(expectedSig, 'hex');
    sigValid = pBuf.length === eBuf.length && crypto.timingSafeEqual(pBuf, eBuf);
  } catch {
    sigValid = false;
  }

  if (!sigValid) {
    throw Object.assign(new Error('Invalid hub token signature'), { statusCode: 403 });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('Malformed hub token payload'), { statusCode: 400 });
  }

  const age = Date.now() - Number(payload.ts || 0);
  if (age > HUB_TOKEN_TTL_MS || age < 0) {
    throw Object.assign(new Error('Hub token has expired'), { statusCode: 403 });
  }

  if (!payload.nonce || !payload.userId) {
    throw Object.assign(new Error('Malformed hub token payload'), { statusCode: 400 });
  }

  return payload;
}

async function ensureNonceTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS hub_login_nonces (
      nonce      TEXT        PRIMARY KEY,
      used_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
}

/**
 * Insert the nonce into the DB.  The PRIMARY KEY constraint makes this
 * idempotent-proof: a duplicate nonce simply won't be inserted, and we detect
 * it via the RETURNING clause — giving us reliable one-time-use enforcement.
 */
async function consumeNonce(sql, nonce, expiresAt) {
  await ensureNonceTable(sql);

  // Purge expired nonces to keep the table tidy
  await sql`DELETE FROM hub_login_nonces WHERE expires_at < NOW()`;

  const inserted = await sql`
    INSERT INTO hub_login_nonces (nonce, expires_at)
    VALUES (${nonce}, ${expiresAt.toISOString()})
    ON CONFLICT (nonce) DO NOTHING
    RETURNING nonce
  `;

  if (!inserted.length) {
    throw Object.assign(new Error('Hub token has already been used'), { statusCode: 403 });
  }
}

function errorPage(message) {
  return {
    statusCode: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Hub Login Failed</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;text-align:center}
h1{color:#c0392b}a{color:#2980b9}</style></head>
<body>
<h1>Hub Login Failed</h1>
<p>${String(message).replace(/</g, '&lt;')}</p>
<p><a href="/admin.html">Go to admin login</a></p>
</body></html>`,
  };
}

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'GET');
  if (methodError) return methodError;

  try {
    const rawUrl = event.rawUrl || event.url || '';
    let token = '';
    try {
      const url = new URL(rawUrl, 'http://localhost');
      token = String(url.searchParams.get('token') || '').trim();
    } catch {
      token = '';
    }

    if (!token) {
      return errorPage('Missing token parameter.');
    }

    const payload = verifyHubToken(token);

    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);

    const nonceExpiresAt = new Date(Number(payload.ts) + HUB_TOKEN_TTL_MS);
    await consumeNonce(sql, String(payload.nonce), nonceExpiresAt);

    // Resolve the super admin user from the local database
    const rows = await sql`
      SELECT id, username, role
      FROM users
      WHERE id = ${String(payload.userId)}
        AND (role = 'super_admin' OR (role = 'admin' AND is_admin = TRUE))
      LIMIT 1
    `;

    if (!rows.length) {
      throw Object.assign(new Error('Admin user not found on this site'), { statusCode: 403 });
    }

    const { token: sessionToken, expiresAt } = await createSession(sql, rows[0].id);

    return {
      statusCode: 302,
      headers: {
        Location: '/admin.html',
        'Set-Cookie': createSessionCookie(sessionToken, expiresAt, AUTH_COOKIES.admin),
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  } catch (error) {
    return errorPage(error.message || 'Unexpected error during hub login.');
  }
}
