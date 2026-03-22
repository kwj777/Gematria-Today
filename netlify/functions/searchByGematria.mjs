import { getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';

function extractGematriaValue(source) {
  if (!source || typeof source !== 'object') return null;
  if ('queryStringParameters' in source) return source.queryStringParameters?.gematria ?? null;
  if ('rawUrl' in source && typeof source.rawUrl === 'string') return new URL(source.rawUrl).searchParams.get('gematria');
  return null;
}

async function searchByGematria(sql, gematriaValue) {
  const normalizedValue = String(gematriaValue ?? '').trim();
  if (!normalizedValue) throw new Error('Missing required query parameter: gematria');
  if (!/^\d+$/.test(normalizedValue)) throw new Error('Gematria must be a positive integer.');

  const cacheResult = await withCachedJson(sql, {
    cacheKey: buildCacheKey({ route: 'searchByGematria', gematria: normalizedValue }),
    route: 'searchByGematria',
    ttlSeconds: 300,
    compute: async () => {
      const words = await sql`
        SELECT word, gematria_value, digital_root, is_base_root, search_count
        FROM words
        WHERE gematria_value = ${Number(normalizedValue)}
        ORDER BY LOWER(word) ASC
      `;

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

export default async function onRequest(request) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'searchByGematria' });
    const sql = getSqlClient();
    await applyRateLimit(sql, request, {
      scope: 'searchByGematria-ip',
      key: getClientIp(request),
      limit: 60,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many gematria search requests.',
    });
    const cacheResult = await searchByGematria(sql, new URL(request.url).searchParams.get('gematria'));
    await logRequestAudit(sql, request, {
      route: 'searchByGematria',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    });
    return new Response(JSON.stringify(cacheResult.payload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=120',
        'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.message.startsWith('Missing required') || error.message.includes('positive integer') ? 400 : 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: statusCode,
      headers: { 'content-type': 'application/json; charset=utf-8', ...(error.headers || {}) },
    });
  }
}

export async function handler(event) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'searchByGematria' });
    const sql = getSqlClient();
    await applyRateLimit(sql, event, {
      scope: 'searchByGematria-ip',
      key: getClientIp(event),
      limit: 60,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many gematria search requests.',
    });
    const cacheResult = await searchByGematria(sql, extractGematriaValue(event));
    await logRequestAudit(sql, event, {
      route: 'searchByGematria',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    });
    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=300, stale-while-revalidate=120',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.message.startsWith('Missing required') || error.message.includes('positive integer') ? 400 : 500);
    return jsonResponse(statusCode, { error: error.message }, error.headers || {});
  }
}
