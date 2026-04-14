-- Phase 2 member auth/history schema.
-- Apply after sql/admin_schema.sql so the shared users table already exists.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS membership_level TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS membership_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_last_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET email = LOWER(email)
WHERE email IS NOT NULL;

UPDATE users
SET membership_level = 'lifetime',
    membership_started_at = COALESCE(membership_started_at, NOW()),
    membership_expires_at = NULL
WHERE (role = 'admin' OR COALESCE(is_admin, FALSE) = TRUE)
  AND (
    membership_level IS DISTINCT FROM 'lifetime'
    OR membership_expires_at IS NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

DO $$
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
$$;

DO $$
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
$$;

CREATE TABLE IF NOT EXISTS member_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  favorite_cipher TEXT,
  timezone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calculation_history (
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
);

CREATE INDEX IF NOT EXISTS calculation_history_user_created_at_idx
  ON calculation_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS calculation_history_query_type_idx
  ON calculation_history (query_type, created_at DESC);

CREATE INDEX IF NOT EXISTS calculation_history_calculator_source_idx
  ON calculation_history (calculator_source, created_at DESC);

CREATE TABLE IF NOT EXISTS member_chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  transcript JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_chat_sessions_user_created_at_idx
  ON member_chat_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS member_email_verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_email_verification_requests_user_idx
  ON member_email_verification_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS member_email_verification_requests_expires_idx
  ON member_email_verification_requests (expires_at DESC);

DROP TRIGGER IF EXISTS set_member_profiles_updated_at ON member_profiles;
DROP TRIGGER IF EXISTS set_calculation_history_updated_at ON calculation_history;
DROP FUNCTION IF EXISTS set_updated_at_timestamp();

COMMIT;
