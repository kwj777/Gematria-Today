import crypto from 'node:crypto';
import { getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';

const DEFAULT_CATEGORIES = [
  { slug: 'interpretations', name: 'Interpretations', description: 'Share and discuss gematria interpretations.', sortOrder: 1 },
  { slug: 'questions', name: 'Questions', description: 'Ask for help with patterns, calculations, or meanings.', sortOrder: 2 },
  { slug: 'show-and-tell', name: 'Show & Tell', description: 'Post findings, workflows, and project updates.', sortOrder: 3 },
];

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
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS forum_posts (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS forum_threads_category_last_activity_idx
    ON forum_threads (category_id, last_activity_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS forum_threads_popular_idx
    ON forum_threads ((reply_count * 2 + view_count) DESC, last_activity_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS forum_posts_thread_created_idx
    ON forum_posts (thread_id, created_at ASC)`;

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

function assertPremiumAccess(member) {
  const isPremium = member?.membershipLevel === 'premium' || member?.membershipLevel === 'lifetime';
  if (!isPremium) {
    throw Object.assign(new Error('Premium membership is required for forum access'), { statusCode: 403 });
  }
}

function normalizeSort(value) {
  const normalized = String(value || 'newest').trim().toLowerCase();
  return normalized === 'popular' ? 'popular' : 'newest';
}

function parseUrl(event) {
  return new URL(event.rawUrl || `https://example.com${event.path || ''}`);
}

function mapThreadRow(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    authorUserId: row.author_user_id,
    authorUsername: row.author_username,
    title: row.title,
    body: row.body,
    replyCount: Number(row.reply_count || 0),
    viewCount: Number(row.view_count || 0),
    popularityScore: Number(row.popularity_score || 0),
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

  const threadRows = sort === 'popular'
    ? await sql`
      SELECT t.*, u.username AS author_username, (t.reply_count * 2 + t.view_count) AS popularity_score
      FROM forum_threads t
      JOIN users u ON u.id = t.author_user_id
      ${category ? sql`JOIN forum_categories c ON c.id = t.category_id` : sql``}
      ${category ? sql`WHERE c.slug = ${category}` : sql``}
      ORDER BY popularity_score DESC, t.last_activity_at DESC
      LIMIT ${limit}
    `
    : await sql`
      SELECT t.*, u.username AS author_username, (t.reply_count * 2 + t.view_count) AS popularity_score
      FROM forum_threads t
      JOIN users u ON u.id = t.author_user_id
      ${category ? sql`JOIN forum_categories c ON c.id = t.category_id` : sql``}
      ${category ? sql`WHERE c.slug = ${category}` : sql``}
      ORDER BY t.last_activity_at DESC, t.created_at DESC
      LIMIT ${limit}
    `;

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
    ORDER BY p.created_at ASC
    LIMIT 300
  `;

  const thread = mapThreadRow(threadRows[0]);
  thread.categorySlug = threadRows[0].category_slug;
  thread.categoryName = threadRows[0].category_name;
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

  if (title.length > 160) {
    throw Object.assign(new Error('title must be 160 characters or fewer'), { statusCode: 400 });
  }

  if (content.length > 5000) {
    throw Object.assign(new Error('body must be 5000 characters or fewer'), { statusCode: 400 });
  }

  const categories = await sql`SELECT id FROM forum_categories WHERE slug = ${categorySlug} LIMIT 1`;
  if (!categories.length) {
    throw Object.assign(new Error('Invalid categorySlug'), { statusCode: 400 });
  }

  const threadId = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO forum_threads (
      id,
      category_id,
      author_user_id,
      title,
      body,
      reply_count,
      view_count,
      last_activity_at
    )
    VALUES (
      ${threadId},
      ${categories[0].id},
      ${member.id},
      ${title},
      ${content},
      0,
      0,
      NOW()
    )
    RETURNING *
  `;

  return { thread: mapThreadRow({ ...rows[0], author_username: member.username, popularity_score: 0 }) };
}

async function createReply(sql, member, event) {
  const body = parseBody(event);
  const threadId = String(body.threadId || '').trim();
  const content = String(body.body || '').trim();

  if (!threadId || !content) {
    throw Object.assign(new Error('threadId and body are required'), { statusCode: 400 });
  }

  if (content.length > 5000) {
    throw Object.assign(new Error('body must be 5000 characters or fewer'), { statusCode: 400 });
  }

  const threads = await sql`SELECT id FROM forum_threads WHERE id = ${threadId} LIMIT 1`;
  if (!threads.length) {
    throw Object.assign(new Error('Thread not found'), { statusCode: 404 });
  }

  const replyId = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO forum_posts (
      id,
      thread_id,
      author_user_id,
      body
    )
    VALUES (
      ${replyId},
      ${threadId},
      ${member.id},
      ${content}
    )
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

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    if (!member) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }

    assertPremiumAccess(member);
    await ensureForumSchema(sql);

    if (event.httpMethod === 'GET') {
      const action = String(parseUrl(event).searchParams.get('action') || 'threads').trim().toLowerCase();
      if (action === 'threads') {
        return jsonResponse(200, await listThreads(sql, event));
      }
      if (action === 'thread') {
        return jsonResponse(200, await getThread(sql, event));
      }
      throw Object.assign(new Error('Unsupported action. Use one of: threads, thread'), { statusCode: 400 });
    }

    const action = String(parseBody(event).action || '').trim().toLowerCase();
    if (action === 'create_thread') {
      return jsonResponse(201, await createThread(sql, member, event));
    }
    if (action === 'create_reply') {
      return jsonResponse(201, await createReply(sql, member, event));
    }

    throw Object.assign(new Error('Unsupported action. Use one of: create_thread, create_reply'), { statusCode: 400 });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process forum request' }, error.headers || {});
  }
}
