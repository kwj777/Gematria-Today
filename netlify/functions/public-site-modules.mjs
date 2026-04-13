import { ensureAdminSchema, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';
import { assertEndpointEnabled, buildCacheKey, logRequestAudit, withCachedJson } from './_security.mjs';
import { normalizeSiteModules } from './_site-modules.mjs';


export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-site-modules' });
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);

    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'public-site-modules' }),
      route: 'public-site-modules',
      ttlSeconds: 120,
      compute: async () => {
        const rows = await sql`
          SELECT setting_value
          FROM admin_settings
          WHERE setting_key = 'site_modules'
          LIMIT 1
        `;

        let parsed = null;
        if (rows.length) {
          try {
            parsed = JSON.parse(rows[0].setting_value || '{}');
          } catch {
            parsed = null;
          }
        }

        return { modules: normalizeSiteModules(parsed) };
      },
    });

    await logRequestAudit(sql, event, {
      route: 'public-site-modules',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
      metadata: {
        pagePath: String(event.queryStringParameters?.pagePath || '').trim() || null,
      },
    });

    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=120, stale-while-revalidate=60',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load site modules' }, error.headers || {});
  }
}
