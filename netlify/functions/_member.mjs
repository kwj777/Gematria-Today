import crypto from 'node:crypto';
import {
  AUTH_COOKIES,
  clearSessionCookie,
  createSession,
  createSessionCookie,
  getAuthenticatedUser as getAuthenticatedUserShared,
  getSqlClient,
  hashPassword,
  jsonResponse,
  parseBody,
  verifyPassword,
} from './_auth.mjs';
import { ensureAdminSchema } from './_admin.mjs';

export { AUTH_COOKIES, clearSessionCookie, createSession, createSessionCookie, getSqlClient, hashPassword, jsonResponse, parseBody };

export async function ensureMemberSchema(sql) {
  await ensureAdminSchema(sql);

  await sql`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS membership_level TEXT NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS membership_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_last_checkout_session_id TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE
  `;

  await sql`UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL`;

  await sql`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'users_membership_level_check'
    ) THEN
      ALTER TABLE users
      ADD CONSTRAINT users_membership_level_check
      CHECK (membership_level IN ('free', 'premium', 'lifetime'));
    END IF;
  END
  $$`;

  await sql`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'users_status_check'
    ) THEN
      ALTER TABLE users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('active', 'pending', 'suspended', 'deleted'));
    END IF;
  END
  $$`;

  await sql`CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql`;

  await sql`CREATE TABLE IF NOT EXISTS member_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    favorite_cipher TEXT,
    timezone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS calculation_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    query_type TEXT NOT NULL,
    calculator_source TEXT NOT NULL,
    gematria_total INTEGER,
    digital_root INTEGER,
    is_base_root BOOLEAN,
    result_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS calculation_history_user_created_at_idx ON calculation_history (user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS calculation_history_query_type_idx ON calculation_history (query_type, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS calculation_history_calculator_source_idx ON calculation_history (calculator_source, created_at DESC)`;

  await sql`DROP TRIGGER IF EXISTS set_member_profiles_updated_at ON member_profiles`;
  await sql`CREATE TRIGGER set_member_profiles_updated_at
    BEFORE UPDATE ON member_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp()`;

  await sql`DROP TRIGGER IF EXISTS set_calculation_history_updated_at ON calculation_history`;
  await sql`CREATE TRIGGER set_calculation_history_updated_at
    BEFORE UPDATE ON calculation_history
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp()`;
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username ?? '').trim();
}

export function formatMemberUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    membershipLevel: row.membership_level,
    membershipStartedAt: row.membership_started_at,
    membershipExpiresAt: row.membership_expires_at,
    stripeCustomerId: row.stripe_customer_id,
    stripeLastCheckoutSessionId: row.stripe_last_checkout_session_id,
    status: row.status,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatMemberProfile(row) {
  return {
    userId: row.user_id,
    preferences: row.preferences,
    favoriteCipher: row.favorite_cipher,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatCalculationHistory(row) {
  return {
    id: row.id,
    userId: row.user_id,
    queryText: row.query_text,
    queryType: row.query_type,
    calculatorSource: row.calculator_source,
    gematriaTotal: row.gematria_total,
    digitalRoot: row.digital_root,
    isBaseRoot: row.is_base_root,
    resultPayload: row.result_payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureMemberProfile(sql, userId, profile = {}) {
  const preferences = profile.preferences && typeof profile.preferences === 'object' ? profile.preferences : {};
  const favoriteCipher = profile.favoriteCipher ? String(profile.favoriteCipher) : null;
  const timezone = profile.timezone ? String(profile.timezone) : null;

  const rows = await sql`
    INSERT INTO member_profiles (user_id, preferences, favorite_cipher, timezone)
    VALUES (${userId}, ${JSON.stringify(preferences)}::jsonb, ${favoriteCipher}, ${timezone})
    ON CONFLICT (user_id)
    DO UPDATE SET
      preferences = COALESCE(member_profiles.preferences, '{}'::jsonb),
      favorite_cipher = COALESCE(member_profiles.favorite_cipher, EXCLUDED.favorite_cipher),
      timezone = COALESCE(member_profiles.timezone, EXCLUDED.timezone),
      updated_at = NOW()
    RETURNING *
  `;

  return formatMemberProfile(rows[0]);
}

export async function registerMember(sql, { username, email, password, displayName = '' }) {
  await ensureMemberSchema(sql);

  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeEmail(email);
  const normalizedDisplayName = String(displayName ?? '').trim() || normalizedUsername;

  if (!normalizedUsername || !normalizedEmail || !password) {
    throw Object.assign(new Error('Username, email, and password are required'), { statusCode: 400 });
  }

  const existing = await sql`
    SELECT id, username, email
    FROM users
    WHERE username = ${normalizedUsername}
       OR LOWER(email) = ${normalizedEmail}
    LIMIT 1
  `;

  if (existing.length) {
    throw Object.assign(new Error('A member with that username or email already exists'), { statusCode: 409 });
  }

  const passwordHash = await hashPassword(password);
  const rows = await sql`
    INSERT INTO users (
      id,
      username,
      email,
      display_name,
      password_hash,
      role,
      membership_level,
      membership_started_at,
      membership_expires_at,
      stripe_customer_id,
      stripe_last_checkout_session_id,
      status,
      email_verified
    )
    VALUES (
      ${crypto.randomUUID()},
      ${normalizedUsername},
      ${normalizedEmail},
      ${normalizedDisplayName},
      ${passwordHash},
      'member',
      'free',
      NULL,
      NULL,
      NULL,
      NULL,
      'active',
      FALSE
    )
    RETURNING *
  `;

  const member = rows[0];
  const profile = await ensureMemberProfile(sql, member.id, {});
  return { member: formatMemberUser(member), profile };
}


export async function activateYearlyMembership(sql, memberId, { stripeCustomerId = null, stripeCheckoutSessionId = null, purchasedAt = new Date() } = {}) {
  await ensureMemberSchema(sql);

  const startedAt = new Date(purchasedAt);
  const expiresAt = new Date(startedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 365);

  const rows = await sql`
    UPDATE users
    SET membership_level = 'premium',
        membership_started_at = ${startedAt.toISOString()},
        membership_expires_at = ${expiresAt.toISOString()},
        stripe_customer_id = COALESCE(${stripeCustomerId}, stripe_customer_id),
        stripe_last_checkout_session_id = COALESCE(${stripeCheckoutSessionId}, stripe_last_checkout_session_id),
        updated_at = NOW()
    WHERE id = ${memberId}
    RETURNING id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, created_at, updated_at
  `;

  if (!rows.length) {
    throw Object.assign(new Error('Member not found'), { statusCode: 404 });
  }

  return formatMemberUser(rows[0]);
}

export async function authenticateMemberCredentials(sql, identifier, password) {
  await ensureMemberSchema(sql);

  const normalizedIdentifier = String(identifier ?? '').trim();
  if (!normalizedIdentifier || !password) {
    return null;
  }

  const normalizedEmail = normalizeEmail(normalizedIdentifier);
  const rows = await sql`
    SELECT id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, password_hash, role, created_at, updated_at
    FROM users
    WHERE username = ${normalizedIdentifier}
       OR LOWER(email) = ${normalizedEmail}
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  const user = rows[0];
  if (user.role !== 'member') {
    return null;
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  if (user.status !== 'active') {
    throw Object.assign(new Error(`This membership account is ${user.status}`), { statusCode: 403 });
  }

  return formatMemberUser(user);
}

export async function getAuthenticatedMember(event, { requireAuth = true } = {}) {
  const sql = getSqlClient();
  await ensureMemberSchema(sql);

  const authResult = await getAuthenticatedUserShared(event, {
    sql,
    cookieName: AUTH_COOKIES.member,
    requireAuth,
    role: 'member',
  });

  if (!authResult.user) {
    return { ...authResult, member: null, profile: null };
  }

  const memberRows = await sql`
    SELECT id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, created_at, updated_at
    FROM users
    WHERE id = ${authResult.user.id}
    LIMIT 1
  `;

  if (!memberRows.length) {
    if (requireAuth) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }
    return { sql, sessionToken: authResult.sessionToken, user: null, member: null, profile: null };
  }

  const profileRows = await sql`
    SELECT *
    FROM member_profiles
    WHERE user_id = ${authResult.user.id}
    LIMIT 1
  `;

  const member = formatMemberUser(memberRows[0]);
  const profile = profileRows.length ? formatMemberProfile(profileRows[0]) : await ensureMemberProfile(sql, authResult.user.id, {});

  return {
    sql,
    sessionToken: authResult.sessionToken,
    user: authResult.user,
    member,
    profile,
  };
}
