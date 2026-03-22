-- Phase 2 member auth/history schema.
-- Apply after sql/admin_schema.sql so the shared users table already exists.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS membership_level TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET email = LOWER(email)
WHERE email IS NOT NULL;

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

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

DROP TRIGGER IF EXISTS set_member_profiles_updated_at ON member_profiles;
CREATE TRIGGER set_member_profiles_updated_at
BEFORE UPDATE ON member_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_calculation_history_updated_at ON calculation_history;
CREATE TRIGGER set_calculation_history_updated_at
BEFORE UPDATE ON calculation_history
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

COMMIT;
