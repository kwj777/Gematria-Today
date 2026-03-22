import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';

export async function handler(event) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'getWords' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'public-getWords-ip',
        key: getClientIp(event),
        limit: 60,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many requests for the popular words endpoint.',
      });
    }

    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'getWords', top: 20 }),
      route: 'getWords',
      ttlSeconds: 120,
      compute: async () => {
        const words = await sql`
          SELECT 
            word, 
            gematria_value, 
            digital_root, 
            is_base_root, 
            search_count
          FROM words
          ORDER BY search_count DESC
          LIMIT 20
        `;
        return words;
      },
    });

    await logRequestAudit(sql, event, {
      route: 'getWords',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
      metadata: { top: 20 },
    });

    return jsonResponse(cacheResult.statusCode, cacheResult.payload, {
      'cache-control': 'public, max-age=120, stale-while-revalidate=60',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message }, error.headers || {});
  }
}
