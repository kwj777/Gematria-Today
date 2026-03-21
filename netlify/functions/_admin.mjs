import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'endtimes_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function getSqlClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL environment variable');
  }

  return neon(process.env.DATABASE_URL);
}

export async function ensureAdminSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)`;

  await sql`CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tag TEXT,
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    read_time TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    published_at TIMESTAMPTZ,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS posts_status_published_at_idx ON posts(status, published_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    owner TEXT,
    due_date DATE,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS tasks_status_due_date_idx ON tasks(status, due_date ASC NULLS LAST)`;
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith('scrypt$')) {
    const [, salt, key] = storedHash.split('$');
    const derivedKey = await scrypt(password, salt, 64);
    const candidate = Buffer.from(derivedKey).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(key, 'utf8'));
  }

  return false;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `post-${crypto.randomBytes(4).toString('hex')}`;
}

export async function syncBootstrapAdminUser(sql) {
  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || (!passwordHash && !password)) {
    return;
  }

  const effectiveHash = passwordHash || await hashPassword(password);
  await sql`
    INSERT INTO users (id, username, password_hash, role)
    VALUES (${crypto.randomUUID()}, ${username}, ${effectiveHash}, 'admin')
    ON CONFLICT (username)
    DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, updated_at = NOW()
  `;
}

export function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
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

export function createSessionCookie(token, expiresAt) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
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

export async function getAuthenticatedUser(event, { requireAuth = true } = {}) {
  const sql = getSqlClient();
  await ensureAdminSchema(sql);
  await syncBootstrapAdminUser(sql);

  const cookies = parseCookies(event);
  const sessionToken = cookies[SESSION_COOKIE];

  if (!sessionToken) {
    if (requireAuth) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401, sql });
    }

    return { sql, user: null, sessionToken: null };
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
    if (requireAuth) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401, sql });
    }
    return { sql, user: null, sessionToken: null };
  }

  return {
    sql,
    sessionToken,
    user: {
      id: rows[0].id,
      username: rows[0].username,
      role: rows[0].role,
      expiresAt: rows[0].expires_at,
    },
  };
}

export async function authenticateCredentials(sql, username, password) {
  await ensureAdminSchema(sql);
  await syncBootstrapAdminUser(sql);

  const rows = await sql`SELECT id, username, password_hash, role FROM users WHERE username = ${username} LIMIT 1`;
  if (!rows.length) {
    return null;
  }

  const user = rows[0];
  const isValid = await verifyPassword(password, user.password_hash);
  return isValid ? user : null;
}

export function formatPost(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    tag: row.tag,
    summary: row.summary,
    body: row.body,
    readTime: row.read_time,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

export function formatFeed(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    category: row.category,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export function formatTask(row) {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    dueDate: row.due_date,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
  };
}
