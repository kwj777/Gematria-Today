import { ensureAdminSchema, formatFaq, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';
import { getOptionalAuthenticatedSession } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp, logRequestAudit } from './_security.mjs';

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

    const query = event.queryStringParameters || {};
    const requestedLimit = Number.parseInt(query.limit, 10);
    const requestedOffset = Number.parseInt(query.offset, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;

    const rows = await sql`
      SELECT * FROM faqs
      WHERE is_published = TRUE
      ORDER BY sort_order ASC, created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const payload = { items: rows.map(formatFaq), limit, offset };

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
