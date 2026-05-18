import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';
import {
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
  admin: 'gematria_admin_session',
  member: 'gematria_member_session',
  memberTier: 'gematria_member_tier',
  visitor: 'gematria_visitor_session',
};

const VISITOR_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function getVisitorSessionToken(event) {
  const cookies = parseCookies(event);
  return cookies[AUTH_COOKIES.visitor] || null;
}

export function createVisitorSessionToken() {
  return crypto.randomBytes(16).toString('hex');
}

export function createVisitorSessionCookie(token) {
  const expiresAt = new Date(Date.now() + VISITOR_SESSION_TTL_MS);
  const explicitSecureSetting = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase();
  const shouldUseSecureCookie = explicitSecureSetting
    ? !['0', 'false', 'no', 'off'].includes(explicitSecureSetting)
    : process.env.CONTEXT !== 'dev';
  const secureDirective = shouldUseSecureCookie ? '; Secure' : '';
  return `${AUTH_COOKIES.visitor}=${encodeURIComponent(token)}; Path=/; HttpOnly${secureDirective}; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function getOrCreateVisitorSession(event) {
  const existing = getVisitorSessionToken(event);
  if (existing) {
    return { visitorSessionId: existing, isNew: false, visitorCookie: null };
  }
  const token = createVisitorSessionToken();
  return { visitorSessionId: token, isNew: true, visitorCookie: createVisitorSessionCookie(token) };
}

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
  const sessionToken = cookies[cookieName] || null;

  if (!sessionToken) {
    return null;
  }

  const rows = await sql`
    SELECT users.id, users.username, users.role, COALESCE(users.is_admin, FALSE) AS is_admin, sessions.expires_at
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
      isAdmin: Boolean(rows[0].is_admin),
      expiresAt: rows[0].expires_at,
    },
  };
}

export function createSessionCookie(token, expiresAt, cookieName = AUTH_COOKIES.admin) {
  const explicitSecureSetting = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase();
  const shouldUseSecureCookie = explicitSecureSetting
    ? !['0', 'false', 'no', 'off'].includes(explicitSecureSetting)
    : process.env.CONTEXT !== 'dev';
  const secureDirective = shouldUseSecureCookie ? '; Secure' : '';
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly${secureDirective}; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

function buildSessionClearHeader(cookieName, { httpOnly = true } = {}) {
  const explicitSecureSetting = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase();
  const shouldUseSecureCookie = explicitSecureSetting
    ? !['0', 'false', 'no', 'off'].includes(explicitSecureSetting)
    : process.env.CONTEXT !== 'dev';
  const secureDirective = shouldUseSecureCookie ? '; Secure' : '';
  const httpOnlyDirective = httpOnly ? '; HttpOnly' : '';
  return `${cookieName}=; Path=/${httpOnlyDirective}${secureDirective}; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function clearSessionCookie(cookieName = AUTH_COOKIES.admin) {
  return [buildSessionClearHeader(cookieName)];
}

const ALLOWED_MEMBER_TIERS = new Set(['free', 'premium', 'lifetime']);

export function createMemberTierCookie(level, expiresAt) {
  const normalized = ALLOWED_MEMBER_TIERS.has(level) ? level : 'free';
  const explicitSecureSetting = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase();
  const shouldUseSecureCookie = explicitSecureSetting
    ? !['0', 'false', 'no', 'off'].includes(explicitSecureSetting)
    : process.env.CONTEXT !== 'dev';
  const secureDirective = shouldUseSecureCookie ? '; Secure' : '';
  return `${AUTH_COOKIES.memberTier}=${normalized}; Path=/${secureDirective}; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearMemberTierCookie() {
  return [buildSessionClearHeader(AUTH_COOKIES.memberTier, { httpOnly: false })];
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

export const CSRF_TOKEN_HEADER = 'x-csrf-token';

function getCsrfSecret() {
  const secret = String(process.env.CSRF_SECRET || process.env.DATABASE_URL || '').trim();
  if (!secret) {
    throw new Error('Missing CSRF_SECRET environment variable');
  }
  return secret;
}

export function generateCsrfToken(sessionToken) {
  return crypto.createHmac('sha256', getCsrfSecret())
    .update('session:' + String(sessionToken || ''))
    .digest('hex');
}

export function validateCsrfToken(providedToken, sessionToken) {
  if (!providedToken || !sessionToken) {
    return false;
  }
  const expected = generateCsrfToken(sessionToken);
  const provided = String(providedToken);
  if (provided.length !== expected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

export function getCsrfTokenFromRequest(event) {
  if (typeof event?.headers?.get === 'function') {
    return String(event.headers.get(CSRF_TOKEN_HEADER) || '').trim();
  }
  return String(event?.headers?.[CSRF_TOKEN_HEADER] || '').trim();
}

export async function getAuthenticatedUser(event, {
  sql,
  cookieName = AUTH_COOKIES.admin,
  requireAuth = true,
  role = null,
} = {}) {
  const effectiveSql = sql || getSqlClient();
  const cookies = parseCookies(event);
  const sessionToken = cookies[cookieName] || null;

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
