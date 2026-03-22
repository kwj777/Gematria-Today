import { ensureAdminSchema, formatFaq, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-faqs' });
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    await applyRateLimit(sql, event, {
      scope: 'public-faqs-ip',
      key: getClientIp(event),
      limit: 60,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many requests for FAQs.',
    });

    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'public-faqs' }),
      route: 'public-faqs',
      ttlSeconds: 300,
      compute: async () => {
        const rows = await sql`SELECT * FROM faqs WHERE is_published = TRUE ORDER BY sort_order ASC, created_at ASC`;
        return { items: rows.map(formatFaq) };
      },
    });

    await logRequestAudit(sql, event, {
      route: 'public-faqs',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    });

    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=300, stale-while-revalidate=60',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load FAQ entries' }, error.headers || {});
  }
}
