import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';
import { recordGematriaNumberSearch } from './_badges.mjs';
import { MAX_GEMATRIA_VALUE, parseGematriaValue } from './_words.mjs';
import { wordHasValue } from './englishGematria.mjs';

function extractGematriaValue(source) {
  if (!source || typeof source !== 'object') return null;
  if ('queryStringParameters' in source) return source.queryStringParameters?.gematria ?? null;
  if ('rawUrl' in source && typeof source.rawUrl === 'string') return new URL(source.rawUrl).searchParams.get('gematria');
  return null;
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

async function searchByGematria(sql, gematriaValue) {
  const rawValue = String(gematriaValue ?? '').trim();
  if (!rawValue) throw badRequest('Missing required query parameter: gematria');
  if (!/^\d+$/.test(rawValue)) throw badRequest('Gematria must be a positive integer.');
  const value = parseGematriaValue(rawValue);
  if (value === null) throw badRequest(`Gematria must be no larger than ${MAX_GEMATRIA_VALUE}.`);
  const normalizedValue = String(value);

  const cacheResult = await withCachedJson(sql, {
    cacheKey: buildCacheKey({ route: 'searchByGematria', gematria: normalizedValue }),
    route: 'searchByGematria',
    ttlSeconds: 300,
    compute: async () => {
      // Unbounded: a popular value returns every matching row, and the results
      // page renders a card for each one. 500 is well past any real value's
      // match count and keeps a pathological row set from becoming a
      // pathological page.
      const rows = await sql`
        SELECT word, gematria_value, digital_root, is_base_root, search_count
        FROM words
        WHERE gematria_value = ${value}
        ORDER BY LOWER(word) ASC
        LIMIT 500
      `;
      // A row stored under the old letter rule can still carry a total its
      // word no longer adds up to ("Straße" at 606, now 378). Listed here, it
      // would open to a different number than the one it was found under.
      const words = rows.filter((row) => wordHasValue(row.word, value));

      return {
        gematria: normalizedValue,
        count: words.length,
        words: words.map((row) => ({
          word: row.word,
          gematria: {
            total: String(row.gematria_value),
            digitalRoot: Number(row.digital_root),
          },
          isBaseRoot: Boolean(row.is_base_root),
          searchCount: Number(row.search_count),
        })),
      };
    },
  });

  return cacheResult;
}

// newlyEarnedBadges belongs to the member who asked. Under a public header a
// shared cache keyed on the URL would replay their badge toast to every later
// visitor of the same search, so only the badge-free answer is cached publicly.
export function searchCacheControl(payload) {
  return payload?.newlyEarnedBadges ? 'private, no-store' : 'public, max-age=300, stale-while-revalidate=120';
}

// Validation errors carry their own status and say what to fix. Anything else
// is unexpected -- usually the database's -- and its message is logged, not
// returned.
function toErrorResponse(error) {
  if (error.statusCode) return { statusCode: error.statusCode, message: error.message };
  console.error('searchByGematria failed', error);
  return { statusCode: 500, message: 'Gematria search failed. Please try again.' };
}

export default async function onRequest(request) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'searchByGematria' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(request, { sql });
    if (!user) {
      await applyRateLimit(sql, request, {
        scope: 'searchByGematria-ip',
        key: getClientIp(request),
        limit: 60,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many gematria search requests.',
      });
    }
    const gematriaParam = new URL(request.url).searchParams.get('gematria');
    const cacheResult = await searchByGematria(sql, gematriaParam);
    let badgeAward = null;
    // Credit follows the member's request, not the shared cache: a search
    // answered from cache because someone else ran the same value is still a
    // search this member made.
    if (user?.id) {
      badgeAward = await recordGematriaNumberSearch(sql, user.id);
    }
    await logRequestAudit(sql, request, {
      route: 'searchByGematria',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    });
    const responsePayload = badgeAward?.newBadges?.length
      ? { ...cacheResult.payload, newlyEarnedBadges: badgeAward.newBadges }
      : cacheResult.payload;
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': searchCacheControl(responsePayload),
        'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
      },
    });
  } catch (error) {
    const { statusCode, message } = toErrorResponse(error);
    return new Response(JSON.stringify({ error: message }), {
      status: statusCode,
      headers: { 'content-type': 'application/json; charset=utf-8', ...(error.headers || {}) },
    });
  }
}

export async function handler(event) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'searchByGematria' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'searchByGematria-ip',
        key: getClientIp(event),
        limit: 60,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many gematria search requests.',
      });
    }
    const gematriaParam = extractGematriaValue(event);
    const cacheResult = await searchByGematria(sql, gematriaParam);
    let badgeAward = null;
    if (user?.id) {
      badgeAward = await recordGematriaNumberSearch(sql, user.id);
    }
    await logRequestAudit(sql, event, {
      route: 'searchByGematria',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    });
    const responsePayload = badgeAward?.newBadges?.length
      ? { ...cacheResult.payload, newlyEarnedBadges: badgeAward.newBadges }
      : cacheResult.payload;
    return jsonResponse(200, responsePayload, {
      'cache-control': searchCacheControl(responsePayload),
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    const { statusCode, message } = toErrorResponse(error);
    return jsonResponse(statusCode, { error: message }, error.headers || {});
  }
}
