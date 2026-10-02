import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BADGE_DEFINITIONS,
  EVENT_BADGE_DEFINITIONS,
  LEARNING_PATH_BADGE_SLUG,
  ensureLearningPathBadgeIfCompleted,
  findBadgeHolderByUsername,
  getBadgeDefinition,
  recordGematriaNumberSearch,
  recordWordSearchActivity,
} from '../netlify/functions/_badges.mjs';

const VALID_METRICS = new Set([
  'searches_total',
  'gematria_searches_total',
  'words_contributed',
  'base_root_finds',
]);

const VALID_CATEGORIES = new Set(['searches', 'gematria', 'contributions', 'discoveries']);

// ---------- BADGE_DEFINITIONS structural integrity ----------

test('every BADGE_DEFINITIONS entry has the required keys with the right types', () => {
  for (const badge of BADGE_DEFINITIONS) {
    assert.equal(typeof badge.slug, 'string');
    assert.ok(badge.slug.length > 0, 'slug must be non-empty');
    assert.equal(typeof badge.name, 'string');
    assert.ok(badge.name.length > 0, 'name must be non-empty');
    assert.equal(typeof badge.description, 'string');
    assert.equal(typeof badge.category, 'string');
    assert.equal(typeof badge.metric, 'string');
    assert.equal(typeof badge.threshold, 'number');
    assert.ok(Number.isInteger(badge.threshold) && badge.threshold > 0);
    assert.equal(typeof badge.tier, 'number');
    assert.ok(Number.isInteger(badge.tier) && badge.tier > 0);
  }
});

test('badge slugs are globally unique', () => {
  const slugs = BADGE_DEFINITIONS.map((b) => b.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('badge metric values reference a real member_search_stats column', () => {
  for (const badge of BADGE_DEFINITIONS) {
    assert.ok(
      VALID_METRICS.has(badge.metric),
      `badge ${badge.slug} references unknown metric ${badge.metric}`,
    );
  }
});

test('badge category values are from the known set', () => {
  for (const badge of BADGE_DEFINITIONS) {
    assert.ok(
      VALID_CATEGORIES.has(badge.category),
      `badge ${badge.slug} references unknown category ${badge.category}`,
    );
  }
});

test('thresholds within a metric increase monotonically by tier', () => {
  // Group badges by metric, sort by tier, and check thresholds are strictly increasing.
  const byMetric = new Map();
  for (const badge of BADGE_DEFINITIONS) {
    if (!byMetric.has(badge.metric)) byMetric.set(badge.metric, []);
    byMetric.get(badge.metric).push(badge);
  }
  for (const [metric, badges] of byMetric) {
    badges.sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < badges.length; i += 1) {
      assert.ok(
        badges[i].threshold > badges[i - 1].threshold,
        `${metric}: tier ${badges[i].tier} threshold (${badges[i].threshold}) must exceed tier ${badges[i - 1].tier} (${badges[i - 1].threshold})`,
      );
    }
  }
});

test('tier numbers within a metric form a contiguous 1..N sequence', () => {
  const byMetric = new Map();
  for (const badge of BADGE_DEFINITIONS) {
    if (!byMetric.has(badge.metric)) byMetric.set(badge.metric, []);
    byMetric.get(badge.metric).push(badge);
  }
  for (const [metric, badges] of byMetric) {
    const tiers = badges.map((b) => b.tier).sort((a, b) => a - b);
    for (let i = 0; i < tiers.length; i += 1) {
      assert.equal(
        tiers[i],
        i + 1,
        `${metric}: tier sequence has a gap at index ${i} (got ${tiers[i]})`,
      );
    }
  }
});

// ---------- getBadgeDefinition ----------

test('getBadgeDefinition returns the matching definition for a known slug', () => {
  const def = getBadgeDefinition('seeker-1');
  assert.ok(def);
  assert.equal(def.slug, 'seeker-1');
  assert.equal(def.metric, 'searches_total');
});

test('getBadgeDefinition returns null for an unknown slug', () => {
  assert.equal(getBadgeDefinition('nope'), null);
  assert.equal(getBadgeDefinition(''), null);
  assert.equal(getBadgeDefinition(undefined), null);
});

// ---------- recordWordSearchActivity / recordGematriaNumberSearch ----------

test('recordWordSearchActivity returns the empty envelope without calling SQL when userId is missing', async () => {
  let sqlCalled = false;
  const sql = () => { sqlCalled = true; return Promise.resolve([]); };
  const result = await recordWordSearchActivity(sql, null, { wasNewWord: true });
  assert.deepEqual(result.newBadges, []);
  assert.equal(result.stats.searches_total, 0);
  assert.equal(sqlCalled, false);
});

test('recordGematriaNumberSearch returns the empty envelope without calling SQL when userId is missing', async () => {
  let sqlCalled = false;
  const sql = () => { sqlCalled = true; return Promise.resolve([]); };
  const result = await recordGematriaNumberSearch(sql, '');
  assert.deepEqual(result.newBadges, []);
  assert.equal(result.stats.searches_total, 0);
  assert.equal(sqlCalled, false);
});

test('recordWordSearchActivity swallows SQL errors and returns the empty envelope', async () => {
  // Use a unique userId so the badge-schema cache key is irrelevant.
  // The SQL mock throws on the very first call.
  const failingSql = () => Promise.reject(new Error('connection refused'));
  const result = await recordWordSearchActivity(failingSql, 'user-1', { wasNewWord: false });
  // Despite the SQL failure, the helper must NOT propagate the error — the
  // calculator response must still succeed even if the badge ledger is down.
  assert.deepEqual(result.newBadges, []);
  assert.equal(result.stats.searches_total, 0);
});

test('recordGematriaNumberSearch swallows SQL errors and returns the empty envelope', async () => {
  const failingSql = () => Promise.reject(new Error('connection refused'));
  const result = await recordGematriaNumberSearch(failingSql, 'user-2');
  assert.deepEqual(result.newBadges, []);
  assert.equal(result.stats.gematria_searches_total, 0);
});

// ---------- EVENT_BADGE_DEFINITIONS / learning-path badge ----------

test('EVENT_BADGE_DEFINITIONS contains the beginner-path-graduate badge with the required shape', () => {
  const badge = EVENT_BADGE_DEFINITIONS.find((b) => b.slug === LEARNING_PATH_BADGE_SLUG);
  assert.ok(badge, 'learning-path badge must exist');
  assert.equal(typeof badge.name, 'string');
  assert.ok(badge.name.length > 0);
  assert.equal(typeof badge.description, 'string');
  assert.equal(badge.category, 'learning_path');
  assert.equal(typeof badge.tier, 'number');
});

test('event badge slugs do not collide with metric-based badge slugs', () => {
  const metricSlugs = new Set(BADGE_DEFINITIONS.map((b) => b.slug));
  for (const badge of EVENT_BADGE_DEFINITIONS) {
    assert.equal(metricSlugs.has(badge.slug), false, `event slug ${badge.slug} collides with metric badge`);
  }
});

test('getBadgeDefinition resolves the learning-path event badge by slug', () => {
  const def = getBadgeDefinition(LEARNING_PATH_BADGE_SLUG);
  assert.ok(def);
  assert.equal(def.slug, LEARNING_PATH_BADGE_SLUG);
  assert.equal(def.category, 'learning_path');
});

// ---------- ensureLearningPathBadgeIfCompleted ----------

function createMockSql(respondWith) {
  const calls = [];
  function sql(strings, ...values) {
    const query = strings.join('?');
    calls.push({ query, values });
    return Promise.resolve(respondWith({ query, values }) ?? []);
  }
  return { sql, calls };
}

test('ensureLearningPathBadgeIfCompleted returns null without touching SQL when userId is missing', async () => {
  let sqlCalled = false;
  const sql = () => { sqlCalled = true; return Promise.resolve([]); };
  const result = await ensureLearningPathBadgeIfCompleted(sql, null);
  assert.equal(result, null);
  assert.equal(sqlCalled, false);
});

test('ensureLearningPathBadgeIfCompleted inserts gated on learningPathCompletedAt and returns the formatted badge', async () => {
  const earnedAt = '2026-05-23T10:00:00Z';
  const { sql, calls } = createMockSql(({ query }) => {
    if (/INSERT INTO member_badges/.test(query)) {
      return [{ badge_slug: LEARNING_PATH_BADGE_SLUG, earned_at: earnedAt }];
    }
    return [];
  });

  const result = await ensureLearningPathBadgeIfCompleted(sql, 'user-42');
  const insertCall = calls.find((c) => /INSERT INTO member_badges/.test(c.query));
  assert.ok(insertCall, 'must issue an INSERT into member_badges');
  assert.match(insertCall.query, /ON CONFLICT \(user_id, badge_slug\) DO NOTHING/);
  assert.match(insertCall.query, /preferences \? 'learningPathCompletedAt'/);
  assert.ok(insertCall.values.includes(LEARNING_PATH_BADGE_SLUG));
  assert.ok(insertCall.values.includes('user-42'));
  assert.equal(result?.slug, LEARNING_PATH_BADGE_SLUG);
  assert.equal(result?.earnedAt, earnedAt);
});

test('ensureLearningPathBadgeIfCompleted returns null when the user has not completed the path (no rows inserted)', async () => {
  const { sql } = createMockSql(() => []);
  const result = await ensureLearningPathBadgeIfCompleted(sql, 'user-1');
  assert.equal(result, null);
});

test('ensureLearningPathBadgeIfCompleted swallows SQL errors and returns null', async () => {
  const failingSql = () => Promise.reject(new Error('connection refused'));
  const result = await ensureLearningPathBadgeIfCompleted(failingSql, 'user-1');
  assert.equal(result, null);
});

// ---------- findBadgeHolderByUsername ----------

test('findBadgeHolderByUsername returns the matching row, or null when there is none', async () => {
  const row = { username: 'kevin', display_name: 'Kevin', earned_at: '2026-05-23T10:00:00Z' };
  const hit = createMockSql(() => [row]);
  assert.deepEqual(await findBadgeHolderByUsername(hit.sql, 'kevin', LEARNING_PATH_BADGE_SLUG), row);
  assert.ok(hit.calls[0].values.includes('kevin'));
  assert.ok(hit.calls[0].values.includes(LEARNING_PATH_BADGE_SLUG));

  const miss = createMockSql(() => []);
  assert.equal(await findBadgeHolderByUsername(miss.sql, 'kevin', LEARNING_PATH_BADGE_SLUG), null);
});

test('findBadgeHolderByUsername never lets a case twin answer for another member', async () => {
  // Usernames were only unique case-sensitively and this lookup folded case
  // with LIMIT 1 and no ORDER BY, so a "Kevin" account could take over kevin's
  // /b/ share page and card. An exact match must win, and a case-folded match
  // only counts when no other account has that name in any case.
  const { sql, calls } = createMockSql(() => []);
  await findBadgeHolderByUsername(sql, 'kevin', LEARNING_PATH_BADGE_SLUG);
  const query = calls[0].query.replace(/\s+/g, ' ');
  assert.match(query, /WHERE LOWER\(u\.username\) = LOWER\(\?\)/);
  assert.match(query, /u\.username = \? OR NOT EXISTS \( SELECT 1 FROM users twin WHERE LOWER\(twin\.username\) = LOWER\(\?\) AND twin\.id <> u\.id \)/);
});

test('every public badge route resolves the username through findBadgeHolderByUsername', () => {
  for (const route of ['public-badge.mjs', 'badge-share.mjs', 'badge-share-image.mjs']) {
    const source = readFileSync(new URL(`../netlify/functions/${route}`, import.meta.url), 'utf8');
    assert.match(source, /findBadgeHolderByUsername\(sql, username, slug\)/, `${route} must use the shared lookup`);
    assert.doesNotMatch(source, /LOWER\(u\.username\)/, `${route} must not fold case on its own`);
  }
});
