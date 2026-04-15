import { getOptionalAuthenticatedSession, getOrCreateVisitorSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp, logRequestAudit } from './_security.mjs';

function safeString(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeRoute(value, fallback = '/unknown') {
  const route = safeString(value, fallback);
  if (!route.startsWith('/')) {
    return `/${route}`;
  }
  return route;
}

function normalizeAction(value) {
  const raw = safeString(value).toLowerCase();
  return /^[a-z0-9_]{2,80}$/.test(raw) ? raw : null;
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value)
    .filter(([key]) => safeString(key).length > 0)
    .slice(0, 20)
    .map(([key, nestedValue]) => [safeString(key), safeString(nestedValue).slice(0, 200)]);
  return Object.fromEntries(entries);
}

function parseBody(event) {
  try {
    if (!event?.body) {
      return {};
    }
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { allow: 'POST' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-button-report' });
    const sql = getSqlClient();
    const payload = parseBody(event);
    const action = normalizeAction(payload.action);
    const route = normalizeRoute(payload.route || payload.pagePath || '/unknown');

    if (!action) {
      return jsonResponse(400, { error: 'Invalid action' });
    }

    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (user && user.isAdmin) {
      return jsonResponse(202, { ok: true, skipped: true });
    }
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'public-button-report-ip',
        key: getClientIp(event),
        limit: 120,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many button tracking requests.',
      });
    }

    const { visitorSessionId, isNew, visitorCookie } = getOrCreateVisitorSession(event);
    const normalizedMetadata = normalizeMetadata(payload.metadata);
    const audienceType = user && user.role === 'member' ? 'member' : 'visitor';

    await logRequestAudit(sql, event, {
      route,
      action,
      outcome: 'success',
      metadata: {
        ...normalizedMetadata,
        audienceType,
        authenticated: audienceType === 'member' ? 'true' : (normalizedMetadata.authenticated || 'false'),
        visitorSessionId,
      },
    });

    const responseHeaders = isNew ? { 'set-cookie': visitorCookie } : {};
    return jsonResponse(202, { ok: true }, responseHeaders);
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to store button tracking event' }, error.headers || {});
  }
}

