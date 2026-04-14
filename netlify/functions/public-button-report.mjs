import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse } from './_auth.mjs';
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
    return event?.body ? JSON.parse(event.body) : {};
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

    await logRequestAudit(sql, event, {
      route,
      action,
      outcome: 'success',
      metadata: normalizeMetadata(payload.metadata),
    });

    return jsonResponse(202, { ok: true });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to store button tracking event' }, error.headers || {});
  }
}

export default async function onRequest(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { allow: 'POST', 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-button-report' });
    const sql = getSqlClient();
    const payload = await request.json().catch(() => ({}));
    const action = normalizeAction(payload.action);
    const route = normalizeRoute(payload.route || payload.pagePath || '/unknown');

    if (!action) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const { user } = await getOptionalAuthenticatedSession(request, { sql });
    if (!user) {
      await applyRateLimit(sql, request, {
        scope: 'public-button-report-ip',
        key: getClientIp(request),
        limit: 120,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many button tracking requests.',
      });
    }

    await logRequestAudit(sql, request, {
      route,
      action,
      outcome: 'success',
      metadata: normalizeMetadata(payload.metadata),
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unable to store button tracking event' }), {
      status: error.statusCode || 500,
      headers: { 'content-type': 'application/json; charset=utf-8', ...(error.headers || {}) },
    });
  }
}
