CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
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
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner TEXT,
  due_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS faqs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS admin_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


INSERT INTO users (id, username, password_hash, role)
VALUES (
  'kevandmel',
  'kevandmel',
  'scrypt$b1c4f2285150fe8d4b7c4db52a0c8d13$228c63f1b83b3d27bb4a6deec2c8d51dac6f85f9c982c7fd91ed0a7a68a87fd96f004f1163120aaafc3b3be560ce4efded49a00b9f6e47b964f0cc0acd5a1192',
  'admin'
)
ON CONFLICT (username)
DO UPDATE SET
  id = EXCLUDED.id,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  updated_at = NOW();


CREATE TABLE IF NOT EXISTS request_rate_limits (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, key)
);

CREATE INDEX IF NOT EXISTS request_rate_limits_blocked_until_idx
  ON request_rate_limits (blocked_until);

CREATE TABLE IF NOT EXISTS function_response_cache (
  cache_key TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS function_response_cache_route_expires_idx
  ON function_response_cache (route, expires_at DESC);

CREATE TABLE IF NOT EXISTS request_audit_log (
  id TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  ip_address TEXT,
  request_fingerprint TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS request_audit_log_route_created_at_idx
  ON request_audit_log (route, created_at DESC);


ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE users
SET email = LOWER(email)
WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_recovery_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  recovery_type TEXT NOT NULL,
  lookup_key TEXT,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_recovery_requests_user_type_idx
  ON account_recovery_requests (user_id, recovery_type, created_at DESC);

CREATE INDEX IF NOT EXISTS account_recovery_requests_expires_idx
  ON account_recovery_requests (expires_at DESC);
