import crypto from 'node:crypto';

let badgeSchemaReadyPromise = null;

export async function ensureBadgeSchema(sql) {
  if (badgeSchemaReadyPromise) {
    return badgeSchemaReadyPromise;
  }

  badgeSchemaReadyPromise = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS member_search_stats (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      searches_total INTEGER NOT NULL DEFAULT 0,
      gematria_searches_total INTEGER NOT NULL DEFAULT 0,
      words_contributed INTEGER NOT NULL DEFAULT 0,
      base_root_finds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS member_badges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_slug TEXT NOT NULL,
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    await sql`CREATE UNIQUE INDEX IF NOT EXISTS member_badges_user_slug_idx
      ON member_badges (user_id, badge_slug)`;

    await sql`CREATE INDEX IF NOT EXISTS member_badges_user_earned_idx
      ON member_badges (user_id, earned_at DESC)`;
  })();

  try {
    await badgeSchemaReadyPromise;
  } catch (error) {
    badgeSchemaReadyPromise = null;
    throw error;
  }
}

export const BADGE_DEFINITIONS = [
  { slug: 'seeker-1', name: 'Seeker I', description: 'Performed 5 word lookups.', category: 'searches', metric: 'searches_total', threshold: 5, tier: 1 },
  { slug: 'seeker-2', name: 'Seeker II', description: 'Performed 50 word lookups.', category: 'searches', metric: 'searches_total', threshold: 50, tier: 2 },
  { slug: 'seeker-3', name: 'Seeker III', description: 'Performed 500 word lookups.', category: 'searches', metric: 'searches_total', threshold: 500, tier: 3 },
  { slug: 'seeker-4', name: 'Seeker IV', description: 'Performed 5,000 word lookups.', category: 'searches', metric: 'searches_total', threshold: 5000, tier: 4 },

  { slug: 'pioneer-1', name: 'Pioneer I', description: 'Added your first new word to the dataset.', category: 'contributions', metric: 'words_contributed', threshold: 1, tier: 1 },
  { slug: 'pioneer-2', name: 'Pioneer II', description: 'Contributed 10 new words to the dataset.', category: 'contributions', metric: 'words_contributed', threshold: 10, tier: 2 },
  { slug: 'pioneer-3', name: 'Pioneer III', description: 'Contributed 100 new words to the dataset.', category: 'contributions', metric: 'words_contributed', threshold: 100, tier: 3 },

  { slug: 'base-root-hunter-1', name: 'Base Root Hunter I', description: 'Discovered a base-root word.', category: 'discoveries', metric: 'base_root_finds', threshold: 1, tier: 1 },
  { slug: 'base-root-hunter-2', name: 'Base Root Hunter II', description: 'Discovered 10 base-root words.', category: 'discoveries', metric: 'base_root_finds', threshold: 10, tier: 2 },

  { slug: 'gematrist-1', name: 'Gematrist I', description: 'Ran 10 gematria-value searches.', category: 'gematria', metric: 'gematria_searches_total', threshold: 10, tier: 1 },
  { slug: 'gematrist-2', name: 'Gematrist II', description: 'Ran 100 gematria-value searches.', category: 'gematria', metric: 'gematria_searches_total', threshold: 100, tier: 2 },
];

const BADGES_BY_SLUG = new Map(BADGE_DEFINITIONS.map((badge) => [badge.slug, badge]));

export function getBadgeDefinition(slug) {
  return BADGES_BY_SLUG.get(slug) || null;
}

function emptyStatsRow() {
  return {
    searches_total: 0,
    gematria_searches_total: 0,
    words_contributed: 0,
    base_root_finds: 0,
  };
}

function matchesMetric(statsRow, metric, threshold) {
  return Number(statsRow?.[metric] || 0) >= Number(threshold);
}

async function awardEarnedBadges(sql, userId, statsRow) {
  const eligible = BADGE_DEFINITIONS.filter((badge) => matchesMetric(statsRow, badge.metric, badge.threshold));
  if (!eligible.length) return [];

  const inserted = [];
  for (const badge of eligible) {
    const rows = await sql`
      INSERT INTO member_badges (id, user_id, badge_slug)
      VALUES (${crypto.randomUUID()}, ${userId}, ${badge.slug})
      ON CONFLICT (user_id, badge_slug) DO NOTHING
      RETURNING badge_slug, earned_at
    `;
    if (rows.length) {
      inserted.push({
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        tier: badge.tier,
        earnedAt: rows[0].earned_at,
      });
    }
  }
  return inserted;
}

async function upsertSearchStats(sql, userId, deltas) {
  const {
    searchesTotal = 0,
    gematriaSearchesTotal = 0,
    wordsContributed = 0,
    baseRootFinds = 0,
  } = deltas;

  const rows = await sql`
    INSERT INTO member_search_stats (
      user_id,
      searches_total,
      gematria_searches_total,
      words_contributed,
      base_root_finds,
      updated_at
    )
    VALUES (
      ${userId},
      ${searchesTotal},
      ${gematriaSearchesTotal},
      ${wordsContributed},
      ${baseRootFinds},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      searches_total = member_search_stats.searches_total + ${searchesTotal},
      gematria_searches_total = member_search_stats.gematria_searches_total + ${gematriaSearchesTotal},
      words_contributed = member_search_stats.words_contributed + ${wordsContributed},
      base_root_finds = member_search_stats.base_root_finds + ${baseRootFinds},
      updated_at = NOW()
    RETURNING searches_total, gematria_searches_total, words_contributed, base_root_finds
  `;

  return rows[0] || emptyStatsRow();
}

async function safelyRecord(sql, userId, deltas) {
  await ensureBadgeSchema(sql);
  const statsRow = await upsertSearchStats(sql, userId, deltas);
  const newBadges = await awardEarnedBadges(sql, userId, statsRow);
  return { stats: statsRow, newBadges };
}

export async function recordWordSearchActivity(sql, userId, { wasNewWord, isBaseRoot } = {}) {
  if (!userId) return { stats: emptyStatsRow(), newBadges: [] };
  try {
    return await safelyRecord(sql, userId, {
      searchesTotal: 1,
      wordsContributed: wasNewWord ? 1 : 0,
      baseRootFinds: (wasNewWord && isBaseRoot) ? 1 : 0,
    });
  } catch (error) {
    console.warn('[badges] recordWordSearchActivity failed', { userId, error: error.message });
    return { stats: emptyStatsRow(), newBadges: [] };
  }
}

export async function recordGematriaNumberSearch(sql, userId) {
  if (!userId) return { stats: emptyStatsRow(), newBadges: [] };
  try {
    return await safelyRecord(sql, userId, {
      gematriaSearchesTotal: 1,
    });
  } catch (error) {
    console.warn('[badges] recordGematriaNumberSearch failed', { userId, error: error.message });
    return { stats: emptyStatsRow(), newBadges: [] };
  }
}

function formatBadgeSummary(slug, earnedAt) {
  const def = BADGES_BY_SLUG.get(slug);
  if (!def) return null;
  return {
    slug: def.slug,
    name: def.name,
    description: def.description,
    category: def.category,
    tier: def.tier,
    earnedAt,
  };
}

function progressForMetric(statsRow, metric) {
  const tiers = BADGE_DEFINITIONS.filter((badge) => badge.metric === metric).sort((a, b) => a.threshold - b.threshold);
  const current = Number(statsRow?.[metric] || 0);
  const nextTier = tiers.find((tier) => current < tier.threshold) || null;
  return {
    metric,
    current,
    nextThreshold: nextTier ? nextTier.threshold : null,
    nextBadgeSlug: nextTier ? nextTier.slug : null,
    nextBadgeName: nextTier ? nextTier.name : null,
  };
}

export async function getUserBadgeData(sql, userId) {
  await ensureBadgeSchema(sql);

  const [statsRows, badgeRows] = await Promise.all([
    sql`
      SELECT searches_total, gematria_searches_total, words_contributed, base_root_finds
      FROM member_search_stats
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT badge_slug, earned_at
      FROM member_badges
      WHERE user_id = ${userId}
      ORDER BY earned_at DESC
    `,
  ]);

  const stats = statsRows[0] || emptyStatsRow();
  const earnedBadges = badgeRows
    .map((row) => formatBadgeSummary(row.badge_slug, row.earned_at))
    .filter(Boolean);

  const progress = ['searches_total', 'words_contributed', 'base_root_finds', 'gematria_searches_total']
    .map((metric) => progressForMetric(stats, metric));

  return {
    stats: {
      searchesTotal: Number(stats.searches_total || 0),
      gematriaSearchesTotal: Number(stats.gematria_searches_total || 0),
      wordsContributed: Number(stats.words_contributed || 0),
      baseRootFinds: Number(stats.base_root_finds || 0),
    },
    earnedBadges,
    progress,
  };
}

export async function getEarnedBadgeNamesForUserIds(sql, userIds) {
  const unique = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  await ensureBadgeSchema(sql);

  const rows = await sql`
    SELECT user_id, badge_slug
    FROM member_badges
    WHERE user_id = ANY(${unique})
  `;

  const map = new Map();
  for (const row of rows) {
    const def = BADGES_BY_SLUG.get(row.badge_slug);
    if (!def) continue;
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push(def.name);
  }
  return map;
}
