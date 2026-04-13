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

    const featuredOnly = event.queryStringParameters?.featured === 'true';
    const previewRequested = event.queryStringParameters?.preview === 'true';
    const previewMode = previewRequested && String(user?.role || '').toLowerCase() === 'admin';
    const slugFilter = String(event.queryStringParameters?.slug || '').trim().toLowerCase();
    const limitValue = Number.parseInt(event.queryStringParameters?.limit || '', 10);
    const requestedLimit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 12) : null;

    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'public-posts', featuredOnly, requestedLimit, previewMode, slugFilter: slugFilter || null }),
      route: 'public-posts',
      ttlSeconds: 120,
      compute: async () => {
        let rows;
        if (featuredOnly && requestedLimit) {
          rows = await sql`
            SELECT * FROM posts
            WHERE (
              COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
              OR (
                COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at <= NOW()
              )
            ) AND show_on_homepage = TRUE
            ORDER BY COALESCE(published_at, created_at) DESC
            LIMIT ${requestedLimit}
          `;
        } else if (featuredOnly) {
          rows = await sql`
            SELECT * FROM posts
            WHERE (
              COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
              OR (
                COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at <= NOW()
              )
            ) AND show_on_homepage = TRUE
            ORDER BY COALESCE(published_at, created_at) DESC
          `;
        } else if (requestedLimit) {
          rows = await sql`
            SELECT * FROM posts
            WHERE (
              COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
              OR (
                COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at <= NOW()
              )
              OR (${previewMode ? 1 : 0} = 1 AND COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft')
            )
              AND (${slugFilter ? 1 : 0} = 0 OR LOWER(COALESCE(slug, '')) = ${slugFilter})
            ORDER BY COALESCE(published_at, created_at) DESC
            LIMIT ${requestedLimit}
          `;
        } else {
          rows = await sql`
            SELECT * FROM posts
            WHERE (
              COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
              OR (
                COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at <= NOW()
              )
              OR (${previewMode ? 1 : 0} = 1 AND COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft')
            )
              AND (${slugFilter ? 1 : 0} = 0 OR LOWER(COALESCE(slug, '')) = ${slugFilter})
            ORDER BY COALESCE(published_at, created_at) DESC
          `;
        }
        return { items: rows.map(formatPost), previewMode };
      },
    });

    await logRequestAudit(sql, event, {
      route: 'public-posts',
      action: featuredOnly ? 'read_featured' : 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
      metadata: {
        slug: slugFilter || null,
        featuredOnly,
        limit: requestedLimit,
        previewMode,
      },
    });

    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=120, stale-while-revalidate=60',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load posts' }, error.headers || {});
  }
}
