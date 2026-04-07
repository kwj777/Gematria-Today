import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp, logRequestAudit } from './_security.mjs';

async function readWordDatabaseStats(sql) {
  const [stats] = await sql`
    SELECT COUNT(*)::int AS total_words
    FROM words
  `;

  return {
    totalWords: Number(stats?.total_words || 0)
  };
}

export default async function onRequest(request) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'publicWordStats' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(request, { sql });
    if (!user) {
      await applyRateLimit(sql, request, {
        scope: 'public-word-stats-ip',
        key: getClientIp(request),
        limit: 30,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many dataset stats requests.'
      });
    }

    const payload = await readWordDatabaseStats(sql);
    await logRequestAudit(sql, request, {
      route: 'publicWordStats',
      action: 'read',
      outcome: 'success'
    });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=120'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.statusCode || 500,
      headers: { 'content-type': 'application/json; charset=utf-8', ...(error.headers || {}) }
    });
  }
}

export async function handler(event) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'publicWordStats' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'public-word-stats-ip',
        key: getClientIp(event),
        limit: 30,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many dataset stats requests.'
      });
    }
    const payload = await readWordDatabaseStats(sql);
    await logRequestAudit(sql, event, {
      route: 'publicWordStats',
      action: 'read',
      outcome: 'success'
    });
    return jsonResponse(200, payload, {
      'cache-control': 'public, max-age=300, stale-while-revalidate=120'
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message }, error.headers || {});
  }
}
