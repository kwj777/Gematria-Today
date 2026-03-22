import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';
import { jsonResponse as secureJsonResponse } from './_security.mjs';

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

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
  const rawCookies = event.headers?.cookie || event.headers?.Cookie || '';
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

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
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

export async function deleteSession(sql, token) {
  if (!token) {
    return;
  }

  await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
}

export async function authenticateCredentials(sql, identifier, password, { role = null } = {}) {
  const normalizedIdentifier = String(identifier ?? '').trim();

  if (!normalizedIdentifier || !password) {
    return null;
  }

  const rows = await sql`
    SELECT id, username, password_hash, role
    FROM users
    WHERE username = ${normalizedIdentifier}
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  const user = rows[0];
  if (role && user.role !== role) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password_hash);
  return isValid ? user : null;
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
    SELECT users.id, users.username, users.role, sessions.expires_at
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
    expiresAt: rows[0].expires_at,
  };

  if (role && user.role !== role) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403, sql: effectiveSql });
  }

  return { sql: effectiveSql, sessionToken, user };
}
