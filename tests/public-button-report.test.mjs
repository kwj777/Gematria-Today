import test from 'node:test';
import assert from 'node:assert/strict';

import { handler } from '../netlify/functions/public-button-report.mjs';

// Runs the real handler end to end. getSqlClient() builds a real neon()
// client, and the neon HTTP driver posts each query through the global fetch,
// so stubbing fetch stands in for the database.
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
const PRIOR_FETCH = globalThis.fetch;

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
    return 25;
  };
  const encode = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? 't' : 'f';
    return String(value);
  };
  return {
    fields: columns.map((name) => ({ name, dataTypeID: typeOf(rows[0][name]) })),
    rows: rows.map((row) => columns.map((name) => encode(row[name]))),
  };
}

const MEMBER = { id: 'member-123', username: 'member1', role: 'member', is_admin: false, expires_at: '2099-01-01T00:00:00.000Z' };

function installFakeDatabase({ member = null, rateLimitBlocked = false } = {}) {
  const auditInserts = [];
  const rateLimitCalls = [];
  const route = (query, params) => {
    if (/FROM sessions/i.test(query) && /JOIN users/i.test(query)) {
      return member ? [member] : [];
    }
    if (/INSERT INTO request_rate_limits/i.test(query)) {
      rateLimitCalls.push({ scope: params[0], key: params[1] });
      return [{
        count: rateLimitBlocked ? 121 : 1,
        window_started_at: new Date().toISOString(),
        blocked_until: rateLimitBlocked ? new Date(Date.now() + 60_000).toISOString() : null,
      }];
    }
    if (/INSERT INTO request_audit_log/i.test(query)) {
      auditInserts.push({ route: params[1], action: params[4], metadata: JSON.parse(params[6]) });
    }
    return [];
  };
  globalThis.fetch = async (_url, init = {}) => {
    const body = JSON.parse(init.body);
    if (Array.isArray(body.queries)) {
      return Response.json({ results: body.queries.map((q) => toNeonResult(route(q.query, q.params))) });
    }
    return Response.json(toNeonResult(route(body.query, body.params)));
  };
  process.env.DATABASE_URL = 'postgres://user:pass@neon.invalid/neondb';
  return { auditInserts, rateLimitCalls };
}

function report(payload, { headers = {}, cookie = '' } = {}) {
  return handler({
    httpMethod: 'POST',
    rawUrl: 'https://gematria.today/api/public-button-report',
    headers: {
      host: 'gematria.today',
      'x-forwarded-for': '203.0.113.7',
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

test('caller metadata cannot override the server-derived user agent, geo or audience', async () => {
  const { auditInserts } = installFakeDatabase();

  const response = await report({
    action: 'element_click',
    route: '/calculator.html',
    metadata: {
      source: 'Calculate',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
      clientType: 'human',
      country: 'FR',
      region: 'IDF',
      city: 'Paris',
      authenticated: 'true',
      audienceType: 'member',
      memberId: 'someone-else',
      visitorSessionId: 'forged-session',
    },
  }, { headers: { 'user-agent': 'curl/8.4.0', 'x-country': 'US' } });

  assert.equal(response.statusCode, 202);
  assert.equal(auditInserts.length, 1);
  const { metadata } = auditInserts[0];
  assert.equal(metadata.source, 'Calculate');
  assert.equal(metadata.userAgent, 'curl/8.4.0');
  assert.equal(metadata.clientType, 'automation');
  assert.equal(metadata.country, 'US');
  assert.equal('region' in metadata, false);
  assert.equal('city' in metadata, false);
  assert.equal(metadata.audienceType, 'visitor');
  assert.equal(metadata.authenticated, 'false');
  assert.equal('memberId' in metadata, false);
  assert.notEqual(metadata.visitorSessionId, 'forged-session');
});

test('the stored route is a path capped at 200 characters', async () => {
  const { auditInserts } = installFakeDatabase();

  await report({ action: 'x_click', route: `/${'A'.repeat(50_000)}` });
  await report({ action: 'x_click', route: '/calculator.html?q=1#result' });
  await report({ action: 'x_click', route: 'tools.html' });

  assert.equal(auditInserts[0].route.length, 200);
  assert.ok(auditInserts[0].route.startsWith('/AAAA'));
  assert.equal(auditInserts[1].route, '/calculator.html');
  assert.equal(auditInserts[2].route, '/tools.html');
});

test('oversized or malformed metadata keys are dropped and at most 20 keys are kept', async () => {
  const { auditInserts } = installFakeDatabase();

  const metadata = { ['k'.repeat(250_000)]: '1', 'bad key<>': '1', source: 'Share' };
  for (let index = 0; index < 30; index += 1) {
    metadata[`extra${index}`] = String(index);
  }
  await report({ action: 'share_button_click', route: '/', metadata });

  const stored = auditInserts[0].metadata;
  assert.equal(stored.source, 'Share');
  assert.equal(Object.keys(stored).some((key) => key.length > 64), false);
  assert.equal('bad key<>' in stored, false);
  const callerKeys = Object.keys(stored).filter((key) => key === 'source' || key.startsWith('extra'));
  assert.equal(callerKeys.length, 20);
});

test('elementLink and pageUrl are kept only as same-origin paths', async () => {
  const { auditInserts } = installFakeDatabase();

  await report({
    action: 'element_click',
    route: '/calculator.html',
    metadata: {
      elementLink: 'https://gematria.today/calculator.html#calculateButton',
      pageUrl: 'https://gematria.today/calculator.html?word=love',
    },
  });
  await report({
    action: 'element_click',
    route: '/calculator.html',
    metadata: {
      elementLink: 'https://gematria-today.example/admin.html?session=expired',
      pageUrl: 'javascript:alert(1)',
    },
  });
  await report({
    action: 'element_click',
    route: '/calculator.html',
    metadata: { elementLink: '//phish.example/admin.html', pageUrl: 'data:text/html,hi' },
  });

  assert.equal(auditInserts[0].metadata.elementLink, '/calculator.html#calculateButton');
  assert.equal(auditInserts[0].metadata.pageUrl, '/calculator.html?word=love');
  for (const insert of auditInserts.slice(1)) {
    assert.equal('elementLink' in insert.metadata, false);
    assert.equal('pageUrl' in insert.metadata, false);
  }
});

test('signed-in members are rate limited by account', async () => {
  const { rateLimitCalls, auditInserts } = installFakeDatabase({ member: MEMBER });

  const response = await report({ action: 'x_click', route: '/' }, { cookie: 'gematria_member_session=member-token' });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(rateLimitCalls, [{ scope: 'public-button-report-user', key: 'member-123' }]);
  assert.equal(auditInserts[0].metadata.audienceType, 'member');
  assert.equal(auditInserts[0].metadata.authenticated, 'true');
});

test('a member over the limit is refused and nothing is stored', async () => {
  const { auditInserts } = installFakeDatabase({ member: MEMBER, rateLimitBlocked: true });

  const response = await report({ action: 'x_click', route: '/' }, { cookie: 'gematria_member_session=member-token' });

  assert.equal(response.statusCode, 429);
  assert.equal(auditInserts.filter((insert) => insert.action === 'x_click').length, 0);
});

test('visitors are still rate limited by IP', async () => {
  const { rateLimitCalls } = installFakeDatabase();

  await report({ action: 'x_click', route: '/' });

  assert.deepEqual(rateLimitCalls, [{ scope: 'public-button-report-ip', key: '203.0.113.7' }]);
});
