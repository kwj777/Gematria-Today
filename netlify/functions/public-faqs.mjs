import { ensureAdminSchema, formatFaq, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';
import { getOptionalAuthenticatedSession } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp, logRequestAudit } from './_security.mjs';

export const DEFAULT_FAQ_PAGE_SIZE = 50;
export const MAX_FAQ_PAGE_SIZE = 100;

// The FAQ page asked for the default page and stopped, so every published FAQ
// past the 50th was silently missing from the page and its FAQPage schema.
// Each page now says whether more follow (one extra row is read to find out),
// and the page walks nextOffset until hasMore is false.
export async function loadPublishedFaqPage(sql, query = {}) {
  const requestedLimit = Number.parseInt(query.limit, 10);
  const requestedOffset = Number.parseInt(query.offset, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_FAQ_PAGE_SIZE)
    : DEFAULT_FAQ_PAGE_SIZE;
  const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;

  const rows = await sql`
    SELECT * FROM faqs
    WHERE is_published = TRUE
    ORDER BY sort_order ASC, created_at ASC, id ASC
    LIMIT ${limit + 1} OFFSET ${offset}
  `;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: pageRows.map(formatFaq),
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-faqs' });
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'public-faqs-ip',
        key: getClientIp(event),
        limit: 60,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many requests for FAQs.',
      });
    }

    const payload = await loadPublishedFaqPage(sql, event.queryStringParameters || {});

    await logRequestAudit(sql, event, {
      route: 'public-faqs',
      action: 'read',
      outcome: 'origin_hit',
    });

    return jsonResponse(200, payload, {
      'cache-control': 'no-store',
      'x-cache-status': 'bypass',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load FAQ entries' }, error.headers || {});
  }
}
