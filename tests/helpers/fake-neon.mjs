// A stand-in for the Neon database in tests that run a real function handler.
// getSqlClient() builds a real neon() client, and the neon HTTP driver posts
// each query to the database host through the global fetch, so replacing fetch
// stands in for the database without touching the handler's own code path.
// Same approach as tests/member-register-response.test.mjs.

export const FAKE_DATABASE_URL = 'postgres://user:pass@neon.invalid/neondb';

// Neon's HTTP wire format: column descriptors plus rows of raw text values,
// which the driver parses by Postgres type id.
export function toNeonResult(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const typeOf = (name) => {
    const value = rows.map((row) => row[name]).find((candidate) => candidate !== null && candidate !== undefined);
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
    fields: columns.map((name) => ({ name, dataTypeID: typeOf(name) })),
    rows: rows.map((row) => columns.map((name) => encode(row[name]))),
  };
}

// Routes every query to respond(query, params), which returns the rows, or an
// Error to fail the query the way Neon reports a database error. Requests to
// any other host go to otherFetch. Every query is recorded in `queries`.
export function installFakeNeon(respond, { otherFetch = null } = {}) {
  const queries = [];
  globalThis.fetch = async (url, init = {}) => {
    // The driver posts to https://api.<host's parent domain>/sql.
    if (!String(url).startsWith('https://api.invalid/sql')) {
      if (otherFetch) return otherFetch(url, init);
      throw new Error(`unexpected fetch to ${url}`);
    }
    const body = JSON.parse(init.body);
    const batch = Array.isArray(body.queries) ? body.queries : [body];
    const results = batch.map(({ query, params }) => {
      queries.push({ query, params });
      return respond(query, params) ?? [];
    });
    const failure = results.find((result) => result instanceof Error);
    if (failure) return Response.json({ message: failure.message }, { status: 400 });
    return Array.isArray(body.queries)
      ? Response.json({ results: results.map(toNeonResult) })
      : Response.json(toNeonResult(results[0]));
  };
  process.env.DATABASE_URL = FAKE_DATABASE_URL;
  return { queries };
}

// The handful of rows every handler needs before it reaches its own queries:
// an open rate-limit window and, when the cookie is sent, a signed-in member.
export function baseRows(query) {
  if (/INSERT INTO request_rate_limits/i.test(query)) {
    return [{ count: 1, window_started_at: '2026-01-01T00:00:00.000Z', blocked_until: null }];
  }
  if (/FROM sessions\s+JOIN users/i.test(query)) {
    return [{ id: 'member-1', username: 'member', role: 'member', is_admin: false, expires_at: '2099-01-01T00:00:00.000Z' }];
  }
  return null;
}

export const MEMBER_COOKIE = 'gematria_member_session=member-token';
