import { ensureAdminSchema, formatPost, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';
import { getOptionalAuthenticatedSession } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-posts' });
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'public-posts-ip',
        key: getClientIp(event),
        limit: 60,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many requests for published posts.',
      });
    }

    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'public-posts' }),
      route: 'public-posts',
      ttlSeconds: 120,
      compute: async () => {
        const rows = await sql`SELECT * FROM posts WHERE status = 'published' ORDER BY COALESCE(published_at, created_at) DESC`;
        return { items: rows.map(formatPost) };
      },
    });

    await logRequestAudit(sql, event, {
      route: 'public-posts',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    });

    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=120, stale-while-revalidate=60',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load posts' }, error.headers || {});
  }
}
