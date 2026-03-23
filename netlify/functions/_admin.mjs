import crypto from 'node:crypto';
import {
  AUTH_COOKIES,
  authenticateCredentials as authenticateCredentialsShared,
  clearSessionCookie,
  createSession,
  createSessionCookie,
  deleteSession,
  getAuthenticatedUser as getAuthenticatedUserShared,
  getSqlClient,
  hashPassword,
  jsonResponse,
  parseBody,
} from './_auth.mjs';
import { ensureSecuritySchema } from './_security.mjs';

const SEEDED_ADMIN_USERS = [
  {
    id: 'kevandmel',
    username: 'kevandmel',
    passwordHash: 'scrypt$b1c4f2285150fe8d4b7c4db52a0c8d13$228c63f1b83b3d27bb4a6deec2c8d51dac6f85f9c982c7fd91ed0a7a68a87fd96f004f1163120aaafc3b3be560ce4efded49a00b9f6e47b964f0cc0acd5a1192',
    role: 'admin',
  },
];

export { clearSessionCookie, createSession, createSessionCookie, deleteSession, getSqlClient, jsonResponse, parseBody };

export async function ensureAdminSchema(sql) {
  await ensureSecuritySchema(sql);
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email TEXT`;

  await sql`UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL`;

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
    show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'published',
    published_at TIMESTAMPTZ,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS summary TEXT`;

  await sql`ALTER TABLE posts
    ALTER COLUMN summary SET DEFAULT ''`;

  await sql`UPDATE posts SET summary = '' WHERE summary IS NULL`;

  await sql`ALTER TABLE posts
    ALTER COLUMN summary SET NOT NULL`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS body TEXT`;

  await sql`ALTER TABLE posts
    ALTER COLUMN body SET DEFAULT ''`;

  await sql`UPDATE posts SET body = '' WHERE body IS NULL`;

  await sql`ALTER TABLE posts
    ALTER COLUMN body SET NOT NULL`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS read_time TEXT`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS status TEXT`;

  await sql`UPDATE posts
    SET status = 'published'
    WHERE status IS NULL OR BTRIM(status) = ''`;

  await sql`ALTER TABLE posts
    ALTER COLUMN status SET DEFAULT 'published'`;

  await sql`ALTER TABLE posts
    ALTER COLUMN status SET NOT NULL`;

  await sql`UPDATE posts
    SET show_on_homepage = FALSE
    WHERE show_on_homepage IS NULL`;

  await sql`ALTER TABLE posts
    ALTER COLUMN show_on_homepage SET DEFAULT FALSE`;

  await sql`ALTER TABLE posts
    ALTER COLUMN show_on_homepage SET NOT NULL`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`;

  await sql`UPDATE posts
    SET published_at = COALESCE(published_at, created_at)
    WHERE COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published' AND published_at IS NULL`;

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

  await sql`CREATE TABLE IF NOT EXISTS faqs (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS faqs_is_published_sort_order_idx ON faqs(is_published, sort_order ASC, created_at ASC)`;


  await sql`CREATE TABLE IF NOT EXISTS admin_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

}

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `post-${crypto.randomBytes(4).toString('hex')}`;
}

export async function syncBootstrapAdminUser(sql) {
  for (const seededUser of SEEDED_ADMIN_USERS) {
    await sql`
      INSERT INTO users (id, username, password_hash, role)
      VALUES (${seededUser.id}, ${seededUser.username}, ${seededUser.passwordHash}, ${seededUser.role})
      ON CONFLICT (username)
      DO UPDATE SET id = EXCLUDED.id, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, updated_at = NOW()
    `;
  }

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const password = process.env.ADMIN_PASSWORD;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;

  if (!username || (!passwordHash && !password)) {
    return;
  }

  const effectiveHash = passwordHash || await hashPassword(password);
  await sql`
    INSERT INTO users (id, username, email, password_hash, role)
    VALUES (${crypto.randomUUID()}, ${username}, ${email}, ${effectiveHash}, 'admin')
    ON CONFLICT (username)
    DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email), password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, updated_at = NOW()
  `;
}

export async function authenticateCredentials(sql, username, password) {
  await ensureAdminSchema(sql);
  await syncBootstrapAdminUser(sql);
  return authenticateCredentialsShared(sql, username, password, { role: 'admin' });
}

export async function getAuthenticatedUser(event, { requireAuth = true } = {}) {
  const sql = getSqlClient();
  await ensureAdminSchema(sql);
  await syncBootstrapAdminUser(sql);

  return getAuthenticatedUserShared(event, {
    sql,
    cookieName: AUTH_COOKIES.admin,
    requireAuth,
    role: 'admin',
  });
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
    showOnHomepage: row.show_on_homepage,
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

export function formatFaq(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
