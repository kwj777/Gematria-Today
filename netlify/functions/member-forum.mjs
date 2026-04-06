import crypto from 'node:crypto';
import { getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';

const DEFAULT_CATEGORIES = [
  { slug: 'interpretations', name: 'Interpretations', description: 'Share and discuss gematria interpretations.', sortOrder: 1 },
  { slug: 'questions', name: 'Questions', description: 'Ask for help with patterns, calculations, or meanings.', sortOrder: 2 },
  { slug: 'show-and-tell', name: 'Show & Tell', description: 'Post findings, workflows, and project updates.', sortOrder: 3 },
];

const REPORT_REASONS = new Set(['spam', 'harassment', 'off-topic', 'abuse', 'other']);

async function ensureForumSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS forum_categories (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

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
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

  for (const category of DEFAULT_CATEGORIES) {
    await sql`
      INSERT INTO forum_categories (id, slug, name, description, sort_order)
      VALUES (${crypto.randomUUID()}, ${category.slug}, ${category.name}, ${category.description}, ${category.sortOrder})
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order
    `;
  }
}

function assertForumAccess(member, user) {
  const isPremium = member?.membershipLevel === 'premium' || member?.membershipLevel === 'lifetime';
  const isAdmin = user?.role === 'admin';
  if (!isPremium && !isAdmin) {
    throw Object.assign(new Error('Premium membership is required for forum access'), { statusCode: 403 });
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

function mapThreadRow(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    authorUserId: row.author_user_id,
    authorUsername: row.author_username,
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

function mapReplyRow(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorUserId: row.author_user_id,
    authorUsername: row.author_username,
    body: row.body,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

async function listThreads(sql, event) {
  const url = parseUrl(event);
  const category = String(url.searchParams.get('category') || '').trim().toLowerCase();
  const sort = normalizeSort(url.searchParams.get('sort'));
  const limitRaw = Number.parseInt(String(url.searchParams.get('limit') || '25'), 10);
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 25;

  const categories = await sql`
    SELECT id, slug, name, description, sort_order
    FROM forum_categories
    ORDER BY sort_order ASC, name ASC
  `;

  const baseSelect = sql`
    SELECT t.*, u.username AS author_username, c.slug AS category_slug, c.name AS category_name,
      (t.reply_count * 2 + t.view_count) AS popularity_score
    FROM forum_threads t
    JOIN users u ON u.id = t.author_user_id
    JOIN forum_categories c ON c.id = t.category_id
    WHERE t.deleted_at IS NULL
  `;

  let threadRows;
  if (sort === 'popular') {
    threadRows = category
      ? await sql`${baseSelect} AND c.slug = ${category} ORDER BY popularity_score DESC, t.last_activity_at DESC LIMIT ${limit}`
      : await sql`${baseSelect} ORDER BY popularity_score DESC, t.last_activity_at DESC LIMIT ${limit}`;
  } else {
    threadRows = category
      ? await sql`${baseSelect} AND c.slug = ${category} ORDER BY t.last_activity_at DESC, t.created_at DESC LIMIT ${limit}`
      : await sql`${baseSelect} ORDER BY t.last_activity_at DESC, t.created_at DESC LIMIT ${limit}`;
  }

  return {
    categories: categories.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      sortOrder: Number(row.sort_order || 0),
    })),
    sort,
    category: category || null,
    threads: threadRows.map(mapThreadRow),
  };
}

async function getThread(sql, event) {
  const url = parseUrl(event);
  const threadId = String(url.searchParams.get('threadId') || '').trim();
  if (!threadId) {
    throw Object.assign(new Error('Missing required query parameter: threadId'), { statusCode: 400 });
  }

  const threadRows = await sql`
    SELECT t.*, u.username AS author_username, c.slug AS category_slug, c.name AS category_name,
      (t.reply_count * 2 + t.view_count) AS popularity_score
    FROM forum_threads t
    JOIN users u ON u.id = t.author_user_id
    JOIN forum_categories c ON c.id = t.category_id
    WHERE t.id = ${threadId}
      AND t.deleted_at IS NULL
    LIMIT 1
  `;

  if (!threadRows.length) {
    throw Object.assign(new Error('Thread not found'), { statusCode: 404 });
  }

  await sql`UPDATE forum_threads SET view_count = view_count + 1, updated_at = NOW() WHERE id = ${threadId}`;

  const replyRows = await sql`
    SELECT p.*, u.username AS author_username
    FROM forum_posts p
    JOIN users u ON u.id = p.author_user_id
    WHERE p.thread_id = ${threadId}
      AND p.deleted_at IS NULL
    ORDER BY p.created_at ASC
    LIMIT 300
  `;

  const thread = mapThreadRow(threadRows[0]);
  thread.viewCount = thread.viewCount + 1;

  return {
    thread,
    replies: replyRows.map(mapReplyRow),
  };
}

async function createThread(sql, member, event) {
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

  const categories = await sql`SELECT id FROM forum_categories WHERE slug = ${categorySlug} LIMIT 1`;
  if (!categories.length) throw Object.assign(new Error('Invalid categorySlug'), { statusCode: 400 });

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

  return { thread: mapThreadRow({ ...rows[0], category_slug: categorySlug, category_name: null, author_username: member.username, popularity_score: 0 }) };
}

async function createReply(sql, member, event) {
  const body = parseBody(event);
  const threadId = String(body.threadId || '').trim();
  const content = String(body.body || '').trim();

  if (!threadId || !content) throw Object.assign(new Error('threadId and body are required'), { statusCode: 400 });
  if (content.length > 5000) throw Object.assign(new Error('body must be 5000 characters or fewer'), { statusCode: 400 });

  assertNotSpam(content, 'body');
  await assertPostingCooldown(sql, member.id);

  const threads = await sql`SELECT id, is_locked FROM forum_threads WHERE id = ${threadId} AND deleted_at IS NULL LIMIT 1`;
  if (!threads.length) throw Object.assign(new Error('Thread not found'), { statusCode: 404 });
  if (threads[0].is_locked) throw Object.assign(new Error('This thread is locked by moderators'), { statusCode: 403 });

  const replyId = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO forum_posts (id, thread_id, author_user_id, body)
    VALUES (${replyId}, ${threadId}, ${member.id}, ${content})
    RETURNING *
  `;

  await sql`
    UPDATE forum_threads
    SET reply_count = reply_count + 1,
        last_activity_at = NOW(),
        updated_at = NOW()
    WHERE id = ${threadId}
  `;

  return { reply: mapReplyRow({ ...rows[0], author_username: member.username }) };
}

async function reportContent(sql, member, event) {
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
    const threadRows = await sql`SELECT id FROM forum_threads WHERE id = ${threadId} AND deleted_at IS NULL LIMIT 1`;
    if (!threadRows.length) throw Object.assign(new Error('Thread not found'), { statusCode: 404 });
  }

  if (postId) {
    const postRows = await sql`SELECT id FROM forum_posts WHERE id = ${postId} AND deleted_at IS NULL LIMIT 1`;
    if (!postRows.length) throw Object.assign(new Error('Reply not found'), { statusCode: 404 });
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
    const { sql, user, member } = await getAuthenticatedMember(event, { requireAuth: true });
    if (!member || !user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });

    assertForumAccess(member, user);
    await ensureForumSchema(sql);

    if (event.httpMethod === 'GET') {
      const action = String(parseUrl(event).searchParams.get('action') || 'threads').trim().toLowerCase();
      if (action === 'threads') return jsonResponse(200, await listThreads(sql, event));
      if (action === 'thread') return jsonResponse(200, await getThread(sql, event));
      if (action === 'reports') return jsonResponse(200, await listReports(sql, user));
      throw Object.assign(new Error('Unsupported action. Use one of: threads, thread, reports'), { statusCode: 400 });
    }

    const action = String(parseBody(event).action || '').trim().toLowerCase();
    if (action === 'create_thread') return jsonResponse(201, await createThread(sql, member, event));
    if (action === 'create_reply') return jsonResponse(201, await createReply(sql, member, event));
    if (action === 'report_thread' || action === 'report_reply') return jsonResponse(201, await reportContent(sql, member, event));
    if (action === 'lock_thread') return jsonResponse(200, await moderateThread(sql, user, event, 'lock'));
    if (action === 'unlock_thread') return jsonResponse(200, await moderateThread(sql, user, event, 'unlock'));
    if (action === 'delete_thread') return jsonResponse(200, await moderateThread(sql, user, event, 'delete'));
    if (action === 'delete_reply') return jsonResponse(200, await moderateReply(sql, user, event));

    throw Object.assign(new Error('Unsupported action. Use one of: create_thread, create_reply, report_thread, report_reply, lock_thread, unlock_thread, delete_thread, delete_reply'), { statusCode: 400 });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process forum request' }, error.headers || {});
  }
}
