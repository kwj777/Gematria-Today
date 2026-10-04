import { getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { applyRateLimit, assertEndpointEnabled, fetchWithTimeout, getClientIp, getProtectionConfig, logRequestAudit } from './_security.mjs';
import { MAX_GEMATRIA_VALUE, parseGematriaValue } from './_words.mjs';

const ALLOWED_RELATIONSHIP_TYPES = new Set(['antonym', 'synonym', 'equivalent', 'cross-reference', 'hypernym', 'hyponym', 'variant', 'same-context']);

function parseAction(event) {
  const searchParams = new URL(event.rawUrl || `https://example.com${event.path || ''}`).searchParams;
  return String(searchParams.get('action') || 'stats').trim().toLowerCase();
}

function parseWordnikParams(event) {
  const searchParams = new URL(event.rawUrl || `https://example.com${event.path || ''}`).searchParams;
  const word = String(searchParams.get('word') || '').trim();
  const relationshipType = String(searchParams.get('relationshipType') || 'antonym').trim().toLowerCase();
  const limitValue = Number.parseInt(String(searchParams.get('limit') || '60'), 10);
  const limit = Number.isInteger(limitValue) ? limitValue : 60;
  return { word, relationshipType, limit };
}

function parseGematriaParams(event) {
  const searchParams = new URL(event.rawUrl || `https://example.com${event.path || ''}`).searchParams;
  const value = String(searchParams.get('gematria') || '').trim();
  return { value };
}

function buildWordnikUrl(word, relationshipType, limit) {
  const baseUrl = process.env.WORDNIK_BASE_URL;
  const apiKey = process.env.WORDNIK_API_KEY;
  if (!baseUrl) throw Object.assign(new Error('Missing WORDNIK_BASE_URL environment variable'), { statusCode: 500 });
  if (!apiKey) throw Object.assign(new Error('Missing WORDNIK_API_KEY environment variable'), { statusCode: 500 });

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(`${encodeURIComponent(word)}/relatedWords`, normalizedBaseUrl);
  url.searchParams.set('useCanonical', 'false');
  url.searchParams.set('relationshipTypes', relationshipType);
  url.searchParams.set('limitPerRelationshipType', String(limit));
  url.searchParams.set('api_key', apiKey);
  return url;
}

async function runWordnikLookup(sql, event) {
  const { word, relationshipType, limit } = parseWordnikParams(event);
  if (!word) throw Object.assign(new Error('Missing required query parameter: word'), { statusCode: 400 });
  if (!ALLOWED_RELATIONSHIP_TYPES.has(relationshipType)) {
    throw Object.assign(new Error(`relationshipType must be one of: ${Array.from(ALLOWED_RELATIONSHIP_TYPES).join(', ')}`), { statusCode: 400 });
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 250) {
    throw Object.assign(new Error('limit must be a positive integer between 1 and 250'), { statusCode: 400 });
  }

  const url = buildWordnikUrl(word.toLowerCase(), relationshipType, limit);
  const response = await fetchWithTimeout(url, {}, getProtectionConfig().wordnikTimeoutMs);
  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 404) {
      return { word, relationshipType, results: [], count: 0, message: 'No related words found.' };
    }
    throw Object.assign(new Error(`Wordnik request failed with ${response.status}: ${errorText || response.statusText}`), { statusCode: 502 });
  }

  const payload = await response.json();
  const matchingGroup = Array.isArray(payload)
    ? payload.find((entry) => String(entry.relationshipType || '').toLowerCase() === relationshipType)
    : null;

  const results = Array.isArray(matchingGroup?.words) ? matchingGroup.words : [];
  return {
    word,
    relationshipType,
    count: results.length,
    results,
  };
}

async function runGematriaLookup(sql, event) {
  const { value } = parseGematriaParams(event);
  if (!value) throw Object.assign(new Error('Missing required query parameter: gematria'), { statusCode: 400 });
  if (!/^\d+$/.test(value)) throw Object.assign(new Error('gematria must be a positive integer'), { statusCode: 400 });

  const gematriaValue = parseGematriaValue(value);
  if (gematriaValue === null) {
    throw Object.assign(new Error(`gematria must be no larger than ${MAX_GEMATRIA_VALUE}`), { statusCode: 400 });
  }
  if (gematriaValue % 6 !== 0) {
    throw Object.assign(new Error('gematria must be a multiple of 6'), { statusCode: 400 });
  }

  const rows = await sql`
    SELECT word, gematria_value, digital_root, is_base_root, search_count
    FROM words
    WHERE gematria_value = ${gematriaValue}
    ORDER BY LOWER(word) ASC
    LIMIT 500
  `;

  return {
    gematria: gematriaValue,
    count: rows.length,
    words: rows.map((row) => ({
      word: row.word,
      gematriaValue: Number(row.gematria_value),
      digitalRoot: Number(row.digital_root),
      isBaseRoot: Boolean(row.is_base_root),
      searchCount: Number(row.search_count),
    })),
  };
}

// The words table does not guarantee a timestamp column, so the column is
// probed at runtime. It cannot be interpolated into the query: @neondatabase/
// serverless 0.9.x has no sql.unsafe, and a tagged-template value is sent as a
// bind parameter, never as an identifier. Each column gets its own fixed query.
function selectRecentWords(sql, timestampColumn) {
  if (timestampColumn === 'created_at') {
    return sql`
      SELECT word, gematria_value, digital_root, is_base_root, search_count, created_at AS timestamp
      FROM words
      ORDER BY created_at DESC NULLS LAST
      LIMIT 12
    `;
  }
  if (timestampColumn === 'updated_at') {
    return sql`
      SELECT word, gematria_value, digital_root, is_base_root, search_count, updated_at AS timestamp
      FROM words
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 12
    `;
  }
  return Promise.resolve([]);
}

export async function runStats(sql) {
  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = CURRENT_SCHEMA()
      AND table_name = 'words'
  `;

  const columnNames = new Set(columns.map((column) => String(column.column_name)));
  const recentTimestampColumn = columnNames.has('created_at') ? 'created_at' : (columnNames.has('updated_at') ? 'updated_at' : null);

  const [aggregateRows, recentRows, topDigitalRootRows, baseRootSpotlightRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS total_words,
        COUNT(*) FILTER (WHERE is_base_root = TRUE)::int AS base_root_count,
        COUNT(*) FILTER (WHERE digital_root = 6)::int AS digital_root_six_count,
        COUNT(*) FILTER (WHERE is_base_root = TRUE AND digital_root = 6)::int AS base_root_and_digital_root_six_count,
        COUNT(*) FILTER (WHERE gematria_value % 6 = 0)::int AS multiples_of_six_count,
        SUM(search_count)::bigint AS total_search_count
      FROM words
    `,
    selectRecentWords(sql, recentTimestampColumn),
    sql`
      SELECT word, gematria_value, digital_root, is_base_root, search_count
      FROM words
      WHERE digital_root = 6
      ORDER BY search_count DESC, LOWER(word) ASC
      LIMIT 12
    `,
    sql`
      SELECT word, gematria_value, digital_root, search_count
      FROM words
      WHERE is_base_root = TRUE
      ORDER BY search_count DESC, gematria_value DESC
      LIMIT 6
    `,
  ]);

  const totals = aggregateRows[0] || {};
  const totalWords = Number(totals.total_words || 0);
  const baseRootCount = Number(totals.base_root_count || 0);
  const digitalRootSixCount = Number(totals.digital_root_six_count || 0);
  const bothCount = Number(totals.base_root_and_digital_root_six_count || 0);

  return {
    totals: {
      totalWords,
      baseRootCount,
      digitalRootSixCount,
      baseRootAndDigitalRootSixCount: bothCount,
      multiplesOfSixCount: Number(totals.multiples_of_six_count || 0),
      totalSearchCount: Number(totals.total_search_count || 0),
      baseRootPercentage: totalWords ? Number(((baseRootCount / totalWords) * 100).toFixed(2)) : 0,
      digitalRootSixPercentage: totalWords ? Number(((digitalRootSixCount / totalWords) * 100).toFixed(2)) : 0,
    },
    recentWords: recentRows.map((row) => ({
      word: row.word,
      gematriaValue: Number(row.gematria_value),
      digitalRoot: Number(row.digital_root),
      isBaseRoot: Boolean(row.is_base_root),
      searchCount: Number(row.search_count),
      timestamp: row.timestamp || null,
    })),
    topDigitalRootSixWords: topDigitalRootRows.map((row) => ({
      word: row.word,
      gematriaValue: Number(row.gematria_value),
      digitalRoot: Number(row.digital_root),
      isBaseRoot: Boolean(row.is_base_root),
      searchCount: Number(row.search_count),
    })),
    baseRootSpotlight: baseRootSpotlightRows.map((row) => ({
      word: row.word,
      gematriaValue: Number(row.gematria_value),
      digitalRoot: Number(row.digital_root),
      searchCount: Number(row.search_count),
    })),
    metadata: {
      recentTimestampColumn,
    },
  };
}

export async function handler(event) {
  try {
    assertEndpointEnabled({ publicRoute: false, expensive: true, route: 'member-premium-research' });
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    if (!member) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });

    const isPremium = member.membershipLevel === 'premium' || member.membershipLevel === 'lifetime';
    if (!isPremium) {
      throw Object.assign(new Error('Premium membership is required for this endpoint'), { statusCode: 403 });
    }

    await applyRateLimit(sql, event, {
      scope: 'member-premium-research',
      key: member.id || getClientIp(event),
      limit: 90,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many premium research requests. Please wait and try again.',
    });

    const action = parseAction(event);
    let payload;
    if (action === 'wordnik') {
      payload = await runWordnikLookup(sql, event);
    } else if (action === 'gematria') {
      payload = await runGematriaLookup(sql, event);
    } else if (action === 'stats') {
      payload = await runStats(sql);
    } else {
      throw Object.assign(new Error('Unsupported action. Use one of: stats, wordnik, gematria'), { statusCode: 400 });
    }

    await logRequestAudit(sql, event, {
      route: 'member-premium-research',
      action,
      outcome: 'origin_hit',
      metadata: { memberId: member.id, membershipLevel: member.membershipLevel },
    });

    return jsonResponse(200, { action, payload });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process premium research request' }, error.headers || {});
  }
}
