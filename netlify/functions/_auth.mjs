import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';
import {
  fetchWithTimeout,
  getClientIp,
  getRequestHeaders,
  jsonResponse as secureJsonResponse,
} from './_security.mjs';

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;


const ACCOUNT_RECOVERY_TTL_MS = 1000 * 60 * 30;

export async function ensureAccountRecoverySchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS account_recovery_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    recovery_type TEXT NOT NULL,
    lookup_key TEXT,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS account_recovery_requests_user_type_idx
    ON account_recovery_requests (user_id, recovery_type, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS account_recovery_requests_expires_idx
    ON account_recovery_requests (expires_at DESC)`;
}

export async function createAccountRecoveryRequest(sql, {
  userId,
  role,
  recoveryType,
  lookupKey = null,
  ttlMs = ACCOUNT_RECOVERY_TTL_MS,
} = {}) {
  if (!userId || !role || !recoveryType) {
    throw new Error('Missing recovery request details');
  }

  await ensureAccountRecoverySchema(sql);
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);

  await sql`DELETE FROM account_recovery_requests
    WHERE user_id = ${userId}
      AND role = ${role}
      AND recovery_type = ${recoveryType}
      AND consumed_at IS NULL`;

  await sql`INSERT INTO account_recovery_requests (
      id,
      user_id,
      role,
      recovery_type,
      lookup_key,
      token_hash,
      expires_at
    )
    VALUES (
      ${crypto.randomUUID()},
      ${userId},
      ${role},
      ${recoveryType},
      ${lookupKey},
      ${hashToken(token)},
      ${expiresAt.toISOString()}
    )`;

  return { token, expiresAt };
}

export async function consumeAccountRecoveryRequest(sql, {
  role,
  recoveryType,
  token,
} = {}) {
  await ensureAccountRecoverySchema(sql);
  const normalizedToken = String(token || '').trim();
  if (!role || !recoveryType || !normalizedToken) {
    return null;
  }

  const rows = await sql`
    UPDATE account_recovery_requests
    SET consumed_at = NOW()
    WHERE token_hash = ${hashToken(normalizedToken)}
      AND role = ${role}
      AND recovery_type = ${recoveryType}
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING *
  `;

  return rows[0] || null;
}

export const AUTH_COOKIES = {
  admin: 'endtimes_admin_session',
  member: 'endtimes_member_session',
};

export function getSqlClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL environment variable');
  }

  return neon(process.env.DATABASE_URL);
}

export function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return secureJsonResponse(statusCode, payload, extraHeaders);
}

export function parseBody(event) {
  if (!event.body) {
    return {};
  }

  return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
}

export function parseCookies(event) {
  const rawCookies = typeof event?.headers?.get === 'function'
    ? (event.headers.get('cookie') || '')
    : (event.headers?.cookie || event.headers?.Cookie || '');
  return rawCookies.split(';').reduce((cookies, chunk) => {
    const [key, ...rest] = chunk.trim().split('=');
    if (!key) {
      return cookies;
    }
    cookies[key] = decodeURIComponent(rest.join('='));
    return cookies;
  }, {});
}

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('scrypt$')) {
    return false;
  }

  const [, salt, key] = storedHash.split('$');
  const derivedKey = await scrypt(password, salt, 64);
  const candidate = Buffer.from(derivedKey).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(key, 'utf8'));
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function findAuthenticatedSession(event, sql, cookieName) {
  const cookies = parseCookies(event);
  const sessionToken = cookies[cookieName];

  if (!sessionToken) {
    return null;
  }

  const rows = await sql`
    SELECT users.id, users.username, users.role, sessions.expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${hashToken(sessionToken)}
      AND sessions.expires_at > NOW()
    LIMIT 1
  `;

  if (!rows.length) {
    await deleteSession(sql, sessionToken);
    return null;
  }

  return {
    sessionToken,
    user: {
      id: rows[0].id,
      username: rows[0].username,
      role: rows[0].role,
      expiresAt: rows[0].expires_at,
    },
  };
}

export function createSessionCookie(token, expiresAt, cookieName = AUTH_COOKIES.admin) {
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie(cookieName = AUTH_COOKIES.admin) {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export async function createSession(sql, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await sql`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (${crypto.randomUUID()}, ${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  return { token, expiresAt };
}

export async function getOptionalAuthenticatedSession(event, { sql } = {}) {
  const effectiveSql = sql || getSqlClient();
  const adminSession = await findAuthenticatedSession(event, effectiveSql, AUTH_COOKIES.admin);
  if (adminSession) {
    return { sql: effectiveSql, ...adminSession };
  }

  const memberSession = await findAuthenticatedSession(event, effectiveSql, AUTH_COOKIES.member);
  if (memberSession) {
    return { sql: effectiveSql, ...memberSession };
  }

  return { sql: effectiveSql, sessionToken: null, user: null };
}

export async function deleteSession(sql, token) {
  if (!token) {
    return;
  }

  await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
}

export async function authenticateCredentials(sql, identifier, password, { role = null } = {}) {
  const normalizedIdentifier = String(identifier ?? '').trim();
  const normalizedEmail = normalizedIdentifier.toLowerCase();

  if (!normalizedIdentifier || !password) {
    return null;
  }

  const rows = await sql`
    SELECT id, username, password_hash, role, COALESCE(is_admin, FALSE) AS is_admin
    FROM users
    WHERE username = ${normalizedIdentifier}
      OR LOWER(email) = ${normalizedEmail}
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  const user = rows[0];
  const matchesRole = role
    ? (role === 'admin' ? (user.role === 'admin' || user.is_admin) : user.role === role)
    : true;
  if (!matchesRole) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password_hash);
  return isValid ? user : null;
}

function getTurnstileExpectedHostname(event) {
  const configuredHostname = String(process.env.TURNSTILE_EXPECTED_HOSTNAME || '').trim().toLowerCase();
  if (configuredHostname) {
    return configuredHostname;
  }

  const headers = getRequestHeaders(event);
  return String(headers.host || headers['x-forwarded-host'] || '').trim().toLowerCase() || null;
}

export async function verifyTurnstileToken(event, challengeToken, { timeoutMs = 5000 } = {}) {
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return { enforced: false, success: true };
  }

  const normalizedToken = String(challengeToken || '').trim();
  if (!normalizedToken) {
    throw Object.assign(new Error('Missing anti-bot challenge token'), { statusCode: 400 });
  }

  const requestBody = new URLSearchParams({
    secret: secretKey,
    response: normalizedToken,
  });

  const clientIp = String(getClientIp(event) || '').trim();
  if (clientIp && clientIp !== 'unknown') {
    requestBody.set('remoteip', clientIp);
  }

  const verificationResponse = await fetchWithTimeout(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: requestBody.toString(),
    },
    timeoutMs,
  );

  if (!verificationResponse.ok) {
    throw Object.assign(new Error('Anti-bot challenge verification failed'), { statusCode: 502 });
  }

  const verificationResult = await verificationResponse.json();
  if (!verificationResult?.success) {
    throw Object.assign(new Error('Anti-bot challenge failed'), {
      statusCode: 403,
      turnstile: verificationResult,
    });
  }

  const expectedHostname = getTurnstileExpectedHostname(event);
  const actualHostname = String(verificationResult.hostname || '').trim().toLowerCase();
  if (expectedHostname && actualHostname && actualHostname !== expectedHostname) {
    throw Object.assign(new Error('Anti-bot challenge hostname mismatch'), {
      statusCode: 403,
      turnstile: verificationResult,
    });
  }

  return {
    enforced: true,
    success: true,
    hostname: verificationResult.hostname || null,
    action: verificationResult.action || null,
    challengeTs: verificationResult.challenge_ts || null,
  };
}

export async function getAuthenticatedUser(event, {
  sql,
  cookieName = AUTH_COOKIES.admin,
  requireAuth = true,
  role = null,
} = {}) {
  const effectiveSql = sql || getSqlClient();
  const cookies = parseCookies(event);
  const sessionToken = cookies[cookieName];

  if (!sessionToken) {
    if (requireAuth) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401, sql: effectiveSql });
    }

    return { sql: effectiveSql, user: null, sessionToken: null };
  }

  const rows = await effectiveSql`
    SELECT users.id, users.username, users.role, COALESCE(users.is_admin, FALSE) AS is_admin, sessions.expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${hashToken(sessionToken)}
      AND sessions.expires_at > NOW()
    LIMIT 1
  `;

  if (!rows.length) {
    await deleteSession(effectiveSql, sessionToken);
    if (requireAuth) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401, sql: effectiveSql });
    }
    return { sql: effectiveSql, user: null, sessionToken: null };
  }

  const user = {
    id: rows[0].id,
    username: rows[0].username,
    role: rows[0].role,
    isAdmin: Boolean(rows[0].is_admin),
    expiresAt: rows[0].expires_at,
  };

  const matchesRole = role
    ? (role === 'admin' ? (user.role === 'admin' || user.isAdmin) : user.role === role)
    : true;
  if (!matchesRole) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403, sql: effectiveSql });
  }

  return { sql: effectiveSql, sessionToken, user };
}
