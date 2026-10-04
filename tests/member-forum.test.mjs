import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neonConfig } from '@neondatabase/serverless';

import { handler as memberForumHandler } from '../netlify/functions/member-forum.mjs';
import { handler as adminForumHandler } from '../netlify/functions/admin-forum.mjs';

// ---------- a small forum database behind Neon's HTTP boundary ----------

// The handlers build their own client from DATABASE_URL, so the fake sits at
// Neon's HTTP boundary. It applies the forum statements to in-memory rows and
// answers everything else (schema, audit, badges) with no rows, so the tests
// observe what the endpoints store rather than only the SQL they send.
function encodeValue(value) {
  if (value === null || value === undefined) return { oid: 25, text: null };
  if (typeof value === 'boolean') return { oid: 16, text: value ? 't' : 'f' };
  if (Number.isInteger(value)) return { oid: 23, text: String(value) };
  return { oid: 25, text: String(value) };
}

function neonResult(rows) {
  const names = rows.length ? Object.keys(rows[0]) : [];
  return {
    command: 'SELECT',
    rowCount: rows.length,
    fields: names.map((name) => ({ name, dataTypeID: encodeValue(rows[0][name]).oid })),
    rows: rows.map((row) => names.map((name) => encodeValue(row[name]).text)),
  };
}

const bool = (value) => value === true || value === 'true' || value === 't';
const parseArray = (value) => [...String(value || '').matchAll(/"([^"]*)"/g)].map((match) => match[1]);

const USERS = {
  member: { id: 'u-member', username: 'mel', role: 'member', is_admin: false, membership_level: 'free' },
  other: { id: 'u-other', username: 'sam', role: 'member', is_admin: false, membership_level: 'free' },
  owner: { id: 'KevAdmin', username: 'KevAdmin', role: 'super_admin', is_admin: true, membership_level: 'lifetime' },
};

function createForumDb({ categories = [], threads = [], posts = [], reputation = {}, beforeCategoryDelete = null } = {}) {
  return {
    users: new Map(Object.values(USERS).map((user) => [user.id, { ...user }])),
    categories: categories.map((category) => ({
      access_tier: 'free',
      sort_order: 0,
      is_archived: false,
      is_locked: false,
      post_mode: 'members',
      require_approval: false,
      ...category,
    })),
    threads: threads.map((thread) => ({
      is_locked: false,
      pending_approval: false,
      deleted_at: null,
      reply_count: 0,
      view_count: 0,
      created_at: new Date().toISOString(),
      ...thread,
    })),
    posts: posts.map((post) => ({ deleted_at: null, created_at: new Date().toISOString(), ...post })),
    reports: [],
    reputation: new Map(Object.entries(reputation).map(([userId, row]) => [userId, { points: 0, thread_count: 0, reply_count: 0, ...row }])),
    rateLimits: new Map(),
    settings: new Map(),
    beforeCategoryDelete,
    queries: [],
    currentUserId: null,
  };
}

function reputationOf(db, userId) {
  return db.reputation.get(userId) || { points: 0, thread_count: 0, reply_count: 0 };
}

function threadRow(db, thread) {
  const author = db.users.get(thread.author_user_id);
  const category = db.categories.find((row) => row.id === thread.category_id);
  const rep = reputationOf(db, thread.author_user_id);
  return {
    ...thread,
    author_username: author.username,
    author_display_name: author.username,
    author_joined_at: '2026-01-01T00:00:00.000Z',
    category_slug: category.slug,
    category_name: category.name,
    category_access_tier: category.access_tier,
    category_color_badge: null,
    category_icon_name: null,
    author_role: author.role,
    author_membership_level: author.membership_level,
    author_reputation: rep.points,
    author_thread_count: rep.thread_count,
    author_reply_count: rep.reply_count,
    popularity_score: 0,
  };
}

// Mirrors applyRateLimit's upsert. The fake answers each statement in one
// synchronous step, as Postgres' row lock would serialize the real upsert.
function applyRateLimitRow(db, params) {
  const [scope, key] = params;
  const windowMs = Number(params[6]);
  const limit = Number(params[9]);
  const blockMs = Number(params[10]);
  const now = Date.now();
  const id = `${scope}:${key}`;
  const row = db.rateLimits.get(id);
  if (!row) {
    db.rateLimits.set(id, { count: 1, windowStartedAt: now, blockedUntil: null });
  } else if (row.blockedUntil && row.blockedUntil > now) {
    // still blocked
  } else if (now - row.windowStartedAt > windowMs) {
    Object.assign(row, { count: 1, windowStartedAt: now, blockedUntil: null });
  } else {
    row.count += 1;
    row.blockedUntil = row.count > limit ? now + blockMs : null;
  }
  const stored = db.rateLimits.get(id);
  return [{
    count: stored.count,
    window_started_at: new Date(stored.windowStartedAt).toISOString(),
    blocked_until: stored.blockedUntil ? new Date(stored.blockedUntil).toISOString() : null,
  }];
}

function answer(db, query, params) {
  db.queries.push({ query, params });

  if (/FROM sessions\s+JOIN users/.test(query)) {
    const user = db.users.get(db.currentUserId);
    return [{ id: user.id, username: user.username, role: user.role, is_admin: user.is_admin, expires_at: '2099-01-01T00:00:00.000Z' }];
  }
  if (/SELECT id, username, email, display_name, membership_level/.test(query)) {
    const user = db.users.get(params[0]);
    return [{
      id: user.id,
      username: user.username,
      email: `${user.username}@example.com`,
      display_name: user.username,
      membership_level: user.membership_level,
      membership_started_at: null,
      membership_expires_at: null,
      stripe_customer_id: null,
      stripe_last_checkout_session_id: null,
      stripe_subscription_status: null,
      status: 'active',
      email_verified: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }];
  }
  if (/SELECT \*\s+FROM member_profiles/.test(query)) {
    return [{ user_id: params[0], preferences: '{}', favorite_cipher: null, timezone: null }];
  }
  if (/SELECT setting_key\s+FROM admin_settings/.test(query)) {
    return parseArray(params[0]).filter((key) => db.settings.has(key)).map((key) => ({ setting_key: key }));
  }
  if (/INSERT INTO admin_settings/.test(query)) {
    if (!db.settings.has(params[0])) db.settings.set(params[0], params[1]);
    return [];
  }
  if (/INSERT INTO request_rate_limits/.test(query)) {
    return applyRateLimitRow(db, params);
  }

  // forum_categories
  if (/FROM forum_categories\s+WHERE slug =/.test(query)) {
    return db.categories.filter((category) => category.slug === params[0]).slice(0, 1);
  }
  if (/FROM forum_categories\s+WHERE access_tier =/.test(query)) {
    return db.categories.filter((category) => category.access_tier === params[0]);
  }
  if (/DELETE FROM forum_categories/.test(query)) {
    const id = params[0];
    db.beforeCategoryDelete?.(db);
    if (db.threads.some((thread) => thread.category_id === id)) {
      const error = new Error('update or delete on table "forum_categories" violates foreign key constraint "forum_threads_category_id_fkey" on table "forum_threads"');
      error.code = '23503';
      throw error;
    }
    const before = db.categories.length;
    db.categories = db.categories.filter((category) => category.id !== id);
    return before === db.categories.length ? [] : [{ id }];
  }
  if (/FROM forum_threads\s+WHERE category_id =/.test(query)) {
    const inCategory = db.threads.filter((thread) => thread.category_id === params[0]);
    if (/active_total/.test(query)) {
      return [{ active_total: inCategory.filter((thread) => !thread.deleted_at).length, total: inCategory.length }];
    }
    // The statement before the fix counted live threads only.
    return [{ total: inCategory.filter((thread) => !thread.deleted_at).length }];
  }

  // the posting cooldown before it was made atomic: SELECT, then insert later
  if (/WHERE latest_posted_at > NOW\(\) - INTERVAL '15 seconds'/.test(query)) {
    const since = Date.now() - 15_000;
    const recent = [...db.threads, ...db.posts]
      .filter((row) => row.author_user_id === params[0] && new Date(row.created_at).getTime() > since);
    return recent.length ? [{ latest_posted_at: recent[0].created_at }] : [];
  }

  // forum_threads
  if (/INSERT INTO forum_threads/.test(query)) {
    const [id, categoryId, authorUserId, title, body] = params;
    const row = {
      id,
      category_id: categoryId,
      author_user_id: authorUserId,
      title,
      body,
      reply_count: 0,
      view_count: 0,
      is_locked: false,
      pending_approval: params.length > 5 ? bool(params[5]) : false,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    db.threads.push(row);
    return [{ ...row }];
  }
  if (/UPDATE forum_threads\s+SET deleted_at/.test(query)) {
    const [deletedBy, threadId] = params;
    const thread = db.threads.find((row) => row.id === threadId && !row.deleted_at);
    if (!thread) return [];
    thread.deleted_at = new Date().toISOString();
    thread.deleted_by_user_id = deletedBy;
    return [{ author_user_id: thread.author_user_id, pending_approval: thread.pending_approval }];
  }
  if (/UPDATE forum_threads\s+SET pending_approval = FALSE/.test(query)) {
    const thread = db.threads.find((row) => row.id === params[0] && row.pending_approval && !row.deleted_at);
    if (!thread) return [];
    thread.pending_approval = false;
    return [{ author_user_id: thread.author_user_id }];
  }
  if (/UPDATE forum_threads SET is_locked = TRUE/.test(query)) {
    const thread = db.threads.find((row) => row.id === params[1] && !row.deleted_at);
    if (thread) thread.is_locked = true;
    return [];
  }
  if (/UPDATE forum_threads\s+SET reply_count = reply_count \+ 1/.test(query)) {
    const thread = db.threads.find((row) => row.id === params[0]);
    thread.reply_count += 1;
    return [];
  }
  if (/SELECT t\.id, t\.is_locked/.test(query)) {
    const thread = db.threads.find((row) => row.id === params[0] && !row.deleted_at);
    if (!thread) return [];
    const category = db.categories.find((row) => row.id === thread.category_id);
    return [{
      id: thread.id,
      is_locked: thread.is_locked,
      pending_approval: thread.pending_approval,
      access_tier: category.access_tier,
      is_archived: category.is_archived,
      category_is_locked: category.is_locked,
    }];
  }
  if (/SELECT t\.id, c\.access_tier\s+FROM forum_threads t/.test(query)) {
    const thread = db.threads.find((row) => row.id === params[0] && !row.deleted_at);
    if (!thread) return [];
    return [{ id: thread.id, access_tier: db.categories.find((row) => row.id === thread.category_id).access_tier }];
  }
  if (/FROM forum_threads t\s+JOIN users u/.test(query)) {
    const live = db.threads.filter((thread) => !thread.deleted_at);
    const rows = /WHERE t\.id =/.test(query) ? live.filter((thread) => thread.id === params[0]) : live;
    return rows.map((thread) => threadRow(db, thread));
  }
  if (/WHERE t\.pending_approval = TRUE/.test(query)) {
    return db.threads.filter((thread) => thread.pending_approval && !thread.deleted_at).map((thread) => ({
      id: thread.id,
      title: thread.title,
      created_at: thread.created_at,
      category_name: db.categories.find((row) => row.id === thread.category_id).name,
      author_username: db.users.get(thread.author_user_id).username,
    }));
  }

  // forum_posts
  if (/INSERT INTO forum_posts/.test(query)) {
    const [id, threadId, authorUserId, body] = params;
    const row = { id, thread_id: threadId, author_user_id: authorUserId, body, deleted_at: null, created_at: new Date().toISOString() };
    db.posts.push(row);
    return [{ ...row }];
  }
  if (/UPDATE forum_posts\s+SET deleted_at/.test(query)) {
    const post = db.posts.find((row) => row.id === params[1] && !row.deleted_at);
    if (!post) return [];
    // The statement may require the reply's thread to still be live.
    const requiresLiveThread = /EXISTS \(\s*SELECT 1\s+FROM forum_threads t[\s\S]*t\.deleted_at IS NULL/.test(query);
    if (requiresLiveThread && db.threads.find((row) => row.id === post.thread_id)?.deleted_at) return [];
    post.deleted_at = new Date().toISOString();
    return [{ thread_id: post.thread_id, author_user_id: post.author_user_id }];
  }
  if (/SELECT author_user_id, COUNT\(\*\)::INTEGER AS total\s+FROM forum_posts/.test(query)) {
    const totals = new Map();
    for (const post of db.posts) {
      if (post.thread_id !== params[0] || post.deleted_at) continue;
      totals.set(post.author_user_id, (totals.get(post.author_user_id) || 0) + 1);
    }
    return [...totals].map(([authorUserId, total]) => ({ author_user_id: authorUserId, total }));
  }
  if (/SELECT p\.id, c\.access_tier\s+FROM forum_posts p/.test(query)) {
    const post = db.posts.find((row) => row.id === params[0] && !row.deleted_at);
    if (!post) return [];
    const thread = db.threads.find((row) => row.id === post.thread_id);
    return [{ id: post.id, access_tier: db.categories.find((row) => row.id === thread.category_id).access_tier }];
  }

  // forum_reports
  if (/FROM forum_reports\s+WHERE reporter_user_id =/.test(query)) {
    const [reporter, threadId, postId] = params;
    return db.reports
      .filter((row) => row.reporter_user_id === reporter && row.thread_id === threadId && row.post_id === postId && ['open', 'in_review'].includes(row.status))
      .map((row) => ({ id: row.id }));
  }
  if (/INSERT INTO forum_reports/.test(query)) {
    const [id, threadId, postId, reporter, reason] = params;
    db.reports.push({ id, thread_id: threadId, post_id: postId, reporter_user_id: reporter, reason, status: 'open' });
    return [];
  }

  // forum_member_reputation
  if (/INSERT INTO forum_member_reputation/.test(query)) {
    const [userId, points, threads, replies] = params.map((value, index) => (index === 0 ? value : Number(value)));
    const rep = reputationOf(db, userId);
    db.reputation.set(userId, {
      points: rep.points + points,
      thread_count: rep.thread_count + threads,
      reply_count: rep.reply_count + replies,
    });
    return [];
  }
  if (/UPDATE forum_member_reputation/.test(query)) {
    const [points, threads, replies, userId] = params;
    const rep = db.reputation.get(userId);
    if (rep) {
      rep.points = Math.max(rep.points - Number(points), 0);
      rep.thread_count = Math.max(rep.thread_count - Number(threads), 0);
      rep.reply_count = Math.max(rep.reply_count - Number(replies), 0);
    }
    return [];
  }

  return [];
}

let activeDb = null;
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
const PRIOR_FETCH_FUNCTION = neonConfig.fetchFunction;

process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
neonConfig.fetchFunction = async (_url, init) => {
  const { query, params } = JSON.parse(init.body);
  try {
    const rows = answer(activeDb, query, params);
    return new Response(JSON.stringify(neonResult(rows)), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message, code: error.code }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
};

test.after(() => {
  neonConfig.fetchFunction = PRIOR_FETCH_FUNCTION;
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

function sessionCookie(user) {
  // Staff reach the member forum on the admin session cookie.
  return user.role === 'member' ? `gematria_member_session=token-${user.id}` : `gematria_admin_session=token-${user.id}`;
}

async function forumRequest(db, user, { method = 'POST', body = null, query = '' } = {}) {
  activeDb = db;
  db.currentUserId = user.id;
  const response = await memberForumHandler({
    httpMethod: method,
    headers: { cookie: sessionCookie(user), 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    rawUrl: `https://gematria.today/api/member-forum${query}`,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.statusCode, body: JSON.parse(response.body) };
}

const LOUNGE = { id: 'cat-lounge', slug: 'member-lounge', name: 'Member Lounge' };

// ---------- M4: category lock, archive, post mode and approval are enforced ----------

const newThread = (categorySlug) => ({ action: 'create_thread', categorySlug, title: 'Hello there', body: 'A perfectly ordinary first post.' });

for (const [label, settings, message] of [
  ['locked', { is_locked: true }, /locked/],
  ['archived', { is_archived: true }, /archived/],
  ['moderators-only', { post_mode: 'moderators' }, /Only moderators/],
]) {
  test(`a member cannot start a thread in a ${label} category`, async () => {
    const db = createForumDb({ categories: [{ id: 'cat-news', slug: 'announcements', name: 'Announcements', ...settings }] });
    const { status, body } = await forumRequest(db, USERS.member, { body: newThread('announcements') });

    assert.equal(status, 403);
    assert.match(body.error, message);
    assert.equal(db.threads.length, 0);
    assert.equal(reputationOf(db, USERS.member.id).points, 0);
    // A refused post does not start the member's posting cooldown.
    assert.equal(db.rateLimits.size, 0);
  });
}

test('staff can start threads in a moderators-only category', async () => {
  const db = createForumDb({ categories: [{ id: 'cat-news', slug: 'announcements', name: 'Announcements', post_mode: 'moderators' }] });
  const { status, body } = await forumRequest(db, USERS.owner, { body: newThread('announcements') });

  assert.equal(status, 201);
  assert.equal(body.thread.pendingApproval, false);
  assert.equal(db.threads.length, 1);
});

test('a reply in an archived category is refused', async () => {
  const db = createForumDb({
    categories: [{ id: 'cat-old', slug: 'old', name: 'Old', is_archived: true }],
    threads: [{ id: 't-1', category_id: 'cat-old', author_user_id: USERS.other.id, title: 'Old', body: 'Old body' }],
  });
  const { status, body } = await forumRequest(db, USERS.member, { body: { action: 'create_reply', threadId: 't-1', body: 'Late reply' } });

  assert.equal(status, 403);
  assert.match(body.error, /archived/);
  assert.equal(db.posts.length, 0);
});

test('a reply in a locked category is refused, as in a locked thread', async () => {
  const db = createForumDb({
    categories: [{ id: 'cat-news', slug: 'announcements', name: 'Announcements', is_locked: true }],
    threads: [{ id: 't-1', category_id: 'cat-news', author_user_id: USERS.other.id, title: 'News', body: 'News body', reply_count: 0 }],
  });
  const { status, body } = await forumRequest(db, USERS.member, { body: { action: 'create_reply', threadId: 't-1', body: 'Sneaky reply' } });

  assert.equal(status, 403);
  assert.match(body.error, /category is locked/);
  assert.equal(db.posts.length, 0);
  assert.equal(db.threads[0].reply_count, 0);
  assert.equal(reputationOf(db, USERS.member.id).points, 0);
  assert.equal(reputationOf(db, USERS.member.id).reply_count, 0);
  // A refused reply does not start the member's posting cooldown.
  assert.equal(db.rateLimits.size, 0);
});

test('in a category that requires approval a member thread waits for a moderator before it counts', async () => {
  const db = createForumDb({ categories: [{ id: 'cat-q', slug: 'questions', name: 'Questions', require_approval: true }] });
  const created = await forumRequest(db, USERS.member, { body: newThread('questions') });

  assert.equal(created.status, 201);
  assert.equal(created.body.thread.pendingApproval, true);
  assert.equal(db.threads[0].pending_approval, true);
  assert.equal(reputationOf(db, USERS.member.id).points, 0, 'no reputation until it is approved');

  // Hidden from other members, shown to its author and to staff.
  const list = db.queries.length;
  await forumRequest(db, USERS.other, { method: 'GET', query: '?action=threads' });
  const listQuery = db.queries.slice(list).find((entry) => /FROM forum_threads t\s+JOIN users u/.test(entry.query));
  assert.match(listQuery.query, /\(t\.pending_approval = FALSE OR t\.author_user_id = \$\d+ OR \$\d+ = TRUE\)/);
  assert.ok(listQuery.params.includes(USERS.other.id));
  assert.ok(listQuery.params.includes('false'), 'a member is not a moderator');

  // Moderators see it in their queue and approve it.
  const queue = await forumRequest(db, USERS.owner, { method: 'GET', query: '?action=reports' });
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.body.pendingThreads.map((thread) => thread.id), [db.threads[0].id]);

  const approved = await forumRequest(db, USERS.owner, { body: { action: 'approve_thread', threadId: db.threads[0].id } });
  assert.equal(approved.status, 200);
  assert.equal(db.threads[0].pending_approval, false);
  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 10, thread_count: 1, reply_count: 0 });
});

test('members cannot approve threads', async () => {
  const db = createForumDb({
    categories: [{ ...LOUNGE, require_approval: true }],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.member.id, title: 'Mine', body: 'Mine', pending_approval: true }],
  });
  const { status } = await forumRequest(db, USERS.member, { body: { action: 'approve_thread', threadId: 't-1' } });

  assert.equal(status, 403);
  assert.equal(db.threads[0].pending_approval, true);
});

test('the thread list tells the composer which categories take new threads', async () => {
  const db = createForumDb({ categories: [LOUNGE, { id: 'cat-news', slug: 'announcements', name: 'Announcements', is_locked: true, post_mode: 'moderators' }] });
  const { body } = await forumRequest(db, USERS.member, { method: 'GET', query: '?action=threads' });

  const announcements = body.categories.find((category) => category.slug === 'announcements');
  assert.equal(announcements.isLocked, true);
  assert.equal(announcements.postMode, 'moderators');
  assert.equal(announcements.isArchived, false);
});

// ---------- L2: the super admin can moderate ----------

test('the super admin can lock threads and read the moderation queue', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.member.id, title: 'Spam', body: 'Spam' }],
  });

  const locked = await forumRequest(db, USERS.owner, { body: { action: 'lock_thread', threadId: 't-1' } });
  assert.equal(locked.status, 200);
  assert.equal(db.threads[0].is_locked, true);

  const queue = await forumRequest(db, USERS.owner, { method: 'GET', query: '?action=reports' });
  assert.equal(queue.status, 200);
});

test('members still cannot moderate', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.other.id, title: 'Theirs', body: 'Theirs' }],
  });
  const { status, body } = await forumRequest(db, USERS.member, { body: { action: 'lock_thread', threadId: 't-1' } });

  assert.equal(status, 403);
  assert.match(body.error, /Admin privileges/);
  assert.equal(db.threads[0].is_locked, false);
});

test('posts by the super admin carry the Moderator badge', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.owner.id, title: 'Welcome', body: 'Welcome' }],
  });
  const { status, body } = await forumRequest(db, USERS.member, { method: 'GET', query: '?action=thread&threadId=t-1' });

  assert.equal(status, 200);
  assert.ok(body.thread.authorBadges.includes('Moderator'));
});

test('the forum page shows its moderator tools to the super admin', () => {
  const source = readFileSync(new URL('../page-scripts/forum-1.js', import.meta.url), 'utf8');
  const assignment = source.match(/isAdmin = ([^;]*session[^;]*);/);
  assert.ok(assignment, 'forum-1.js sets isAdmin from the session');
  assert.match(assignment[1], /'super_admin'/);
  assert.match(assignment[1], /isAdmin/);
});

// ---------- L8: cooldown race, reputation reversal, report throttling ----------

test('concurrent replies cannot all slip past the posting cooldown', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.other.id, title: 'Topic', body: 'Topic' }],
  });
  activeDb = db;
  db.currentUserId = USERS.member.id;

  const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => memberForumHandler({
    httpMethod: 'POST',
    headers: { cookie: sessionCookie(USERS.member), 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    rawUrl: 'https://gematria.today/api/member-forum',
    body: JSON.stringify({ action: 'create_reply', threadId: 't-1', body: `Reply number ${index}` }),
  })));

  const statuses = responses.map((response) => response.statusCode).sort();
  assert.deepEqual(statuses, [201, 429, 429, 429, 429, 429]);
  assert.equal(db.posts.length, 1);
  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 4, thread_count: 0, reply_count: 1 });
});

test('a second post inside the cooldown is refused', async () => {
  const db = createForumDb({ categories: [LOUNGE] });
  const first = await forumRequest(db, USERS.member, { body: newThread('member-lounge') });
  const second = await forumRequest(db, USERS.member, { body: { ...newThread('member-lounge'), title: 'Another one' } });

  assert.equal(first.status, 201);
  assert.equal(second.status, 429);
  assert.match(second.body.error, /wait a few seconds/);
  assert.equal(db.threads.length, 1);
});

test('a moderator deleting a reply or a thread takes back the reputation it earned', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.member.id, title: 'Spam', body: 'Spam' }],
    posts: [{ id: 'p-1', thread_id: 't-1', author_user_id: USERS.member.id, body: 'More spam' }],
    reputation: { [USERS.member.id]: { points: 14, thread_count: 1, reply_count: 1 } },
  });

  assert.equal((await forumRequest(db, USERS.owner, { body: { action: 'delete_reply', replyId: 'p-1' } })).status, 200);
  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 10, thread_count: 1, reply_count: 0 });

  assert.equal((await forumRequest(db, USERS.owner, { body: { action: 'delete_thread', threadId: 't-1' } })).status, 200);
  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 0, thread_count: 0, reply_count: 0 });

  // Deleting again changes nothing: the thread is already gone.
  await forumRequest(db, USERS.owner, { body: { action: 'delete_thread', threadId: 't-1' } });
  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 0, thread_count: 0, reply_count: 0 });
});

test('deleting a thread also takes back what the replies in it earned its author', async () => {
  // The route the cooldown leaves open: one thread, then a reply every 15 s.
  const db = createForumDb({ categories: [LOUNGE] });
  const created = await forumRequest(db, USERS.member, { body: newThread('member-lounge') });
  assert.equal(created.status, 201);
  const threadId = created.body.thread.id;
  for (let index = 0; index < 3; index += 1) {
    db.rateLimits.clear(); // the cooldown has passed
    const reply = await forumRequest(db, USERS.member, { body: { action: 'create_reply', threadId, body: `Reply number ${index}` } });
    assert.equal(reply.status, 201);
  }
  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 22, thread_count: 1, reply_count: 3 });

  // The moderator deletes the thread; its replies vanish with it, and so does
  // everything they earned.
  assert.equal((await forumRequest(db, USERS.owner, { body: { action: 'delete_thread', threadId } })).status, 200);
  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 0, thread_count: 0, reply_count: 0 });
});

test('deleting a thread takes back reply reputation from every author in it, once', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.member.id, title: 'Spam', body: 'Spam' }],
    posts: [
      { id: 'p-1', thread_id: 't-1', author_user_id: USERS.other.id, body: 'Spam from a second account' },
      { id: 'p-2', thread_id: 't-1', author_user_id: USERS.other.id, body: 'More spam from a second account' },
      { id: 'p-3', thread_id: 't-1', author_user_id: USERS.other.id, body: 'Removed earlier', deleted_at: '2026-09-01T00:00:00.000Z' },
    ],
    reputation: {
      [USERS.member.id]: { points: 10, thread_count: 1, reply_count: 0 },
      // 30 points earned elsewhere plus the two live replies in this thread.
      [USERS.other.id]: { points: 38, thread_count: 3, reply_count: 2 },
    },
  });

  assert.equal((await forumRequest(db, USERS.owner, { body: { action: 'delete_thread', threadId: 't-1' } })).status, 200);
  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 0, thread_count: 0, reply_count: 0 });
  assert.deepEqual(reputationOf(db, USERS.other.id), { points: 30, thread_count: 3, reply_count: 0 });

  // A moderator on a page loaded before the thread was deleted removes one of
  // its replies: those points were already taken back with the thread.
  assert.equal((await forumRequest(db, USERS.owner, { body: { action: 'delete_reply', replyId: 'p-1' } })).status, 200);
  assert.deepEqual(reputationOf(db, USERS.other.id), { points: 30, thread_count: 3, reply_count: 0 });
});

test('deleting a thread that was never approved takes nothing back', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.member.id, title: 'Spam', body: 'Spam', pending_approval: true }],
    reputation: { [USERS.member.id]: { points: 4, thread_count: 0, reply_count: 1 } },
  });
  await forumRequest(db, USERS.owner, { body: { action: 'delete_thread', threadId: 't-1' } });

  assert.deepEqual(reputationOf(db, USERS.member.id), { points: 4, thread_count: 0, reply_count: 1 });
});

test('reporting the same post twice files one report', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: [{ id: 't-1', category_id: LOUNGE.id, author_user_id: USERS.other.id, title: 'Topic', body: 'Topic' }],
  });
  const report = { action: 'report_thread', threadId: 't-1', reason: 'spam' };

  assert.equal((await forumRequest(db, USERS.member, { body: report })).status, 201);
  assert.equal((await forumRequest(db, USERS.member, { body: report })).status, 201);
  assert.equal(db.reports.length, 1);

  // Someone else's report on the same thread is still filed.
  assert.equal((await forumRequest(db, USERS.other, { body: report })).status, 201);
  assert.equal(db.reports.length, 2);
});

test('a member cannot flood the moderation queue with reports', async () => {
  const db = createForumDb({
    categories: [LOUNGE],
    threads: Array.from({ length: 25 }, (_, index) => ({
      id: `t-${index}`, category_id: LOUNGE.id, author_user_id: USERS.other.id, title: `Topic ${index}`, body: 'Topic',
    })),
  });

  const statuses = [];
  for (const thread of db.threads) {
    statuses.push((await forumRequest(db, USERS.member, { body: { action: 'report_thread', threadId: thread.id, reason: 'spam' } })).status);
  }

  assert.equal(statuses.filter((status) => status === 201).length, 20);
  assert.equal(statuses.at(-1), 429);
  assert.equal(db.reports.length, 20);
});

// ---------- L73: deleting a category that held threads ----------

async function deleteCategory(db, id) {
  activeDb = db;
  db.currentUserId = USERS.owner.id;
  const response = await adminForumHandler({
    httpMethod: 'DELETE',
    headers: { cookie: sessionCookie(USERS.owner), 'x-forwarded-for': '203.0.113.7' },
    queryStringParameters: { id },
    rawUrl: `https://gematria.today/api/admin-forum?id=${id}`,
  });
  return { status: response.statusCode, body: JSON.parse(response.body) };
}

test('a category whose only threads were deleted by moderators gets a clear 409, not a database error', async () => {
  const db = createForumDb({
    categories: [{ id: 'cat-x', slug: 'custom', name: 'Custom' }],
    threads: [{ id: 't-1', category_id: 'cat-x', author_user_id: USERS.member.id, title: 'Gone', body: 'Gone', deleted_at: '2026-09-01T00:00:00.000Z' }],
  });
  const { status, body } = await deleteCategory(db, 'cat-x');

  assert.equal(status, 409);
  assert.match(body.error, /Archive it instead/);
  assert.doesNotMatch(body.error, /foreign key/);
  assert.equal(db.categories.length, 1);
  assert.equal(db.threads.length, 1, 'the deleted thread is kept');
});

test('a thread posted between the check and the delete still gets the clear 409', async () => {
  // The count sees an empty category; the thread lands before the DELETE runs.
  const db = createForumDb({
    categories: [{ id: 'cat-x', slug: 'custom', name: 'Custom' }],
    beforeCategoryDelete: (state) => {
      state.threads.push({ id: 't-late', category_id: 'cat-x', author_user_id: USERS.member.id, deleted_at: null });
    },
  });
  const { status, body } = await deleteCategory(db, 'cat-x');

  assert.equal(status, 409);
  assert.doesNotMatch(body.error, /foreign key/);
});

test('an empty category is deleted', async () => {
  const db = createForumDb({ categories: [{ id: 'cat-x', slug: 'custom', name: 'Custom' }] });
  const { status, body } = await deleteCategory(db, 'cat-x');

  assert.equal(status, 200);
  assert.equal(body.deleted, true);
  assert.equal(db.categories.length, 0);
});

test('a category with live threads still cannot be deleted', async () => {
  const db = createForumDb({
    categories: [{ id: 'cat-x', slug: 'custom', name: 'Custom' }],
    threads: [{ id: 't-1', category_id: 'cat-x', author_user_id: USERS.member.id, title: 'Live', body: 'Live' }],
  });
  const { status, body } = await deleteCategory(db, 'cat-x');

  assert.equal(status, 409);
  assert.match(body.error, /active threads/);
});
