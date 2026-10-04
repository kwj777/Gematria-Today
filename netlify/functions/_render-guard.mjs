import { getSqlClient } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp } from './_security.mjs';

// Guard for the resvg PNG endpoints (name-chart-image, ai-agent-share-image).
//
// A render costs roughly 0.2-1 s of CPU and over 100 MB of memory, and every
// new query string is a CDN cache miss, so a loop of random names or topics
// was an unthrottled way to run up invocation cost. These routes now honour the
// runbook's kill switches (PROTECTION_HIGH_ALERT_MODE,
// DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS) and a per-IP limit.
//
// The limit fails open when the database cannot be reached: neither endpoint
// otherwise needs the database, and a Neon outage should not also blank every
// share card and chart preview. The kill switch does not depend on it.
export async function guardImageRender(request, { route, limit, windowMs = 60_000, blockMs = 5 * 60_000, getSql = getSqlClient } = {}) {
  assertEndpointEnabled({ publicRoute: true, expensive: true, route });

  let sql;
  try {
    sql = getSql();
  } catch (error) {
    console.warn(`[${route}] rate limit skipped: ${error?.message || error}`);
    return;
  }

  try {
    await applyRateLimit(sql, request, {
      scope: `${route}-ip`,
      key: getClientIp(request),
      limit,
      windowMs,
      blockMs,
      message: 'Too many image requests. Please try again shortly.',
    });
  } catch (error) {
    if (Number(error?.statusCode) === 429) {
      throw error;
    }
    console.warn(`[${route}] rate limit skipped: ${error?.message || error}`);
  }
}

export function guardErrorResponse(error) {
  const status = Number(error?.statusCode);
  if (status !== 429 && status !== 503) {
    return null;
  }
  return new Response(error.message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...(error.headers || {}),
    },
  });
}
