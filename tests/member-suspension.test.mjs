import test from 'node:test';
import assert from 'node:assert/strict';
import { neonConfig } from '@neondatabase/serverless';

import {
  AUTH_COOKIES,
  getAuthenticatedUser,
  getOptionalAuthenticatedSession,
  hashToken,
} from '../netlify/functions/_auth.mjs';
import { handler as adminForumHandler } from '../netlify/functions/admin-forum.mjs';

// Account status was only checked at password and OAuth sign-in, so a member
// set to 'suspended' -- by hand, there being no other way -- kept every session
// they already held, and the moderation queue's "Suspend" button only wrote a
// label on the report.

// ---------- the session lookups refuse a suspended account ----------

// A sessions/users join that honours whatever status condition the lookup's
// SQL carries, so the test observes the outcome rather than the text alone.
function createSessionStore(user) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (/FROM sessions\s+JOIN users ON users\.id = sessions\.user_id/.test(text)) {
      const refused = /users\.status NOT IN \('suspended', 'deleted'\)/.test(text)
        && ['suspended', 'deleted'].includes(user.status);
      return Promise.resolve(refused ? [] : [{
        id: user.id,
        username: user.username,
        role: user.role,
        is_admin: false,
        expires_at: '2099-01-01T00:00:00.000Z',
      }]);
    }
    return Promise.resolve([]);
  };
  return { sql, calls };
}

const memberCookieEvent = { headers: { cookie: `${AUTH_COOKIES.member}=member-token` } };

test('an active member\'s session still authenticates', async () => {
  const { sql } = createSessionStore({ id: 'm-1', username: 'kev', role: 'member', status: 'active' });
  const { user } = await getAuthenticatedUser(memberCookieEvent, { sql, cookieName: AUTH_COOKIES.member, role: 'member' });
  assert.equal(user.id, 'm-1');
});

for (const status of ['suspended', 'deleted']) {
  test(`a ${status} member's existing session is refused and removed`, async () => {
    const { sql, calls } = createSessionStore({ id: 'm-1', username: 'kev', role: 'member', status });

    await assert.rejects(
      getAuthenticatedUser(memberCookieEvent, { sql, cookieName: AUTH_COOKIES.member, role: 'member' }),
      (error) => error.statusCode === 401,
    );
    const removal = calls.find((call) => /DELETE FROM sessions WHERE token_hash/.test(call.text));
    assert.deepEqual(removal?.values, [hashToken('member-token')]);

    const optional = await getOptionalAuthenticatedSession(memberCookieEvent, { sql });
    assert.equal(optional.user, null);
  });
}

// ---------- the moderation action suspends the reported author ----------

const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
const PRIOR_FETCH_FUNCTION = neonConfig.fetchFunction;

test.after(() => {
  neonConfig.fetchFunction = PRIOR_FETCH_FUNCTION;
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

function encodeValue(value) {
  if (value === null || value === undefined) return { oid: 25, text: null };
  if (typeof value === 'boolean') return { oid: 16, text: value ? 't' : 'f' };
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

function createForumDatabase() {
  const db = {
    users: new Map([
      ['mod-1', { id: 'mod-1', username: 'moderator', role: 'admin', is_admin: true, status: 'active' }],
      ['m-1', { id: 'm-1', username: 'spammer', role: 'member', is_admin: false, status: 'active' }],
      ['m-2', { id: 'm-2', username: 'thread-starter', role: 'member', is_admin: false, status: 'active' }],
      ['staff-1', { id: 'staff-1', username: 'staffer', role: 'admin', is_admin: true, status: 'active' }],
    ]),
    sessions: new Map([
      [hashToken('mod-token'), 'mod-1'],
      [hashToken('spammer-token-a'), 'm-1'],
      [hashToken('spammer-token-b'), 'm-1'],
      [hashToken('thread-starter-token'), 'm-2'],
      [hashToken('staff-token'), 'staff-1'],
    ]),
    threads: new Map([['t-1', { author: 'm-2' }], ['t-2', { author: 'staff-1' }]]),
    posts: new Map([['p-1', { thread: 't-1', author: 'm-1' }]]),
    reports: new Map([
      ['r-reply', { thread_id: 't-1', post_id: 'p-1' }],
      ['r-staff-thread', { thread_id: 't-2', post_id: null }],
    ]),
    audit: [],
  };

  process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
  neonConfig.fetchFunction = async (_url, init) => {
    const { query, params } = JSON.parse(init.body);
    return new Response(JSON.stringify(neonResult(answerForum(db, query, params))), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return db;
}

// Neon sends an array parameter as a Postgres array literal: {"a","b"}.
function parsePgArray(literal) {
  return String(literal).replace(/^\{|\}$/g, '').split(',').filter(Boolean).map((item) => item.replace(/^"|"$/g, ''));
}

function answerForum(db, query, params) {
  if (/FROM sessions\s+JOIN users ON users\.id = sessions\.user_id/.test(query)) {
    const user = db.users.get(db.sessions.get(params[0]));
    if (!user) return [];
    if (/users\.status NOT IN \('suspended', 'deleted'\)/.test(query) && ['suspended', 'deleted'].includes(user.status)) return [];
    return [{ id: user.id, username: user.username, role: user.role, is_admin: user.is_admin, expires_at: '2099-01-01T00:00:00.000Z' }];
  }
  if (/UPDATE forum_reports/.test(query)) {
    return parsePgArray(params.at(-1)).filter((id) => db.reports.has(id)).map((id) => ({ id }));
  }
  if (/UPDATE users\s+SET status = 'suspended'/.test(query)) {
    const [reportIdsLiteral, actorId] = params;
    const authorIds = new Set(parsePgArray(reportIdsLiteral).map((id) => {
      const report = db.reports.get(id);
      if (!report) return null;
      return report.post_id ? db.posts.get(report.post_id)?.author : db.threads.get(report.thread_id)?.author;
    }).filter(Boolean));
    const suspended = [];
    for (const authorId of authorIds) {
      const user = db.users.get(authorId);
      if (!user || user.id === actorId) continue;
      if (/AND role = 'member'/.test(query) && user.role !== 'member') continue;
      if (/COALESCE\(is_admin, FALSE\) = FALSE/.test(query) && user.is_admin) continue;
      if (user.status === 'deleted') continue;
      user.status = 'suspended';
      suspended.push({ id: user.id });
    }
    return suspended;
  }
  if (/DELETE FROM sessions WHERE user_id = ANY/.test(query)) {
    const userIds = parsePgArray(params[0]);
    for (const [tokenHash, userId] of db.sessions) {
      if (userIds.includes(userId)) db.sessions.delete(tokenHash);
    }
    return [];
  }
  if (/INSERT INTO forum_admin_audit/.test(query)) {
    db.audit.push({ targetType: params[2], targetId: params[3], action: params[4] });
    return [];
  }
  return [];
}

function resolveReportEvent(body) {
  return {
    httpMethod: 'PUT',
    headers: { cookie: `${AUTH_COOKIES.admin}=mod-token`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function sessionCount(db, userId) {
  return [...db.sessions.values()].filter((id) => id === userId).length;
}

test('resolving a report with suspend_user suspends the reply\'s author and ends their sessions', async () => {
  const db = createForumDatabase();

  const response = await adminForumHandler(resolveReportEvent({ id: 'r-reply', status: 'actioned', actionTaken: 'suspend_user' }));

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(JSON.parse(response.body).suspendedUserIds, ['m-1']);
  assert.equal(db.users.get('m-1').status, 'suspended');
  assert.equal(sessionCount(db, 'm-1'), 0, 'every session the member held is gone');
  // The reply's author, not the member who started the thread.
  assert.equal(db.users.get('m-2').status, 'active');
  assert.equal(sessionCount(db, 'm-2'), 1);
  assert.equal(sessionCount(db, 'mod-1'), 1, 'the moderator stays signed in');
  assert.ok(db.audit.some((entry) => entry.targetType === 'user' && entry.targetId === 'm-1' && entry.action === 'suspend_user'));
});

test('suspend_user never suspends a staff account', async () => {
  const db = createForumDatabase();

  const response = await adminForumHandler(resolveReportEvent({ id: 'r-staff-thread', status: 'actioned', actionTaken: 'suspend_user' }));

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(JSON.parse(response.body).suspendedUserIds, []);
  assert.equal(db.users.get('staff-1').status, 'active');
  assert.equal(sessionCount(db, 'staff-1'), 1);
});

test('other report actions leave the author\'s account alone', async () => {
  const db = createForumDatabase();

  const response = await adminForumHandler(resolveReportEvent({ id: 'r-reply', status: 'actioned', actionTaken: 'warn_user' }));

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(db.users.get('m-1').status, 'active');
  assert.equal(sessionCount(db, 'm-1'), 2);
});
