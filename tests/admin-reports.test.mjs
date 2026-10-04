import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { resolveAuditWindow, selectRecentWordRows } from '../netlify/functions/admin-reports.mjs';
import { runStats } from '../netlify/functions/member-premium-research.mjs';

const FUNCTIONS_DIR = new URL('../netlify/functions/', import.meta.url);
const REPORTS_SOURCE = readFileSync(new URL('admin-reports.mjs', FUNCTIONS_DIR), 'utf8');
const REPORTS_SCRIPT = readFileSync(new URL('../page-scripts/admin-reports-1.js', import.meta.url), 'utf8');

// The same client that production uses: @neondatabase/serverless 0.9.x hands
// back a tagged-template function with no `unsafe` helper on it.
function createFakeSql(respond = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    assert.ok(Array.isArray(strings) && Array.isArray(strings.raw), 'sql must be called as a tagged template');
    const query = strings.join('$?').replace(/\s+/g, ' ').trim();
    calls.push({ query, values });
    return Promise.resolve(respond(query, values));
  };
  return { sql, calls };
}

// ---------- recent words (sql.unsafe does not exist in neon 0.9.x) ----------

test('no function calls sql.unsafe, which @neondatabase/serverless 0.9.x does not provide', () => {
  const offenders = readdirSync(FUNCTIONS_DIR)
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) => /\bsql\.unsafe\s*\(/.test(readFileSync(join(FUNCTIONS_DIR.pathname, name), 'utf8')));
  assert.deepEqual(offenders, []);
});

test('admin reports orders recent words by updated_at when the words table has it', async () => {
  const { sql, calls } = createFakeSql(() => [{ word: 'light', updated_at: '2026-01-01T00:00:00Z' }]);
  const rows = await selectRecentWordRows(sql, new Set(['word', 'created_at', 'updated_at']));
  assert.equal(rows.length, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /SELECT word, gematria_value, digital_root, search_count, updated_at FROM words ORDER BY updated_at DESC NULLS LAST LIMIT 50/);
  assert.deepEqual(calls[0].values, []);
});

test('admin reports falls back to created_at, aliased as updated_at', async () => {
  const { sql, calls } = createFakeSql();
  await selectRecentWordRows(sql, new Set(['word', 'created_at']));
  assert.match(calls[0].query, /created_at AS updated_at FROM words ORDER BY created_at DESC NULLS LAST/);
});

test('admin reports orders by search count when the words table has no timestamp', async () => {
  const { sql, calls } = createFakeSql();
  await selectRecentWordRows(sql, new Set(['word']));
  assert.match(calls[0].query, /NULL::timestamptz AS updated_at FROM words ORDER BY search_count DESC/);
});

test('premium research stats load when the words table has a created_at column', async () => {
  const { sql, calls } = createFakeSql((query) => {
    if (/information_schema\.columns/.test(query)) return [{ column_name: 'word' }, { column_name: 'created_at' }];
    if (/COUNT\(\*\)::int AS total_words/.test(query)) return [{ total_words: 4, base_root_count: 1, digital_root_six_count: 2 }];
    if (/AS timestamp/.test(query)) {
      return [{ word: 'light', gematria_value: 312, digital_root: 6, is_base_root: true, search_count: 3, timestamp: '2026-01-01T00:00:00Z' }];
    }
    return [];
  });
  const stats = await runStats(sql);
  assert.equal(stats.totals.totalWords, 4);
  assert.equal(stats.metadata.recentTimestampColumn, 'created_at');
  assert.deepEqual(stats.recentWords.map((row) => [row.word, row.gematriaValue, row.timestamp]), [['light', 312, '2026-01-01T00:00:00Z']]);
  assert.ok(calls.some((call) => /created_at AS timestamp FROM words ORDER BY created_at DESC NULLS LAST LIMIT 12/.test(call.query)));
});

test('premium research stats use updated_at when that is the only timestamp column', async () => {
  const { sql, calls } = createFakeSql((query) => (/information_schema\.columns/.test(query) ? [{ column_name: 'updated_at' }] : []));
  const stats = await runStats(sql);
  assert.equal(stats.metadata.recentTimestampColumn, 'updated_at');
  assert.ok(calls.some((call) => /updated_at AS timestamp FROM words ORDER BY updated_at DESC NULLS LAST/.test(call.query)));
});

test('premium research stats skip the recent-words query when there is no timestamp column', async () => {
  const { sql, calls } = createFakeSql((query) => (/information_schema\.columns/.test(query) ? [{ column_name: 'word' }] : []));
  const stats = await runStats(sql);
  assert.deepEqual(stats.recentWords, []);
  assert.ok(!calls.some((call) => /AS timestamp/.test(call.query)));
});

// ---------- unique visitors ----------

test('unique visitor counts do not use the per-route request fingerprint', () => {
  // request_fingerprint hashes ip, user agent, path and route, so one person
  // browsing several pages counted as several visitors.
  assert.doesNotMatch(REPORTS_SOURCE, /COUNT\(DISTINCT request_fingerprint\)/);
  const visitorKey = "COALESCE(ip_address, '') || '|' || COALESCE(metadata->>'userAgent', '')";
  const funnel = REPORTS_SOURCE.slice(REPORTS_SOURCE.indexOf('unique_visitors AS ('), REPORTS_SOURCE.indexOf('free_memberships AS ('));
  assert.ok(funnel.includes(`COUNT(DISTINCT ${visitorKey})`), 'the conversion funnel must count distinct ip + user agent');
  assert.ok(REPORTS_SOURCE.includes(`COUNT(DISTINCT ${visitorKey})::int AS unique_visitors`), 'the site traffic summary must count distinct ip + user agent');
  assert.ok(REPORTS_SOURCE.includes(`${visitorKey} AS visitor_key`), 'page-view and click breakdowns must count the same visitor key');
});

// ---------- report window vs audit-log retention ----------

test('resolveAuditWindow clamps day windows to the audit-log retention period', () => {
  assert.deepEqual(resolveAuditWindow({ days: 365, hours: null }, 30), { days: 30, hours: null, interval: '30 days', clamped: true });
  assert.deepEqual(resolveAuditWindow({ days: 90, hours: null }, 30), { days: 30, hours: null, interval: '30 days', clamped: true });
  assert.deepEqual(resolveAuditWindow({ days: 30, hours: null }, 30), { days: 30, hours: null, interval: '30 days', clamped: false });
  assert.deepEqual(resolveAuditWindow({ days: 7, hours: null }, 30), { days: 7, hours: null, interval: '7 days', clamped: false });
  assert.deepEqual(resolveAuditWindow({ days: 365, hours: null }, 400), { days: 365, hours: null, interval: '365 days', clamped: false });
});

test('resolveAuditWindow leaves hour windows alone', () => {
  assert.deepEqual(resolveAuditWindow({ days: null, hours: 1 }, 30), { days: null, hours: 1, interval: '1 hours', clamped: false });
});

test('the conversion funnel counts visitors and signups over the same clamped window', () => {
  const funnel = REPORTS_SOURCE.slice(REPORTS_SOURCE.indexOf('WITH conversion_window AS ('), REPORTS_SOURCE.indexOf('unique_visitors AS ('));
  assert.match(funnel, /NOW\(\) - \$\{auditWindowInterval\}::interval AS starts_at/);
  // Every request_audit_log query is bounded by the clamped window.
  const auditWindows = [...REPORTS_SOURCE.matchAll(/FROM request_audit_log\s+WHERE created_at >= NOW\(\) - \$\{(\w+)\}/g)].map((match) => match[1]);
  assert.ok(auditWindows.length >= 5);
  assert.deepEqual([...new Set(auditWindows)], ['auditWindowInterval']);
  assert.match(REPORTS_SCRIPT, /auditWindow\.clamped/);
});

// ---------- detail modal formatting ----------

function loadFormatCellValue() {
  const start = REPORTS_SCRIPT.indexOf('const DATE_FIELD_PATTERN');
  const end = REPORTS_SCRIPT.indexOf('function escapeHtml');
  assert.ok(start !== -1 && end > start, 'formatCellValue not found in the reports page script');
  const context = vm.createContext({});
  vm.runInContext(`${REPORTS_SCRIPT.slice(start, end)}\nthis.formatCellValue = formatCellValue;`, context);
  return context.formatCellValue;
}

test('the detail modal shows the gematria value as a number, not a 1969 date', () => {
  const formatCellValue = loadFormatCellValue();
  assert.equal(formatCellValue('gematriaValue', 312), '312');
  assert.equal(formatCellValue('digitalRoot', 6), '6');
  assert.equal(formatCellValue('searchCount', 3), '3');
  assert.equal(formatCellValue('status', 'active'), 'active');
});

test('the detail modal still formats date fields', () => {
  const formatCellValue = loadFormatCellValue();
  const iso = '2026-01-02T03:04:05.000Z';
  const expected = new Date(iso).toLocaleString();
  for (const key of ['createdAt', 'updatedAt', 'membershipExpiresAt', 'publishedAt', 'dueDate']) {
    assert.equal(formatCellValue(key, iso), expected, key);
  }
});
