import crypto from 'node:crypto';
import { getAuthenticatedMember, getSqlClient, jsonResponse, parseBody } from './_member.mjs';
import { getEarnedBadgeNamesForUserIds } from './_badges.mjs';
import { applyRateLimit, assertHoneypotEmpty } from './_security.mjs';
import { assertSiteModuleEnabled } from './_site-modules.mjs';

const DEFAULT_CATEGORIES = [
  { slug: 'member-lounge', name: 'Member Lounge', description: 'General discussion area for all signed-in members.', sortOrder: 1, accessTier: 'free' },
  { slug: 'member-questions', name: 'Member Questions', description: 'Ask for help with patterns, calculations, or meanings.', sortOrder: 2, accessTier: 'free' },
  { slug: 'interpretations', name: 'Interpretations', description: 'Share and discuss deeper gematria interpretations.', sortOrder: 101, accessTier: 'premium' },
  { slug: 'premium-questions', name: 'Premium Questions', description: 'Premium-only Q&A with focused discussion.', sortOrder: 102, accessTier: 'premium' },
  { slug: 'show-and-tell', name: 'Show & Tell', description: 'Post findings, workflows, and project updates.', sortOrder: 103, accessTier: 'premium' },
];

const REPORT_REASONS = new Set(['spam', 'harassment', 'off-topic', 'abuse', 'other']);
const REPUTATION_POINTS = {
  thread: 10,
  reply: 4,
};
const MODERATOR_ROLES = new Set(['admin', 'super_admin']);
const POSTING_COOLDOWN_MS = 15_000;
const REPORT_LIMIT_PER_HOUR = 20;

let forumSchemaReadyPromise = null;

// The schema (about 45 DDL statements, ALTER TABLEs among them) and the
// one-time category seed run once per function instance, not on every forum
// and admin-forum request. A failed run is retried by the next request.
export function ensureForumSchema(sql) {
  if (!forumSchemaReadyPromise) {
    forumSchemaReadyPromise = createForumSchema(sql).catch((error) => {
      forumSchemaReadyPromise = null;
      throw error;
    });
  }
  return forumSchemaReadyPromise;
}

async function createForumSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS forum_categories (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    access_tier TEXT NOT NULL DEFAULT 'free',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    post_mode TEXT NOT NULL DEFAULT 'members',
    require_approval BOOLEAN NOT NULL DEFAULT FALSE,
    color_badge TEXT,
    icon_name TEXT,
    guidelines TEXT,
    default_sort_mode TEXT NOT NULL DEFAULT 'newest',
    thread_template_prompt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE forum_categories
    ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'free'`;

  await sql`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'forum_categories_access_tier_check'
    ) THEN
      ALTER TABLE forum_categories
        ADD CONSTRAINT forum_categories_access_tier_check
        CHECK (access_tier IN ('free', 'premium'));
    END IF;
  END
  $$`;

  await sql`CREATE TABLE IF NOT EXISTS forum_threads (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES forum_categories(id) ON DELETE RESTRICT,
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    reply_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    locked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    pending_approval BOOLEAN NOT NULL DEFAULT FALSE,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE forum_threads
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by_user_id TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by_user_id TEXT,
    ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_locked_by_user_id_fkey'
    ) THEN
      ALTER TABLE forum_threads
        ADD CONSTRAINT forum_threads_locked_by_user_id_fkey
        FOREIGN KEY (locked_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL;
    END IF;
  END
  $$`;

  await sql`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_deleted_by_user_id_fkey'
    ) THEN
      ALTER TABLE forum_threads
        ADD CONSTRAINT forum_threads_deleted_by_user_id_fkey
        FOREIGN KEY (deleted_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL;
    END IF;
  END
  $$`;

  await sql`CREATE TABLE IF NOT EXISTS forum_posts (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE forum_posts
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by_user_id TEXT`;

  await sql`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'forum_posts_deleted_by_user_id_fkey'
    ) THEN
      ALTER TABLE forum_posts
        ADD CONSTRAINT forum_posts_deleted_by_user_id_fkey
        FOREIGN KEY (deleted_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL;
    END IF;
  END
  $$`;

  await sql`CREATE TABLE IF NOT EXISTS forum_reports (
    id TEXT PRIMARY KEY,
    thread_id TEXT REFERENCES forum_threads(id) ON DELETE CASCADE,
    post_id TEXT REFERENCES forum_posts(id) ON DELETE CASCADE,
    reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    internal_note TEXT,
    moderator_note TEXT,
    canned_response TEXT,
    action_taken TEXT,
    assigned_moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS forum_admin_audit (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS post_mode TEXT NOT NULL DEFAULT 'members'`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS color_badge TEXT`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS icon_name TEXT`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS guidelines TEXT`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS default_sort_mode TEXT NOT NULL DEFAULT 'newest'`;
  await sql`ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS thread_template_prompt TEXT`;
  await sql`ALTER TABLE forum_reports ADD COLUMN IF NOT EXISTS internal_note TEXT`;
  await sql`ALTER TABLE forum_reports ADD COLUMN IF NOT EXISTS moderator_note TEXT`;
  await sql`ALTER TABLE forum_reports ADD COLUMN IF NOT EXISTS canned_response TEXT`;
  await sql`ALTER TABLE forum_reports ADD COLUMN IF NOT EXISTS action_taken TEXT`;
  await sql`ALTER TABLE forum_reports ADD COLUMN IF NOT EXISTS assigned_moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE forum_reports ADD COLUMN IF NOT EXISTS resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS forum_reports_assigned_created_idx
    ON forum_reports (assigned_moderator_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS forum_admin_audit_created_idx
    ON forum_admin_audit (created_at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS forum_member_reputation (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    thread_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS forum_threads_category_last_activity_idx
    ON forum_threads (category_id, last_activity_at DESC)
    WHERE deleted_at IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS forum_threads_popular_idx
    ON forum_threads ((reply_count * 2 + view_count) DESC, last_activity_at DESC)
    WHERE deleted_at IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS forum_posts_thread_created_idx
    ON forum_posts (thread_id, created_at ASC)`;
  await sql`CREATE INDEX IF NOT EXISTS forum_reports_status_created_idx
    ON forum_reports (status, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS forum_threads_search_idx
    ON forum_threads USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(body, '')))
    WHERE deleted_at IS NULL`;

  await seedDefaultCategoriesOnce(sql);
}

// DEFAULT_CATEGORIES is starter content: once a default category exists the
// admin owns it. The seed used to upsert all five on every forum request, so
// an admin's rename, reorder or access-tier change (premium to free, or back)
// was silently reverted on the next page load. Each default is now inserted at
// most once, and a marker row in admin_settings records that, so a later run
// never touches an edited category or brings back one the admin deleted.
const SEEDED_CATEGORY_MARKER_PREFIX = 'seeded_forum_category:';

async function seedDefaultCategoriesOnce(sql) {
  const markerKeys = DEFAULT_CATEGORIES.map((category) => `${SEEDED_CATEGORY_MARKER_PREFIX}${category.slug}`);
  const markerRows = await sql`
    SELECT setting_key
    FROM admin_settings
    WHERE setting_key = ANY(${markerKeys})
  `;
  const appliedMarkerKeys = new Set(markerRows.map((row) => row.setting_key));

  for (const category of DEFAULT_CATEGORIES) {
    const markerKey = `${SEEDED_CATEGORY_MARKER_PREFIX}${category.slug}`;
    if (appliedMarkerKeys.has(markerKey)) {
      continue;
    }

    const insertedRows = await sql`
      INSERT INTO forum_categories (id, slug, name, description, access_tier, sort_order)
      VALUES (${crypto.randomUUID()}, ${category.slug}, ${category.name}, ${category.description}, ${category.accessTier}, ${category.sortOrder})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    await sql`
      INSERT INTO admin_settings (setting_key, setting_value, updated_at)
      VALUES (${markerKey}, ${insertedRows.length ? 'inserted' : 'skipped_existing'}, NOW())
      ON CONFLICT (setting_key) DO NOTHING
    `;
  }
}

// Staff accounts are role 'admin' or 'super_admin' (the site owner), and
// is_admin marks both; getAuthenticatedUser accepts the same set for admin
// pages. Checking role === 'admin' alone locked the owner out of moderation.
function isForumModerator(user) {
  return MODERATOR_ROLES.has(user?.role) || Boolean(user?.isAdmin);
}

function isPremiumMember(member, user) {
  const hasPaidMembership = member?.membershipLevel === 'premium' || member?.membershipLevel === 'lifetime';
  return hasPaidMembership || isForumModerator(user);
}

function assertPremiumAreaAccess(member, user) {
  if (!isPremiumMember(member, user)) {
    throw Object.assign(new Error('Premium membership is required for this forum area'), { statusCode: 403 });
  }
}

function assertAdmin(user) {
  if (!isForumModerator(user)) {
    throw Object.assign(new Error('Admin privileges are required for moderation actions'), { statusCode: 403 });
  }
}

function normalizeSort(value) {
  const normalized = String(value || 'newest').trim().toLowerCase();
  return normalized === 'popular' ? 'popular' : 'newest';
}

function normalizeArea(value) {
  const normalized = String(value || 'free').trim().toLowerCase();
  return normalized === 'premium' ? 'premium' : 'free';
}

function parseUrl(event) {
  return new URL(event.rawUrl || `https://example.com${event.path || ''}`);
}

function assertNotSpam(text, fieldName) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    throw Object.assign(new Error(`${fieldName} is required`), { statusCode: 400 });
  }

  const urlMatches = normalized.match(/https?:\/\//gi) || [];
  if (urlMatches.length > 3) {
    throw Object.assign(new Error(`${fieldName} appears to contain spam links`), { statusCode: 400 });
  }

  if (/(.)\1{12,}/.test(normalized)) {
    throw Object.assign(new Error(`${fieldName} appears to contain spam patterns`), { statusCode: 400 });
  }

  const spamSignals = ['buy now', 'limited offer', 'click here', 'free crypto', 'telegram'];
  const lower = normalized.toLowerCase();
  if (spamSignals.some((signal) => lower.includes(signal))) {
    throw Object.assign(new Error(`${fieldName} appears to contain spam patterns`), { statusCode: 400 });
  }
}

// The cooldown used to SELECT the member's latest post and insert separately,
// so a burst of concurrent requests all passed the check before any insert
// landed. applyRateLimit claims the slot with one upsert on a row keyed by the
// member, which Postgres serializes, so only one post per window gets through.
// It runs after every other check, so a rejected post does not start a wait.
async function assertPostingCooldown(sql, event, userId) {
  await applyRateLimit(sql, event, {
    scope: 'member-forum-post',
    key: userId,
    limit: 1,
    windowMs: POSTING_COOLDOWN_MS,
    message: 'Please wait a few seconds before posting again',
  });
}

// Archived categories are read-only. A locked category takes no new threads,
// and a moderators-only category takes them from staff alone.
function assertCategoryAcceptsThreads(category, user) {
  if (category.is_archived) {
    throw Object.assign(new Error('This category is archived and no longer accepts new threads'), { statusCode: 403 });
  }
  if (category.is_locked) {
    throw Object.assign(new Error('This category is locked by moderators'), { statusCode: 403 });
  }
  if (category.post_mode === 'moderators' && !isForumModerator(user)) {
    throw Object.assign(new Error('Only moderators can start threads in this category'), { statusCode: 403 });
  }
}

function mapThreadRow(row, earnedBadgeMap) {
  const authorReputation = Number(row.author_reputation || 0);
  return {
    id: row.id,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    categoryAccessTier: row.category_access_tier,
    categoryColorBadge: row.category_color_badge,
    categoryIconName: row.category_icon_name,
    authorUserId: row.author_user_id,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name,
    authorReputation,
    authorThreadCount: Number(row.author_thread_count || 0),
    authorReplyCount: Number(row.author_reply_count || 0),
    authorMembershipLevel: row.author_membership_level || 'free',
    authorJoinedAt: row.author_joined_at,
    authorBadges: deriveBadges(authorReputation, {
      threadCount: Number(row.author_thread_count || 0),
      replyCount: Number(row.author_reply_count || 0),
      isAdmin: isForumModerator({ role: row.author_role }),
      isPremium: row.author_membership_level === 'premium' || row.author_membership_level === 'lifetime',
      earnedBadgeNames: earnedBadgeMap?.get(row.author_user_id) || [],
    }),
    title: row.title,
    body: row.body,
    replyCount: Number(row.reply_count || 0),
    viewCount: Number(row.view_count || 0),
    popularityScore: Number(row.popularity_score || 0),
    isLocked: Boolean(row.is_locked),
    lockedAt: row.locked_at,
    pendingApproval: Boolean(row.pending_approval),
    deletedAt: row.deleted_at,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReplyRow(row, earnedBadgeMap) {
  const authorReputation = Number(row.author_reputation || 0);
  return {
    id: row.id,
    threadId: row.thread_id,
    authorUserId: row.author_user_id,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name,
    authorReputation,
    authorThreadCount: Number(row.author_thread_count || 0),
    authorReplyCount: Number(row.author_reply_count || 0),
    authorMembershipLevel: row.author_membership_level || 'free',
    authorJoinedAt: row.author_joined_at,
    authorBadges: deriveBadges(authorReputation, {
      threadCount: Number(row.author_thread_count || 0),
      replyCount: Number(row.author_reply_count || 0),
      isAdmin: isForumModerator({ role: row.author_role }),
      isPremium: row.author_membership_level === 'premium' || row.author_membership_level === 'lifetime',
      earnedBadgeNames: earnedBadgeMap?.get(row.author_user_id) || [],
    }),
    body: row.body,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

function deriveBadges(points, { threadCount, replyCount, isAdmin, isPremium, earnedBadgeNames = [] }) {
  const badges = [];
  if (isAdmin) badges.push('Moderator');
  if (isPremium) badges.push('Premium');
  if (threadCount >= 1 && replyCount >= 1) badges.push('Contributor');
  // Reputation tier: only show the highest one the member has reached.
  if (points >= 200) badges.push('Sage');
  else if (points >= 50) badges.push('Trusted');
  for (const name of earnedBadgeNames) {
    if (!badges.includes(name)) badges.push(name);
  }
  return badges;
}

async function awardReputation(sql, userId, updates) {
  const points = Number(updates.points || 0);
  const threadDelta = Number(updates.threadCount || 0);
  const replyDelta = Number(updates.replyCount || 0);
  await sql`
    INSERT INTO forum_member_reputation (user_id, points, thread_count, reply_count, updated_at)
    VALUES (${userId}, ${points}, ${threadDelta}, ${replyDelta}, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      points = forum_member_reputation.points + ${points},
      thread_count = forum_member_reputation.thread_count + ${threadDelta},
      reply_count = forum_member_reputation.reply_count + ${replyDelta},
      updated_at = NOW()
  `;
}

// A moderator removing a post takes back what posting it earned, so spam that
// is cleaned up does not leave its author with the reputation or badges.
async function revokeReputation(sql, userId, updates) {
  const points = Number(updates.points || 0);
  const threadDelta = Number(updates.threadCount || 0);
  const replyDelta = Number(updates.replyCount || 0);
  await sql`
    UPDATE forum_member_reputation
    SET points = GREATEST(points - ${points}, 0),
        thread_count = GREATEST(thread_count - ${threadDelta}, 0),
        reply_count = GREATEST(reply_count - ${replyDelta}, 0),
        updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

async function listThreads(sql, member, user, event) {
  const url = parseUrl(event);
  const area = normalizeArea(url.searchParams.get('area'));
  if (area === 'premium') {
    assertPremiumAreaAccess(member, user);
  }
  const category = String(url.searchParams.get('category') || '').trim().toLowerCase();
  const sort = normalizeSort(url.searchParams.get('sort'));
  const searchQuery = String(url.searchParams.get('q') || '').trim();
  const hasCategoryFilter = category.length > 0;
  const hasSearchFilter = searchQuery.length > 0;
  const searchPattern = `%${searchQuery.toLowerCase()}%`;
  const limitRaw = Number.parseInt(String(url.searchParams.get('limit') || '25'), 10);
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 25;
  // A thread waiting for approval is shown only to its author and to staff.
  const canModerate = isForumModerator(user);

  const categories = await sql`
    SELECT id, slug, name, description, access_tier, sort_order, color_badge, icon_name, is_archived, is_locked, post_mode, require_approval
    FROM forum_categories
    WHERE access_tier = ${area}
    ORDER BY sort_order ASC, name ASC
  `;

  let threadRows;
  if (sort === 'popular') {
    threadRows = await sql`
      SELECT t.*, u.username AS author_username, u.display_name AS author_display_name, u.created_at AS author_joined_at, c.slug AS category_slug, c.name AS category_name,
        (t.reply_count * 2 + t.view_count) AS popularity_score,
        c.access_tier AS category_access_tier,
        c.color_badge AS category_color_badge,
        c.icon_name AS category_icon_name,
        u.role AS author_role,
        u.membership_level AS author_membership_level,
        COALESCE(r.points, 0) AS author_reputation,
        COALESCE(r.thread_count, 0) AS author_thread_count,
        COALESCE(r.reply_count, 0) AS author_reply_count
      FROM forum_threads t
      JOIN users u ON u.id = t.author_user_id
      JOIN forum_categories c ON c.id = t.category_id
      LEFT JOIN forum_member_reputation r ON r.user_id = u.id
      WHERE t.deleted_at IS NULL
        AND (t.pending_approval = FALSE OR t.author_user_id = ${member.id} OR ${canModerate} = TRUE)
        AND c.access_tier = ${area}
        AND (${hasCategoryFilter} = FALSE OR c.slug = ${category})
        AND (
          ${hasSearchFilter} = FALSE
          OR to_tsvector('simple', COALESCE(t.title, '') || ' ' || COALESCE(t.body, '')) @@ plainto_tsquery('simple', ${searchQuery})
          OR LOWER(t.title) LIKE ${searchPattern}
          OR LOWER(t.body) LIKE ${searchPattern}
        )
      ORDER BY popularity_score DESC, t.last_activity_at DESC
      LIMIT ${limit}
    `;
  } else {
    threadRows = await sql`
      SELECT t.*, u.username AS author_username, u.display_name AS author_display_name, u.created_at AS author_joined_at, c.slug AS category_slug, c.name AS category_name,
        (t.reply_count * 2 + t.view_count) AS popularity_score,
        c.access_tier AS category_access_tier,
        c.color_badge AS category_color_badge,
        c.icon_name AS category_icon_name,
        u.role AS author_role,
        u.membership_level AS author_membership_level,
        COALESCE(r.points, 0) AS author_reputation,
        COALESCE(r.thread_count, 0) AS author_thread_count,
        COALESCE(r.reply_count, 0) AS author_reply_count
      FROM forum_threads t
      JOIN users u ON u.id = t.author_user_id
      JOIN forum_categories c ON c.id = t.category_id
      LEFT JOIN forum_member_reputation r ON r.user_id = u.id
      WHERE t.deleted_at IS NULL
        AND (t.pending_approval = FALSE OR t.author_user_id = ${member.id} OR ${canModerate} = TRUE)
        AND c.access_tier = ${area}
        AND (${hasCategoryFilter} = FALSE OR c.slug = ${category})
        AND (
          ${hasSearchFilter} = FALSE
          OR to_tsvector('simple', COALESCE(t.title, '') || ' ' || COALESCE(t.body, '')) @@ plainto_tsquery('simple', ${searchQuery})
          OR LOWER(t.title) LIKE ${searchPattern}
          OR LOWER(t.body) LIKE ${searchPattern}
        )
      ORDER BY t.last_activity_at DESC, t.created_at DESC
      LIMIT ${limit}
    `;
  }

  const earnedBadgeMap = await getEarnedBadgeNamesForUserIds(sql, threadRows.map((row) => row.author_user_id));

  return {
    categories: categories.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      accessTier: row.access_tier,
      sortOrder: Number(row.sort_order || 0),
      colorBadge: row.color_badge,
      iconName: row.icon_name,
      isArchived: Boolean(row.is_archived),
      isLocked: Boolean(row.is_locked),
      postMode: row.post_mode || 'members',
      requireApproval: Boolean(row.require_approval),
    })),
    area,
    sort,
    category: category || null,
    searchQuery: searchQuery || null,
    threads: threadRows.map((row) => mapThreadRow(row, earnedBadgeMap)),
  };
}

async function getThread(sql, member, user, event) {
  const url = parseUrl(event);
  const threadId = String(url.searchParams.get('threadId') || '').trim();
  if (!threadId) {
    throw Object.assign(new Error('Missing required query parameter: threadId'), { statusCode: 400 });
  }

  const threadRows = await sql`
    SELECT t.*, u.username AS author_username, u.display_name AS author_display_name, u.created_at AS author_joined_at, c.slug AS category_slug, c.name AS category_name, c.access_tier AS category_access_tier,
      c.color_badge AS category_color_badge,
      c.icon_name AS category_icon_name,
      u.role AS author_role,
      u.membership_level AS author_membership_level,
      COALESCE(r.points, 0) AS author_reputation,
      COALESCE(r.thread_count, 0) AS author_thread_count,
      COALESCE(r.reply_count, 0) AS author_reply_count,
      (t.reply_count * 2 + t.view_count) AS popularity_score
    FROM forum_threads t
    JOIN users u ON u.id = t.author_user_id
    JOIN forum_categories c ON c.id = t.category_id
    LEFT JOIN forum_member_reputation r ON r.user_id = u.id
    WHERE t.id = ${threadId}
      AND t.deleted_at IS NULL
      AND (t.pending_approval = FALSE OR t.author_user_id = ${member.id} OR ${isForumModerator(user)} = TRUE)
    LIMIT 1
  `;

  if (!threadRows.length) {
    throw Object.assign(new Error('Thread not found'), { statusCode: 404 });
  }
  if (threadRows[0].category_access_tier === 'premium') {
    assertPremiumAreaAccess(member, user);
  }

  await sql`UPDATE forum_threads SET view_count = view_count + 1, updated_at = NOW() WHERE id = ${threadId}`;

  const replyRows = await sql`
    SELECT p.*, u.username AS author_username, u.display_name AS author_display_name, u.created_at AS author_joined_at,
      u.role AS author_role,
      u.membership_level AS author_membership_level,
      COALESCE(r.points, 0) AS author_reputation,
      COALESCE(r.thread_count, 0) AS author_thread_count,
      COALESCE(r.reply_count, 0) AS author_reply_count
    FROM forum_posts p
    JOIN users u ON u.id = p.author_user_id
    LEFT JOIN forum_member_reputation r ON r.user_id = u.id
    WHERE p.thread_id = ${threadId}
      AND p.deleted_at IS NULL
    ORDER BY p.created_at ASC
    LIMIT 300
  `;

  const authorIdsForBadges = [threadRows[0].author_user_id, ...replyRows.map((row) => row.author_user_id)];
  const earnedBadgeMap = await getEarnedBadgeNamesForUserIds(sql, authorIdsForBadges);

  const thread = mapThreadRow(threadRows[0], earnedBadgeMap);
  thread.viewCount = thread.viewCount + 1;

  return {
    thread,
    replies: replyRows.map((row) => mapReplyRow(row, earnedBadgeMap)),
  };
}

async function createThread(sql, member, user, event) {
  const body = parseBody(event);
  const title = String(body.title || '').trim();
  const content = String(body.body || '').trim();
  const categorySlug = String(body.categorySlug || '').trim().toLowerCase();

  if (!title || !content || !categorySlug) {
    throw Object.assign(new Error('categorySlug, title, and body are required'), { statusCode: 400 });
  }
  if (title.length > 160) throw Object.assign(new Error('title must be 160 characters or fewer'), { statusCode: 400 });
  if (content.length > 5000) throw Object.assign(new Error('body must be 5000 characters or fewer'), { statusCode: 400 });

  assertNotSpam(title, 'title');
  assertNotSpam(content, 'body');

  const categories = await sql`
    SELECT id, access_tier, is_archived, is_locked, post_mode, require_approval
    FROM forum_categories
    WHERE slug = ${categorySlug}
    LIMIT 1
  `;
  if (!categories.length) throw Object.assign(new Error('Invalid categorySlug'), { statusCode: 400 });
  if (categories[0].access_tier === 'premium') {
    assertPremiumAreaAccess(member, user);
  }
  assertCategoryAcceptsThreads(categories[0], user);
  // In a category that requires approval a member's thread waits, hidden from
  // other members, until a moderator approves it; staff threads go straight up.
  const pendingApproval = Boolean(categories[0].require_approval) && !isForumModerator(user);

  await assertPostingCooldown(sql, event, member.id);

  const threadId = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO forum_threads (
      id, category_id, author_user_id, title, body, reply_count, view_count, pending_approval, last_activity_at
    )
    VALUES (
      ${threadId}, ${categories[0].id}, ${member.id}, ${title}, ${content}, 0, 0, ${pendingApproval}, NOW()
    )
    RETURNING *
  `;
  // A pending thread earns its reputation when a moderator approves it.
  if (!pendingApproval) {
    await awardReputation(sql, member.id, { points: REPUTATION_POINTS.thread, threadCount: 1 });
  }

  const earnedBadgeMap = await getEarnedBadgeNamesForUserIds(sql, [member.id]);
  return {
    thread: mapThreadRow({
      ...rows[0],
      category_slug: categorySlug,
      category_name: null,
      category_access_tier: categories[0].access_tier,
      author_username: member.username,
      popularity_score: 0,
    }, earnedBadgeMap),
  };
}

async function createReply(sql, member, user, event) {
  const body = parseBody(event);
  const threadId = String(body.threadId || '').trim();
  const content = String(body.body || '').trim();

  if (!threadId || !content) throw Object.assign(new Error('threadId and body are required'), { statusCode: 400 });
  if (content.length > 5000) throw Object.assign(new Error('body must be 5000 characters or fewer'), { statusCode: 400 });

  assertNotSpam(content, 'body');

  const threads = await sql`
    SELECT t.id, t.is_locked, t.pending_approval, c.access_tier, c.is_archived, c.is_locked AS category_is_locked
    FROM forum_threads t
    JOIN forum_categories c ON c.id = t.category_id
    WHERE t.id = ${threadId}
      AND t.deleted_at IS NULL
    LIMIT 1
  `;
  if (!threads.length) throw Object.assign(new Error('Thread not found'), { statusCode: 404 });
  if (threads[0].access_tier === 'premium') {
    assertPremiumAreaAccess(member, user);
  }
  if (threads[0].is_locked) throw Object.assign(new Error('This thread is locked by moderators'), { statusCode: 403 });
  // A locked or archived category is closed to replies as well as new threads,
  // the same way a locked thread is, so existing threads in it go quiet too.
  if (threads[0].is_archived) throw Object.assign(new Error('This category is archived and no longer accepts replies'), { statusCode: 403 });
  if (threads[0].category_is_locked) throw Object.assign(new Error('This category is locked by moderators'), { statusCode: 403 });
  if (threads[0].pending_approval && !isForumModerator(user)) {
    throw Object.assign(new Error('This thread is waiting for moderator approval'), { statusCode: 403 });
  }

  await assertPostingCooldown(sql, event, member.id);

  const replyId = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO forum_posts (id, thread_id, author_user_id, body)
    VALUES (${replyId}, ${threadId}, ${member.id}, ${content})
    RETURNING *
  `;
  await awardReputation(sql, member.id, { points: REPUTATION_POINTS.reply, replyCount: 1 });

  await sql`
    UPDATE forum_threads
    SET reply_count = reply_count + 1,
        last_activity_at = NOW(),
        updated_at = NOW()
    WHERE id = ${threadId}
  `;

  const earnedBadgeMap = await getEarnedBadgeNamesForUserIds(sql, [member.id]);
  return { reply: mapReplyRow({ ...rows[0], author_username: member.username }, earnedBadgeMap) };
}

async function reportContent(sql, member, user, event) {
  const body = parseBody(event);
  const reason = String(body.reason || 'other').trim().toLowerCase();
  const details = String(body.details || '').trim().slice(0, 800);
  const threadId = String(body.threadId || '').trim();
  const postId = String(body.postId || '').trim();

  if (!REPORT_REASONS.has(reason)) {
    throw Object.assign(new Error(`reason must be one of: ${Array.from(REPORT_REASONS).join(', ')}`), { statusCode: 400 });
  }
  if (!threadId && !postId) {
    throw Object.assign(new Error('threadId or postId is required to create a report'), { statusCode: 400 });
  }

  if (threadId) {
    const threadRows = await sql`
      SELECT t.id, c.access_tier
      FROM forum_threads t
      JOIN forum_categories c ON c.id = t.category_id
      WHERE t.id = ${threadId}
        AND t.deleted_at IS NULL
      LIMIT 1
    `;
    if (!threadRows.length) throw Object.assign(new Error('Thread not found'), { statusCode: 404 });
    if (threadRows[0].access_tier === 'premium') assertPremiumAreaAccess(member, user);
  }

  if (postId) {
    const postRows = await sql`
      SELECT p.id, c.access_tier
      FROM forum_posts p
      JOIN forum_threads t ON t.id = p.thread_id
      JOIN forum_categories c ON c.id = t.category_id
      WHERE p.id = ${postId}
        AND p.deleted_at IS NULL
      LIMIT 1
    `;
    if (!postRows.length) throw Object.assign(new Error('Reply not found'), { statusCode: 404 });
    if (postRows[0].access_tier === 'premium') assertPremiumAreaAccess(member, user);
  }

  // Reporting the same post again while the first report is still open adds
  // nothing for moderators, so it is acknowledged without a second row.
  const openReports = await sql`
    SELECT id
    FROM forum_reports
    WHERE reporter_user_id = ${member.id}
      AND thread_id IS NOT DISTINCT FROM ${threadId || null}::text
      AND post_id IS NOT DISTINCT FROM ${postId || null}::text
      AND status IN ('open', 'in_review')
    LIMIT 1
  `;
  if (openReports.length) {
    return { ok: true };
  }

  await applyRateLimit(sql, event, {
    scope: 'member-forum-report',
    key: member.id,
    limit: REPORT_LIMIT_PER_HOUR,
    windowMs: 60 * 60_000,
    message: 'You have sent a lot of reports recently. Please try again later.',
  });

  await sql`
    INSERT INTO forum_reports (id, thread_id, post_id, reporter_user_id, reason, details)
    VALUES (${crypto.randomUUID()}, ${threadId || null}, ${postId || null}, ${member.id}, ${reason}, ${details || null})
  `;

  return { ok: true };
}

async function moderateThread(sql, user, event, mode) {
  assertAdmin(user);
  const body = parseBody(event);
  const threadId = String(body.threadId || '').trim();
  if (!threadId) throw Object.assign(new Error('threadId is required'), { statusCode: 400 });

  if (mode === 'lock') {
    await sql`UPDATE forum_threads SET is_locked = TRUE, locked_at = NOW(), locked_by_user_id = ${user.id}, updated_at = NOW() WHERE id = ${threadId} AND deleted_at IS NULL`;
  } else if (mode === 'unlock') {
    await sql`UPDATE forum_threads SET is_locked = FALSE, locked_at = NULL, locked_by_user_id = NULL, updated_at = NOW() WHERE id = ${threadId} AND deleted_at IS NULL`;
  } else if (mode === 'delete') {
    const rows = await sql`
      UPDATE forum_threads
      SET deleted_at = NOW(), deleted_by_user_id = ${user.id}, updated_at = NOW()
      WHERE id = ${threadId}
        AND deleted_at IS NULL
      RETURNING author_user_id, pending_approval
    `;
    if (rows.length) {
      // A thread still waiting for approval never earned anything.
      if (!rows[0].pending_approval) {
        await revokeReputation(sql, rows[0].author_user_id, { points: REPUTATION_POINTS.thread, threadCount: 1 });
      }

      // Deleting the thread hides every reply in it, and once it is gone the
      // replies can no longer be deleted one by one, so what they earned is
      // taken back here too. Otherwise a member could post a burst of replies
      // in one thread (or have a second account do it) and keep the points and
      // badges after a moderator removed the thread. Replies a moderator had
      // already deleted were taken back then and are not counted again.
      const replyAuthors = await sql`
        SELECT author_user_id, COUNT(*)::INTEGER AS total
        FROM forum_posts
        WHERE thread_id = ${threadId}
          AND deleted_at IS NULL
        GROUP BY author_user_id
      `;
      for (const replyAuthor of replyAuthors) {
        const total = Number(replyAuthor.total || 0);
        await revokeReputation(sql, replyAuthor.author_user_id, { points: REPUTATION_POINTS.reply * total, replyCount: total });
      }
    }
  }

  return { ok: true };
}

async function approveThread(sql, user, event) {
  assertAdmin(user);
  const body = parseBody(event);
  const threadId = String(body.threadId || '').trim();
  if (!threadId) throw Object.assign(new Error('threadId is required'), { statusCode: 400 });

  const rows = await sql`
    UPDATE forum_threads
    SET pending_approval = FALSE,
        last_activity_at = NOW(),
        updated_at = NOW()
    WHERE id = ${threadId}
      AND pending_approval = TRUE
      AND deleted_at IS NULL
    RETURNING author_user_id
  `;
  if (rows.length) {
    await awardReputation(sql, rows[0].author_user_id, { points: REPUTATION_POINTS.thread, threadCount: 1 });
  }

  return { ok: true };
}

async function moderateReply(sql, user, event) {
  assertAdmin(user);
  const body = parseBody(event);
  const replyId = String(body.replyId || '').trim();
  if (!replyId) throw Object.assign(new Error('replyId is required'), { statusCode: 400 });

  // A reply in a deleted thread already had its reputation taken back with the
  // thread, so deleting it again (say from a page loaded before the thread was
  // removed) is a no-op rather than a second deduction.
  const rows = await sql`
    UPDATE forum_posts
    SET deleted_at = NOW(), deleted_by_user_id = ${user.id}
    WHERE id = ${replyId}
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM forum_threads t
        WHERE t.id = forum_posts.thread_id
          AND t.deleted_at IS NULL
      )
    RETURNING thread_id, author_user_id
  `;

  if (rows.length) {
    await sql`
      UPDATE forum_threads
      SET reply_count = GREATEST(reply_count - 1, 0),
          updated_at = NOW()
      WHERE id = ${rows[0].thread_id}
    `;
    await revokeReputation(sql, rows[0].author_user_id, { points: REPUTATION_POINTS.reply, replyCount: 1 });
  }

  return { ok: true };
}

async function listReports(sql, user) {
  assertAdmin(user);

  const rows = await sql`
    SELECT r.id, r.thread_id, r.post_id, r.reason, r.details, r.status, r.created_at, u.username AS reporter_username
    FROM forum_reports r
    JOIN users u ON u.id = r.reporter_user_id
    WHERE r.status = 'open'
    ORDER BY r.created_at DESC
    LIMIT 200
  `;

  const pendingRows = await sql`
    SELECT t.id, t.title, t.created_at, c.name AS category_name, u.username AS author_username
    FROM forum_threads t
    JOIN forum_categories c ON c.id = t.category_id
    JOIN users u ON u.id = t.author_user_id
    WHERE t.pending_approval = TRUE
      AND t.deleted_at IS NULL
    ORDER BY t.created_at ASC
    LIMIT 200
  `;

  return {
    reports: rows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      postId: row.post_id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      reporterUsername: row.reporter_username,
    })),
    pendingThreads: pendingRows.map((row) => ({
      id: row.id,
      title: row.title,
      categoryName: row.category_name,
      authorUsername: row.author_username,
      createdAt: row.created_at,
    })),
  };
}

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    await assertSiteModuleEnabled(getSqlClient(), 'forum');
    const { sql, user, member } = await getAuthenticatedMember(event, { requireAuth: true });
    if (!member || !user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });

    await ensureForumSchema(sql);

    if (event.httpMethod === 'GET') {
      const action = String(parseUrl(event).searchParams.get('action') || 'threads').trim().toLowerCase();
      if (action === 'threads') return jsonResponse(200, await listThreads(sql, member, user, event));
      if (action === 'thread') return jsonResponse(200, await getThread(sql, member, user, event));
      if (action === 'reports') return jsonResponse(200, await listReports(sql, user));
      throw Object.assign(new Error('Unsupported action. Use one of: threads, thread, reports'), { statusCode: 400 });
    }

    const body = parseBody(event);
    const action = String(body.action || '').trim().toLowerCase();
    if (action === 'create_thread' || action === 'create_reply' || action === 'report_thread' || action === 'report_reply') {
      await assertHoneypotEmpty(sql, event, body, {
        route: 'member-forum',
        auditMetadata: { action, memberId: member.id },
      });
    }
    if (action === 'create_thread') return jsonResponse(201, await createThread(sql, member, user, event));
    if (action === 'create_reply') return jsonResponse(201, await createReply(sql, member, user, event));
    if (action === 'report_thread' || action === 'report_reply') return jsonResponse(201, await reportContent(sql, member, user, event));
    if (action === 'lock_thread') return jsonResponse(200, await moderateThread(sql, user, event, 'lock'));
    if (action === 'unlock_thread') return jsonResponse(200, await moderateThread(sql, user, event, 'unlock'));
    if (action === 'delete_thread') return jsonResponse(200, await moderateThread(sql, user, event, 'delete'));
    if (action === 'delete_reply') return jsonResponse(200, await moderateReply(sql, user, event));
    if (action === 'approve_thread') return jsonResponse(200, await approveThread(sql, user, event));

    throw Object.assign(new Error('Unsupported action. Use one of: create_thread, create_reply, report_thread, report_reply, lock_thread, unlock_thread, delete_thread, delete_reply, approve_thread'), { statusCode: 400 });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process forum request' }, error.headers || {});
  }
}
