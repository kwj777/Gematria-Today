import test from 'node:test';
import assert from 'node:assert/strict';

import { CLICK_TRACKING_ROW_LIMIT, handler } from '../netlify/functions/admin-click-tracking.mjs';

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

const ADMIN = { id: 'admin-1', username: 'admin', role: 'admin', is_admin: true, expires_at: '2099-01-01T00:00:00.000Z' };

function clickRow(index) {
  return {
    route: '/calculator.html',
    action: 'sitewide_element_click',
    source: `Button ${index}`,
    destination: '',
    element_type: 'button',
    element_id: '',
    element_selector: '',
    element_link: '',
    page_path: '/calculator.html',
    page_url: '',
    referrer: '',
    audience_type: 'visitor',
    visitor_session_id: '',
    request_fingerprint: 'fp',
    created_at: '2026-01-01T00:00:00Z',
  };
}

function installFakeDatabase({ clickRowCount, makeRow = clickRow }) {
  const clickQueries = [];
  const route = (query, params) => {
    if (/FROM sessions/i.test(query) && /JOIN users/i.test(query)) {
      return [ADMIN];
    }
    if (/FROM request_audit_log/i.test(query)) {
      clickQueries.push({ query, params });
      // Model the database: it never returns more than the query asked for.
      const limitMatch = query.match(/LIMIT \$(\d+)/);
      const limit = limitMatch ? Number(params[Number(limitMatch[1]) - 1]) : Infinity;
      return Array.from({ length: Math.min(clickRowCount, limit) }, (_, index) => makeRow(index));
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
  return { clickQueries };
}

function loadReport(query) {
  return handler({
    httpMethod: 'GET',
    rawUrl: `https://gematria.today/api/admin-click-tracking?${query}`,
    headers: { cookie: 'gematria_admin_session=admin-token' },
  });
}

test('the click query is bounded and a window with more events is reported as truncated', async () => {
  // The 365-day window used to read and return every matching row.
  const { clickQueries } = installFakeDatabase({ clickRowCount: CLICK_TRACKING_ROW_LIMIT + 250 });

  const response = await loadReport('days=365');
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(clickQueries.length, 1);
  assert.match(clickQueries[0].query, /ORDER BY created_at DESC\s+LIMIT \$\d+/);
  assert.equal(body.clickTrackingDetails.length, CLICK_TRACKING_ROW_LIMIT);
  assert.equal(body.truncated, true);
  assert.equal(body.clickTrackingDetails[0].source, 'Button 0');
});

test('a window that fits is returned whole and not marked truncated', async () => {
  installFakeDatabase({ clickRowCount: 3 });

  const response = await loadReport('days=7');
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.clickTrackingDetails.length, 3);
  assert.equal(body.truncated, false);
});

test('a stored audienceType decides the audience over caller-sent member flags', async () => {
  const { clickQueries } = installFakeDatabase({ clickRowCount: 0 });

  await loadReport('days=30');

  const audienceCase = clickQueries[0].query.slice(clickQueries[0].query.indexOf('CASE'), clickQueries[0].query.indexOf('END AS audience_type'));
  const visitorWhenAudienceSet = audienceCase.indexOf("metadata->>'audienceType'), ''), '') <> '' THEN 'visitor'");
  assert.notEqual(visitorWhenAudienceSet, -1);
  assert.ok(visitorWhenAudienceSet < audienceCase.indexOf("metadata->>'memberId'"));
  assert.ok(visitorWhenAudienceSet < audienceCase.indexOf("metadata->>'authenticated'"));
});

test('rows of quote-filled values cannot push the serialized response past the 6 MB limit', async () => {
  // A v1 function's 6,291,556-byte limit applies to the serialized
  // {statusCode, headers, body} object, where every quote and backslash in the
  // body is escaped a second time. Forged rows from public-button-report can
  // fill each text field with 200 quotes, which doubles their size there.
  const NETLIFY_RESPONSE_LIMIT_BYTES = 6_291_556;
  const quotes = '"'.repeat(200);
  const forgedRow = (index) => ({
    ...clickRow(index),
    route: quotes,
    source: `${index}${quotes}`,
    destination: quotes,
    element_type: quotes,
    element_id: quotes,
    element_selector: quotes,
    element_link: quotes,
    page_path: quotes,
    page_url: quotes,
    referrer: '\\'.repeat(200),
  });
  installFakeDatabase({ clickRowCount: CLICK_TRACKING_ROW_LIMIT, makeRow: forgedRow });

  const response = await loadReport('days=365');
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.truncated, true);
  assert.ok(body.clickTrackingDetails.length > 0);
  assert.ok(body.clickTrackingDetails[0].source.startsWith('0"'), 'the newest rows are the ones kept');
  const serializedBytes = Buffer.byteLength(JSON.stringify(response));
  assert.ok(serializedBytes < NETLIFY_RESPONSE_LIMIT_BYTES, `serialized response is ${serializedBytes} bytes`);
});
