import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FREE_MEMBERSHIP_SAVE_LIMIT,
  MAX_NOTE_LENGTH,
  MAX_QUERY_TEXT_LENGTH,
  MAX_RESULT_PAYLOAD_BYTES,
  handler as historyHandler,
  parseHistorySaveBody,
} from '../netlify/functions/member-history.mjs';
import { handler as chatSessionsHandler } from '../netlify/functions/member-chat-sessions.mjs';
import { parseBoundedIntegerParam } from '../netlify/functions/_member.mjs';
import { buildSearchPayload } from '../page-scripts/multi-cipher-engine.mjs';

// The real handlers run end to end. getSqlClient() builds a real neon() client
// whose HTTP driver posts every statement through the global fetch, so a fake
// fetch stands in for the database (the same approach as
// member-register-response.test.mjs).
const PRIOR_FETCH = globalThis.fetch;
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;

test.after(() => {
  globalThis.fetch = PRIOR_FETCH;
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

function toNeonResult(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const typeOf = (value) => {
    if (typeof value === 'boolean') return 16;
    if (typeof value === 'number') return 23;
    if (value && typeof value === 'object') return 3802;
    return 25;
  };
  const encode = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? 't' : 'f';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  return {
    fields: columns.map((name) => ({ name, dataTypeID: typeOf(rows[0][name]) })),
    rows: rows.map((row) => columns.map((name) => encode(row[name]))),
  };
}

function memberRow(membershipLevel) {
  return {
    id: 'member-1',
    username: 'kev',
    email: 'kev@example.com',
    display_name: 'Kev',
    membership_level: membershipLevel,
    membership_started_at: null,
    membership_expires_at: null,
    stripe_customer_id: null,
    stripe_last_checkout_session_id: null,
    stripe_subscription_status: null,
    status: 'active',
    email_verified: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function historyRow(index, overrides = {}) {
  return {
    id: `history-${index}`,
    user_id: 'member-1',
    query_text: `word${index}`,
    query_type: 'word',
    calculator_source: 'calculator',
    gematria_total: 6,
    digital_root: 6,
    is_base_root: true,
    result_payload: { index },
    note: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

class DatabaseError extends Error {}

// `route` answers the statements a test cares about; it returns rows, or throws
// a DatabaseError to have the fake database reject the statement. Everything
// else -- schema DDL, rate-limit bookkeeping, audit inserts -- comes back empty.
function installFakeDatabase({ membershipLevel = 'free', route = () => null } = {}) {
  const statements = [];
  const transactions = [];
  const answer = ({ query, params }) => {
    statements.push({ query, params });
    if (/FROM sessions\s+JOIN users/i.test(query)) {
      return [{ id: 'member-1', username: 'kev', role: 'member', is_admin: false, expires_at: '2099-01-01T00:00:00.000Z' }];
    }
    if (/FROM users\s+WHERE id =/i.test(query)) {
      return [memberRow(membershipLevel)];
    }
    if (/^\s*SELECT \*\s+FROM member_profiles/i.test(query)) {
      return [{ user_id: 'member-1', preferences: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }];
    }
    return route(query, params) ?? [];
  };
  process.env.DATABASE_URL = 'postgres://user:pass@neon.invalid/neondb';
  globalThis.fetch = async (_url, init = {}) => {
    const body = JSON.parse(init.body);
    try {
      if (Array.isArray(body.queries)) {
        body.queries.isolationLevel = init.headers?.['Neon-Batch-Isolation-Level'];
        transactions.push(body.queries);
        return Response.json({ results: body.queries.map((query) => toNeonResult(answer(query))) });
      }
      return Response.json(toNeonResult(answer(body)));
    } catch (error) {
      if (!(error instanceof DatabaseError)) throw error;
      return Response.json({ message: error.message, code: '22P02' }, { status: 400 });
    }
  };
  return { statements, transactions };
}

function memberEvent(httpMethod, { query = '', body } = {}) {
  return {
    httpMethod,
    rawUrl: `https://gematria.today/api/member-history${query}`,
    headers: { cookie: 'gematria_member_session=session-token', 'x-forwarded-for': '203.0.113.9' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function parse(response) {
  return JSON.parse(response.body);
}

const isHistoryPageQuery = (query) => /FROM calculation_history[\s\S]*ORDER BY created_at DESC, id DESC/i.test(query);
const isHistoryInsert = (query) => /INSERT INTO calculation_history/i.test(query);

const WORD_SAVE = {
  queryText: 'Light',
  queryType: 'word',
  calculatorSource: 'calculator',
  gematriaTotal: 336,
  digitalRoot: 3,
  isBaseRoot: false,
  resultPayload: { searchGematria: { word: 'Light' } },
};

// ---------- ?limit= parsing (L75) ----------

test('parseBoundedIntegerParam falls back on anything that is not an integer instead of passing NaN through', () => {
  const bounds = { fallback: 25, min: 1, max: 100 };
  assert.equal(parseBoundedIntegerParam('abc', bounds), 25);
  assert.equal(parseBoundedIntegerParam('', bounds), 25);
  assert.equal(parseBoundedIntegerParam(null, bounds), 25);
  assert.equal(parseBoundedIntegerParam(undefined, bounds), 25);
  assert.equal(parseBoundedIntegerParam('2.5', bounds), 2);
  assert.equal(parseBoundedIntegerParam('0', bounds), 1);
  assert.equal(parseBoundedIntegerParam('-4', bounds), 1);
  assert.equal(parseBoundedIntegerParam('5000', bounds), 100);
  assert.equal(parseBoundedIntegerParam('40', bounds), 40);
});

test('GET /api/member-history with a junk or fractional limit sends a whole page size to Postgres', async () => {
  const { statements } = installFakeDatabase();
  for (const [limit, expectedLimitParam] of [['abc', '26'], ['2.5', '3']]) {
    statements.length = 0;
    const response = await historyHandler(memberEvent('GET', { query: `?limit=${limit}` }));
    assert.equal(response.statusCode, 200, limit);
    const page = statements.find((statement) => isHistoryPageQuery(statement.query));
    assert.deepEqual(page.params, ['member-1', expectedLimitParam, '0'], limit);
  }
});

test('member-history answers a database failure with a generic 500, not the Postgres error text', async () => {
  installFakeDatabase({
    route: (query) => {
      if (isHistoryPageQuery(query)) throw new DatabaseError('invalid input syntax for type bigint: "NaN"');
      return null;
    },
  });
  const response = await historyHandler(memberEvent('GET'));
  assert.equal(response.statusCode, 500);
  assert.equal(parse(response).error, 'History request failed');
  assert.doesNotMatch(response.body, /bigint|syntax/);
});

test('member-chat-sessions parses ?limit= the same way and hides database errors', async () => {
  const { statements } = installFakeDatabase();
  const okResponse = await chatSessionsHandler({ ...memberEvent('GET', { query: '?limit=abc' }), rawUrl: 'https://gematria.today/api/member-chat-sessions?limit=abc' });
  assert.equal(okResponse.statusCode, 200);
  const sessionsQuery = statements.find((statement) => /FROM member_chat_sessions/i.test(statement.query));
  assert.deepEqual(sessionsQuery.params, ['member-1', '20']);

  installFakeDatabase({
    route: (query) => {
      if (/FROM member_chat_sessions/i.test(query)) throw new DatabaseError('invalid input syntax for type bigint: "NaN"');
      return null;
    },
  });
  const failed = await chatSessionsHandler({ ...memberEvent('GET'), rawUrl: 'https://gematria.today/api/member-chat-sessions' });
  assert.equal(failed.statusCode, 500);
  assert.equal(parse(failed).error, 'Chat session request failed');
});

// ---------- paging (M38) ----------

test('GET returns the total and whether older saves remain, so the dashboard can page past the first 25', async () => {
  const { statements } = installFakeDatabase({
    membershipLevel: 'premium',
    route: (query) => {
      if (isHistoryPageQuery(query)) return Array.from({ length: 26 }, (_, index) => historyRow(index));
      if (/SELECT COUNT\(\*\)::int AS count\s+FROM calculation_history/i.test(query)) return [{ count: 40 }];
      return null;
    },
  });

  const first = parse(await historyHandler(memberEvent('GET', { query: '?limit=25' })));
  assert.equal(first.history.length, 25);
  assert.equal(first.hasMore, true);
  assert.equal(first.total, 40);

  statements.length = 0;
  await historyHandler(memberEvent('GET', { query: '?limit=25&offset=25' }));
  const page = statements.find((statement) => isHistoryPageQuery(statement.query));
  assert.deepEqual(page.params, ['member-1', '26', '25']);
});

test('the last page reports no more saves', async () => {
  installFakeDatabase({
    membershipLevel: 'premium',
    route: (query) => {
      if (isHistoryPageQuery(query)) return Array.from({ length: 15 }, (_, index) => historyRow(index));
      if (/SELECT COUNT\(\*\)/i.test(query)) return [{ count: 40 }];
      return null;
    },
  });
  const last = parse(await historyHandler(memberEvent('GET', { query: '?limit=25&offset=25' })));
  assert.equal(last.history.length, 15);
  assert.equal(last.hasMore, false);
});

// ---------- save size and shape (M41) ----------

test('parseHistorySaveBody accepts what every saving page sends', () => {
  const saves = [
    WORD_SAVE,
    { ...WORD_SAVE, queryText: '336', queryType: 'gematria', resultPayload: { reverseLookup: { words: [] } } },
    { ...WORD_SAVE, queryText: 'Ann, Bob', queryType: 'names', calculatorSource: 'name-calculator', gematriaTotal: '84', resultPayload: { names: ['Ann', 'Bob'], results: [] } },
    { ...WORD_SAVE, calculatorSource: 'ai_agent', resultPayload: { topic: 'Light', source: 'GemaBot' } },
    buildSearchPayload({ query: 'Light', mode: 'all', cipherId: null, allResults: [] }),
  ];
  for (const save of saves) {
    const entry = parseHistorySaveBody(save);
    assert.equal(entry.queryText, save.queryText);
    assert.equal(entry.serializedPayload, JSON.stringify(save.resultPayload));
  }
});

test('a 500-word reverse lookup, the largest result a page saves, is well inside the payload cap', () => {
  const words = Array.from({ length: 500 }, (_, index) => ({
    word: `abcdefghijklmnop${index}`,
    gematria: { total: '9999', digitalRoot: 9 },
    isBaseRoot: false,
    searchCount: 123456,
  }));
  const entry = parseHistorySaveBody({ ...WORD_SAVE, queryType: 'gematria', resultPayload: { reverseLookup: { gematria: '9999', count: 500, words } } });
  assert.ok(Buffer.byteLength(entry.serializedPayload) < MAX_RESULT_PAYLOAD_BYTES / 2);
});

test('POST refuses an oversized result payload before writing anything', async () => {
  const { statements } = installFakeDatabase({ membershipLevel: 'premium' });
  const response = await historyHandler(memberEvent('POST', {
    body: { ...WORD_SAVE, resultPayload: { blob: 'x'.repeat(MAX_RESULT_PAYLOAD_BYTES) } },
  }));
  assert.equal(response.statusCode, 413);
  assert.match(parse(response).error, /too large/);
  assert.equal(statements.some((statement) => isHistoryInsert(statement.query)), false);
});

test('POST refuses over-long query text, unknown types and sources, and over-long notes', async () => {
  const { statements } = installFakeDatabase({ membershipLevel: 'premium' });
  for (const body of [
    { ...WORD_SAVE, queryText: 'a'.repeat(MAX_QUERY_TEXT_LENGTH + 1) },
    { ...WORD_SAVE, queryType: 'x'.repeat(5000) },
    { ...WORD_SAVE, calculatorSource: 'anything-goes' },
    { ...WORD_SAVE, note: 'n'.repeat(MAX_NOTE_LENGTH + 1) },
  ]) {
    const response = await historyHandler(memberEvent('POST', { body }));
    assert.equal(response.statusCode, 400);
  }
  assert.equal(statements.some((statement) => isHistoryInsert(statement.query)), false);

  const patch = await historyHandler(memberEvent('PATCH', { body: { id: 'history-1', note: 'n'.repeat(MAX_NOTE_LENGTH + 1) } }));
  assert.equal(patch.statusCode, 400);
});

test('the dashboard note box stops at the same length the server accepts', () => {
  const dashboard = readFileSync(new URL('../page-scripts/member-1.js', import.meta.url), 'utf8');
  assert.match(dashboard, new RegExp(`maxlength="${MAX_NOTE_LENGTH}"\\s+placeholder="Add private notes about this saved search`));
});

test('POST is rate limited per member', async () => {
  const { statements } = installFakeDatabase({
    membershipLevel: 'premium',
    route: (query) => {
      if (/INSERT INTO request_rate_limits/i.test(query)) {
        return [{ count: 501, window_started_at: '2026-01-01T00:00:00.000Z', blocked_until: '2099-01-01T00:00:00.000Z' }];
      }
      return null;
    },
  });
  const response = await historyHandler(memberEvent('POST', { body: WORD_SAVE }));
  assert.equal(response.statusCode, 429);
  assert.ok(response.headers['retry-after']);
  const limiter = statements.find((statement) => /INSERT INTO request_rate_limits/i.test(statement.query));
  assert.deepEqual(limiter.params.slice(0, 2), ['member-history-save', 'member-1']);
  assert.equal(statements.some((statement) => isHistoryInsert(statement.query)), false);
});

// ---------- free cap (L74) ----------

test('a free member at the cap re-saving an existing calculation gets that row back, not the cap error', async () => {
  const existing = historyRow(3, { query_text: 'Light', note: 'mine' });
  installFakeDatabase({
    route: (query) => {
      // The old code counted first and refused at 7 before looking for a match.
      if (/^\s*SELECT COUNT\(\*\)::int AS count\s+FROM calculation_history/i.test(query)) return [{ count: FREE_MEMBERSHIP_SAVE_LIMIT }];
      if (isHistoryInsert(query)) return [];
      if (/UPDATE calculation_history|SELECT \*\s+FROM calculation_history/i.test(query)) return [existing];
      return null;
    },
  });
  const response = await historyHandler(memberEvent('POST', { body: { ...WORD_SAVE, note: 'updated' } }));
  assert.equal(response.statusCode, 200);
  const body = parse(response);
  assert.equal(body.duplicate, true);
  assert.equal(body.item.id, existing.id);
});

test('a free save checks the cap inside the INSERT, in one transaction behind a per-member lock', async () => {
  const { statements, transactions } = installFakeDatabase({
    route: (query) => (isHistoryInsert(query) ? [historyRow(1, { query_text: 'Light' })] : null),
  });
  const response = await historyHandler(memberEvent('POST', { body: WORD_SAVE }));
  assert.equal(response.statusCode, 201);

  // No standalone COUNT that simultaneous saves could all read before inserting.
  assert.equal(statements.some((statement) => /^\s*SELECT COUNT\(\*\)::int AS count\s+FROM calculation_history/i.test(statement.query)), false);
  const save = transactions.find((queries) => queries.some((query) => isHistoryInsert(query.query)));
  assert.ok(save, 'the free save runs as a transaction');
  // The INSERT must take its snapshot after the lock, which READ COMMITTED does.
  assert.equal(save.isolationLevel, 'ReadCommitted');
  assert.match(save[0].query, /pg_advisory_xact_lock\(hashtext\(\$1::text\)\)/);
  assert.deepEqual(save[0].params, ['calculation_history:member-1']);
  assert.match(save[1].query, /\(SELECT COUNT\(\*\) FROM calculation_history WHERE user_id = \$\d+\) < \$\d+::integer/);
  assert.match(save[1].query, /ON CONFLICT \(user_id, LOWER\(query_text\), query_type, calculator_source\) DO NOTHING/);
  assert.ok(save[1].params.includes(String(FREE_MEMBERSHIP_SAVE_LIMIT)));
});

test('a free member at the cap saving something new is told about the cap', async () => {
  installFakeDatabase({ route: () => [] });
  const response = await historyHandler(memberEvent('POST', { body: WORD_SAVE }));
  assert.equal(response.statusCode, 403);
  assert.equal(parse(response).code, 'FREE_SAVE_LIMIT_REACHED');
});

test('a premium save is not capped and needs no lock', async () => {
  const { statements, transactions } = installFakeDatabase({
    membershipLevel: 'premium',
    route: (query) => (isHistoryInsert(query) ? [historyRow(1, { query_text: 'Light' })] : null),
  });
  const response = await historyHandler(memberEvent('POST', { body: WORD_SAVE }));
  assert.equal(response.statusCode, 201);
  assert.equal(transactions.some((queries) => queries.some((query) => isHistoryInsert(query.query))), false);
  const insert = statements.find((statement) => isHistoryInsert(statement.query));
  // The cap parameter is NULL, which the WHERE clause reads as "no cap".
  assert.match(insert.query, /WHERE \$(\d+)::integer IS NULL/);
  const capIndex = Number(insert.query.match(/WHERE \$(\d+)::integer IS NULL/)[1]) - 1;
  assert.equal(insert.params[capIndex], null);
});
