import crypto from 'node:crypto';
import { getAuthenticatedMember, getSqlClient, jsonResponse, parseBody } from './_member.mjs';
import { getEarnedBadgeNamesForUserIds } from './_badges.mjs';
import { assertHoneypotEmpty } from './_security.mjs';
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

export async function ensureForumSchema(sql) {
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
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE forum_threads
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by_user_id TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by_user_id TEXT`;

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

  for (const category of DEFAULT_CATEGORIES) {
    await sql`
      INSERT INTO forum_categories (id, slug, name, description, access_tier, sort_order)
      VALUES (${crypto.randomUUID()}, ${category.slug}, ${category.name}, ${category.description}, ${category.accessTier}, ${category.sortOrder})
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        access_tier = EXCLUDED.access_tier,
        sort_order = EXCLUDED.sort_order
    `;
  }
}

function isPremiumMember(member, user) {
  const hasPaidMembership = member?.membershipLevel === 'premium' || member?.membershipLevel === 'lifetime';
  return hasPaidMembership || user?.role === 'admin';
}

function assertPremiumAreaAccess(member, user) {
  if (!isPremiumMember(member, user)) {
    throw Object.assign(new Error('Premium membership is required for this forum area'), { statusCode: 403 });
  }
}

function assertAdmin(user) {
  if (user?.role !== 'admin') {
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

async function assertPostingCooldown(sql, userId) {
  const rows = await sql`
    SELECT latest_posted_at
    FROM (
      SELECT MAX(created_at) AS latest_posted_at
      FROM (
        SELECT created_at FROM forum_threads WHERE author_user_id = ${userId}
        UNION ALL
        SELECT created_at FROM forum_posts WHERE author_user_id = ${userId}
      ) activity
    ) t
    WHERE latest_posted_at > NOW() - INTERVAL '15 seconds'
  `;

  if (rows.length) {
    throw Object.assign(new Error('Please wait a few seconds before posting again'), { statusCode: 429 });
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
      isAdmin: row.author_role === 'admin',
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
      isAdmin: row.author_role === 'admin',
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

  const categories = await sql`
    SELECT id, slug, name, description, access_tier, sort_order, color_badge, icon_name
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
  await assertPostingCooldown(sql, member.id);

  const categories = await sql`SELECT id, access_tier FROM forum_categories WHERE slug = ${categorySlug} LIMIT 1`;
  if (!categories.length) throw Object.assign(new Error('Invalid categorySlug'), { statusCode: 400 });
  if (categories[0].access_tier === 'premium') {
    assertPremiumAreaAccess(member, user);
  }

  const threadId = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO forum_threads (
      id, category_id, author_user_id, title, body, reply_count, view_count, last_activity_at
    )
    VALUES (
      ${threadId}, ${categories[0].id}, ${member.id}, ${title}, ${content}, 0, 0, NOW()
    )
    RETURNING *
  `;
  await awardReputation(sql, member.id, { points: REPUTATION_POINTS.thread, threadCount: 1 });

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
  await assertPostingCooldown(sql, member.id);

  const threads = await sql`
    SELECT t.id, t.is_locked, c.access_tier
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
    await sql`UPDATE forum_threads SET deleted_at = NOW(), deleted_by_user_id = ${user.id}, updated_at = NOW() WHERE id = ${threadId} AND deleted_at IS NULL`;
  }

  return { ok: true };
}

async function moderateReply(sql, user, event) {
  assertAdmin(user);
  const body = parseBody(event);
  const replyId = String(body.replyId || '').trim();
  if (!replyId) throw Object.assign(new Error('replyId is required'), { statusCode: 400 });

  const rows = await sql`
    UPDATE forum_posts
    SET deleted_at = NOW(), deleted_by_user_id = ${user.id}
    WHERE id = ${replyId}
      AND deleted_at IS NULL
    RETURNING thread_id
  `;

  if (rows.length) {
    await sql`
      UPDATE forum_threads
      SET reply_count = GREATEST(reply_count - 1, 0),
          updated_at = NOW()
      WHERE id = ${rows[0].thread_id}
    `;
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

    throw Object.assign(new Error('Unsupported action. Use one of: create_thread, create_reply, report_thread, report_reply, lock_thread, unlock_thread, delete_thread, delete_reply'), { statusCode: 400 });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process forum request' }, error.headers || {});
  }
}
