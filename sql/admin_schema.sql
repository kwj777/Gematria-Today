CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
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
  image_url TEXT,
  slider_image_url TEXT,
  show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE,
  hide_from_blog BOOLEAN NOT NULL DEFAULT FALSE,
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


INSERT INTO users (id, username, password_hash, role, is_admin)
VALUES (
  'kevandmel',
  'kevandmel',
  'scrypt$b1c4f2285150fe8d4b7c4db52a0c8d13$228c63f1b83b3d27bb4a6deec2c8d51dac6f85f9c982c7fd91ed0a7a68a87fd96f004f1163120aaafc3b3be560ce4efded49a00b9f6e47b964f0cc0acd5a1192',
  'admin',
  TRUE
)
ON CONFLICT (username)
DO UPDATE SET
  id = EXCLUDED.id,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  is_admin = EXCLUDED.is_admin,
  updated_at = NOW();

INSERT INTO posts (
  id,
  title,
  slug,
  tag,
  summary,
  body,
  read_time,
  image_url,
  slider_image_url,
  show_on_homepage,
  status,
  published_at,
  created_by
)
VALUES (
  'post-digital-roots-in-gematria',
  'Digital Roots and Their Significance in Gematria',
  'digital-roots-in-gematria',
  'Number Patterns',
  'See how digital roots offer a quick pattern layer for comparing words, names, and phrases in gematria work.',
  '<p>Digital roots reduce any number to a single digit by repeatedly adding digits until one remains. For example, 197 becomes 1 + 9 + 7 = 17, then 1 + 7 = 8. In gematria, this gives you a fast way to compare values that look different on the surface but may still share a structural rhythm.</p><p>Why does this matter? Large totals can hide simple relationships. Two words may not match exactly, but their digital roots can align and suggest they belong in the same thematic group. This does not replace standard value matching; instead, it adds a second layer for pattern recognition. Think of total value as the full measurement and digital root as the compressed signature.</p><p>A practical method is to calculate both numbers every time: the full gematria total and the digital root. First, sort by exact total to find direct matches. Next, scan by digital root to find families of related terms that may deserve closer study. When a root value repeats across names, symbols, and action words in the same topic, you may have a stronger pattern than a one-off coincidence.</p><p>Digital roots are also useful for organizing research notes. You can create sections for root values 1 through 9 and file candidate terms under each group. Over time, this makes it easier to compare clusters and notice recurring themes without re-running every calculation from scratch.</p><p>Most importantly, treat digital roots as guidance, not proof. Context, language history, spelling variants, and textual setting still carry the most interpretive weight. Used carefully, digital roots can make gematria research more structured, more searchable, and more reproducible.</p>',
  '6 minute read',
  '/assets/digital-roots-gematria-hero.svg',
  '/assets/digital-roots-gematria-hero.svg',
  TRUE,
  'published',
  '2026-03-25T00:00:00.000Z',
  'kevandmel'
)
ON CONFLICT DO NOTHING;

INSERT INTO posts (
  id,
  title,
  slug,
  tag,
  summary,
  body,
  read_time,
  image_url,
  slider_image_url,
  show_on_homepage,
  status,
  published_at,
  created_by
)
VALUES (
  'post-determining-identity-of-the-beast-rev-13',
  'Determining the Identity of the Beast - Rev. 13',
  'determining-identity-of-the-beast-rev-13',
  'Revelation 13, Methodology',
  'A structured framework for testing Revelation 13 candidates using English gematria, digital roots, and base-root word clusters instead of isolated matches.',
  '<p>Revelation 13:18 asks readers to count, and that invitation has pushed generations of researchers to ask how counting should be done with consistency. A modern approach is to use <strong><a href="/why-english-gematria.html">English gematria</a></strong> as a repeatable baseline for English-language names, titles, institutions, and slogans that circulate globally in media and policy spaces.</p><p>The key is method, not hype. One value by itself is weak evidence. What matters is whether values hold across related terms and whether they survive variant testing. This is where <strong><a href="/blog.html?post=digital-roots-in-gematria#digital-roots-in-gematria">digital roots</a></strong> and <strong><a href="/gematria-pattern-grouping.html">base-root words</a></strong> become useful controls inside the same workflow.</p><h3>1) Why start with English gematria?</h3><p>For researchers working in an English-speaking information ecosystem, English gematria creates a common measuring layer. It allows side-by-side comparison of names, titles, systems, and enforcement language associated with Revelation 13 themes such as authority, worship, commerce, and marking.</p><ul><li>It is transparent: same spelling, same result.</li><li>It is reproducible: others can verify quickly.</li><li>It is scalable: you can compare single names and large phrase groups.</li></ul><h3>2) Why add digital roots?</h3><p>Digital roots (reducing totals to a single digit pattern) are not a replacement for full totals, but they are a structural checkpoint. If full values differ while digital roots repeatedly align across a themed set, researchers can flag a possible pattern layer that might be missed by raw totals alone.</p><p>In practice, digital roots help answer: are these terms only matching once, or do they echo each other in a compressed numeric signature?</p><h3>3) Why use base-root words?</h3><p>Base-root words keep interpretation anchored to meaning, not just numbers. Instead of searching random terms, build families of related words from a root concept (for example: rule, ruler, ruling, dominion, dominator). Then test whether the numeric behavior repeats inside the concept family.</p><p>This reduces cherry-picking because your set is concept-driven before calculation. If a pattern is real, it should appear across legitimate members of the same semantic root—not only in one convenient phrase.</p><h3>4) A combined Beast-identification workflow</h3><ol><li>Define one candidate (name/title/system) tied to Revelation 13 claims.</li><li>Calculate the English gematria value for the exact spelling used.</li><li>Run variant controls (spacing, abbreviations, title forms) and log all results.</li><li>Reduce each total to digital roots and check for repeated signatures.</li><li>Build <a href="/gematria-pattern-grouping.html">base-root word clusters</a> for related themes (authority, commerce, worship, compulsion, image, mark).</li><li>Compare candidate values against those themed clusters.</li><li>Record non-matches as seriously as matches.</li><li>Assign confidence only after repeatability across all three layers.</li></ol><h3>5) Why this can help identify who/what the Beast is</h3><p>Revelation 13 describes more than a personal name; it describes a system of power, economy, worship pressure, and identity control. A three-layer method—English gematria, digital roots, and base-root clusters—tests both <em>person-level</em> and <em>system-level</em> candidates without collapsing everything into one dramatic number.</p><p>When a candidate repeatedly aligns across full totals, digital-root structure, and root-word theme sets, the case becomes stronger than a single coincidence. When the pattern breaks under controls, the case weakens. That is the point: disciplined counting should separate durable signals from speculative excitement.</p><p><strong>Bottom line:</strong> If Revelation 13 calls us to count, then we should count with rules. <a href="/why-english-gematria.html">English gematria</a> provides the baseline, <a href="/blog.html?post=digital-roots-in-gematria#digital-roots-in-gematria">digital roots</a> provide compression checks, and <a href="/gematria-pattern-grouping.html">base-root words</a> provide semantic guardrails. Together they form a practical path for testing Beast hypotheses with greater rigor.</p>',
  '9 minute read',
  '/assets/beast-identity-rev13-hero-16x9.svg',
  '/assets/beast-identity-rev13-slider-21x9.svg',
  TRUE,
  'published',
  '2026-03-30T00:00:00.000Z',
  'kevandmel'
)
ON CONFLICT DO NOTHING;


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

CREATE INDEX IF NOT EXISTS request_rate_limits_last_seen_at_idx
  ON request_rate_limits (last_seen_at ASC);

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

CREATE INDEX IF NOT EXISTS function_response_cache_expires_at_idx
  ON function_response_cache (expires_at ASC);

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

CREATE INDEX IF NOT EXISTS request_audit_log_created_at_idx
  ON request_audit_log (created_at ASC);


ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET is_admin = TRUE
WHERE role = 'admin';

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

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS summary TEXT;

UPDATE posts
SET summary = ''
WHERE summary IS NULL;

ALTER TABLE posts
  ALTER COLUMN summary SET DEFAULT '';

ALTER TABLE posts
  ALTER COLUMN summary SET NOT NULL;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS body TEXT;

UPDATE posts
SET body = ''
WHERE body IS NULL;

ALTER TABLE posts
  ALTER COLUMN body SET DEFAULT '';

ALTER TABLE posts
  ALTER COLUMN body SET NOT NULL;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS read_time TEXT;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS show_on_homepage BOOLEAN;

UPDATE posts
SET show_on_homepage = FALSE
WHERE show_on_homepage IS NULL;

ALTER TABLE posts
  ALTER COLUMN show_on_homepage SET DEFAULT FALSE;

ALTER TABLE posts
  ALTER COLUMN show_on_homepage SET NOT NULL;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS hide_from_blog BOOLEAN;

UPDATE posts
SET hide_from_blog = FALSE
WHERE hide_from_blog IS NULL;

ALTER TABLE posts
  ALTER COLUMN hide_from_blog SET DEFAULT FALSE;

ALTER TABLE posts
  ALTER COLUMN hide_from_blog SET NOT NULL;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE posts
SET status = 'published'
WHERE status IS NULL OR BTRIM(status) = '';

ALTER TABLE posts
  ALTER COLUMN status SET DEFAULT 'published';

ALTER TABLE posts
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE posts
SET published_at = COALESCE(published_at, created_at)
WHERE COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
  AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_status_published_at_idx
  ON posts(status, published_at DESC);


ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS slider_image_url TEXT;
