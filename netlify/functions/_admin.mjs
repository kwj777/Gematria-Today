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

const SEEDED_POSTS = [
  {
    id: 'post-digital-roots-in-gematria',
    title: 'Digital Roots and Their Significance in Gematria',
    slug: 'digital-roots-in-gematria',
    tag: 'Number Patterns',
    summary: 'See how digital roots offer a quick pattern layer for comparing words, names, and phrases in gematria work.',
    body: `<p>Digital roots reduce any number to a single digit by repeatedly adding digits until one remains. For example, 197 becomes 1 + 9 + 7 = 17, then 1 + 7 = 8. In gematria, this gives you a fast way to compare values that look different on the surface but may still share a structural rhythm.</p><p>Why does this matter? Large totals can hide simple relationships. Two words may not match exactly, but their digital roots can align and suggest they belong in the same thematic group. This does not replace standard value matching; instead, it adds a second layer for pattern recognition. Think of total value as the full measurement and digital root as the compressed signature.</p><p>A practical method is to calculate both numbers every time: the full gematria total and the digital root. First, sort by exact total to find direct matches. Next, scan by digital root to find families of related terms that may deserve closer study. When a root value repeats across names, symbols, and action words in the same topic, you may have a stronger pattern than a one-off coincidence.</p><p>Digital roots are also useful for organizing research notes. You can create sections for root values 1 through 9 and file candidate terms under each group. Over time, this makes it easier to compare clusters and notice recurring themes without re-running every calculation from scratch.</p><p>Most importantly, treat digital roots as guidance, not proof. Context, language history, spelling variants, and textual setting still carry the most interpretive weight. Used carefully, digital roots can make gematria research more structured, more searchable, and more reproducible.</p>`,
    readTime: '6 minute read',
    imageUrl: '/assets/digital-roots-gematria-hero.svg',
    sliderImageUrl: '/assets/digital-roots-gematria-hero.svg',
    showOnHomepage: true,
    status: 'published',
    createdBy: 'kevandmel',
    publishedAt: '2026-03-25T00:00:00.000Z',
  },
  {
    id: 'post-determining-identity-of-the-beast-rev-13',
    title: 'Determining the Identity of the Beast - Rev. 13',
    slug: 'determining-identity-of-the-beast-rev-13',
    tag: 'Revelation 13, Methodology',
    summary: 'A structured framework for testing Revelation 13 candidates using English gematria, digital roots, and base-root word clusters instead of isolated matches.',
    body: `<p>Revelation 13:18 asks readers to count, and that invitation has pushed generations of researchers to ask how counting should be done with consistency. A modern approach is to use <strong><a href="/why-english-gematria.html">English gematria</a></strong> as a repeatable baseline for English-language names, titles, institutions, and slogans that circulate globally in media and policy spaces.</p><p>The key is method, not hype. One value by itself is weak evidence. What matters is whether values hold across related terms and whether they survive variant testing. This is where <strong><a href="/blog.html?post=digital-roots-in-gematria#digital-roots-in-gematria">digital roots</a></strong> and <strong><a href="/gematria-pattern-grouping.html">base-root words</a></strong> become useful controls inside the same workflow.</p><h3>1) Why start with English gematria?</h3><p>For researchers working in an English-speaking information ecosystem, English gematria creates a common measuring layer. It allows side-by-side comparison of names, titles, systems, and enforcement language associated with Revelation 13 themes such as authority, worship, commerce, and marking.</p><ul><li>It is transparent: same spelling, same result.</li><li>It is reproducible: others can verify quickly.</li><li>It is scalable: you can compare single names and large phrase groups.</li></ul><h3>2) Why add digital roots?</h3><p>Digital roots (reducing totals to a single digit pattern) are not a replacement for full totals, but they are a structural checkpoint. If full values differ while digital roots repeatedly align across a themed set, researchers can flag a possible pattern layer that might be missed by raw totals alone.</p><p>In practice, digital roots help answer: are these terms only matching once, or do they echo each other in a compressed numeric signature?</p><h3>3) Why use base-root words?</h3><p>Base-root words keep interpretation anchored to meaning, not just numbers. Instead of searching random terms, build families of related words from a root concept (for example: rule, ruler, ruling, dominion, dominator). Then test whether the numeric behavior repeats inside the concept family.</p><p>This reduces cherry-picking because your set is concept-driven before calculation. If a pattern is real, it should appear across legitimate members of the same semantic root—not only in one convenient phrase.</p><h3>4) A combined Beast-identification workflow</h3><ol><li>Define one candidate (name/title/system) tied to Revelation 13 claims.</li><li>Calculate the English gematria value for the exact spelling used.</li><li>Run variant controls (spacing, abbreviations, title forms) and log all results.</li><li>Reduce each total to digital roots and check for repeated signatures.</li><li>Build <a href="/gematria-pattern-grouping.html">base-root word clusters</a> for related themes (authority, commerce, worship, compulsion, image, mark).</li><li>Compare candidate values against those themed clusters.</li><li>Record non-matches as seriously as matches.</li><li>Assign confidence only after repeatability across all three layers.</li></ol><h3>5) Why this can help identify who/what the Beast is</h3><p>Revelation 13 describes more than a personal name; it describes a system of power, economy, worship pressure, and identity control. A three-layer method—English gematria, digital roots, and base-root clusters—tests both <em>person-level</em> and <em>system-level</em> candidates without collapsing everything into one dramatic number.</p><p>When a candidate repeatedly aligns across full totals, digital-root structure, and root-word theme sets, the case becomes stronger than a single coincidence. When the pattern breaks under controls, the case weakens. That is the point: disciplined counting should separate durable signals from speculative excitement.</p><p><strong>Bottom line:</strong> If Revelation 13 calls us to count, then we should count with rules. <a href="/why-english-gematria.html">English gematria</a> provides the baseline, <a href="/blog.html?post=digital-roots-in-gematria#digital-roots-in-gematria">digital roots</a> provide compression checks, and <a href="/gematria-pattern-grouping.html">base-root words</a> provide semantic guardrails. Together they form a practical path for testing Beast hypotheses with greater rigor.</p>`,
    readTime: '9 minute read',
    imageUrl: '/assets/beast-identity-rev13-hero-16x9.svg',
    sliderImageUrl: '/assets/beast-identity-rev13-slider-21x9.svg',
    showOnHomepage: true,
    status: 'published',
    createdBy: 'kevandmel',
    publishedAt: '2026-03-30T00:00:00.000Z',
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
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`UPDATE users
    SET is_admin = TRUE
    WHERE role = 'admin'`;

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
    hide_from_blog BOOLEAN NOT NULL DEFAULT FALSE,
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
    ADD COLUMN IF NOT EXISTS image_url TEXT`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS slider_image_url TEXT`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS hide_from_blog BOOLEAN NOT NULL DEFAULT FALSE`;

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

  await sql`UPDATE posts
    SET hide_from_blog = FALSE
    WHERE hide_from_blog IS NULL`;

  await sql`ALTER TABLE posts
    ALTER COLUMN hide_from_blog SET DEFAULT FALSE`;

  await sql`ALTER TABLE posts
    ALTER COLUMN hide_from_blog SET NOT NULL`;

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
      INSERT INTO users (id, username, password_hash, role, is_admin)
      VALUES (${seededUser.id}, ${seededUser.username}, ${seededUser.passwordHash}, ${seededUser.role}, TRUE)
      ON CONFLICT (username)
      DO UPDATE SET id = EXCLUDED.id, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin, updated_at = NOW()
    `;
  }

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const password = process.env.ADMIN_PASSWORD;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;

  for (const seededPost of SEEDED_POSTS) {
    await sql`
      INSERT INTO posts (
        id, title, slug, tag, summary, body, read_time, image_url, slider_image_url, show_on_homepage, status, published_at, created_by
      )
      VALUES (
        ${seededPost.id},
        ${seededPost.title},
        ${seededPost.slug},
        ${seededPost.tag},
        ${seededPost.summary},
        ${seededPost.body},
        ${seededPost.readTime},
        ${seededPost.imageUrl},
        ${seededPost.sliderImageUrl || seededPost.imageUrl},
        ${seededPost.showOnHomepage},
        ${seededPost.status},
        ${seededPost.publishedAt},
        ${seededPost.createdBy}
      )
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        tag = EXCLUDED.tag,
        summary = EXCLUDED.summary,
        body = EXCLUDED.body,
        read_time = EXCLUDED.read_time,
        image_url = EXCLUDED.image_url,
        slider_image_url = EXCLUDED.slider_image_url,
        show_on_homepage = EXCLUDED.show_on_homepage,
        status = EXCLUDED.status,
        published_at = EXCLUDED.published_at,
        updated_at = NOW()
    `;
  }

  if (!username || (!passwordHash && !password)) {
    return;
  }

  const effectiveHash = passwordHash || await hashPassword(password);
  await sql`
    INSERT INTO users (id, username, email, password_hash, role, is_admin)
    VALUES (${crypto.randomUUID()}, ${username}, ${email}, ${effectiveHash}, 'admin', TRUE)
    ON CONFLICT (username)
    DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email), password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin, updated_at = NOW()
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

export function methodNotAllowedResponse() {
  return jsonResponse(405, { error: 'Method not allowed' });
}

export function requireHttpMethod(event, ...allowedMethods) {
  const methods = allowedMethods.flat().map((method) => String(method || '').toUpperCase()).filter(Boolean);
  if (!methods.includes(String(event?.httpMethod || '').toUpperCase())) {
    return methodNotAllowedResponse();
  }
  return null;
}

export async function routeByHttpMethod(event, handlers = {}, { methodNotAllowed = methodNotAllowedResponse } = {}) {
  const method = String(event?.httpMethod || '').toUpperCase();
  const handler = handlers[method];
  if (!handler) {
    return methodNotAllowed();
  }
  return handler();
}

export function formatPost(row) {
  const tagValue = String(row.tag ?? '').trim();
  const tags = tagValue
    ? [...new Map(tagValue.split(',').map((tag) => String(tag || '').trim()).filter(Boolean).map((tag) => [tag.toLowerCase(), tag])).values()]
    : [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    tag: tagValue || null,
    tags,
    summary: row.summary,
    body: row.body,
    readTime: row.read_time,
    imageUrl: row.image_url,
    sliderImageUrl: row.slider_image_url,
    showOnHomepage: row.show_on_homepage,
    hideFromBlog: row.hide_from_blog,
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
