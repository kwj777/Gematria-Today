import { getOptionalAuthenticatedSession, getOrCreateVisitorSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp, logRequestAudit } from './_security.mjs';

const MAX_ROUTE_LENGTH = 200;
const MAX_METADATA_KEYS = 20;
const MAX_METADATA_VALUE_LENGTH = 200;
const METADATA_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
// The server sets these itself: logRequestAudit adds the request's user agent,
// client type and geo, and this handler adds the audience. Anyone can call this
// endpoint, and caller metadata is merged last, so a caller's value would win
// and let a script pass the admin bot filter or count as member traffic.
const SERVER_METADATA_KEYS = new Set([
  'userAgent',
  'clientType',
  'country',
  'region',
  'city',
  'audienceType',
  'authenticated',
  'memberId',
  'visitorSessionId',
]);
// Admin click tracking renders these as links.
const SAME_ORIGIN_LINK_KEYS = new Set(['elementLink', 'pageUrl']);

function safeString(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeRoute(value, fallback = '/unknown') {
  const path = safeString(value, fallback).split(/[?#]/)[0] || fallback;
  const route = path.startsWith('/') ? path : `/${path}`;
  return route.slice(0, MAX_ROUTE_LENGTH);
}

function getRequestOrigin(event) {
  const candidates = [event?.rawUrl, event?.headers?.host ? `https://${event.headers.host}` : ''];
  for (const candidate of candidates) {
    try {
      if (candidate) return new URL(candidate).origin;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// Keep a link only when it points at this site, and store it as a path so the
// dashboard resolves it against its own origin.
function normalizeSameOriginLink(value, requestOrigin) {
  const raw = safeString(value);
  if (!raw || !requestOrigin) return '';
  let parsed;
  try {
    parsed = new URL(raw, requestOrigin);
  } catch {
    return '';
  }
  if (parsed.origin !== requestOrigin) return '';
  return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, MAX_METADATA_VALUE_LENGTH);
}

function normalizeAction(value) {
  const raw = safeString(value).toLowerCase();
  return /^[a-z0-9_]{2,80}$/.test(raw) ? raw : null;
}

function normalizeMetadata(value, requestOrigin) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value)
    .map(([key, nestedValue]) => [safeString(key), nestedValue])
    .filter(([key]) => METADATA_KEY_PATTERN.test(key) && !SERVER_METADATA_KEYS.has(key))
    .slice(0, MAX_METADATA_KEYS)
    .map(([key, nestedValue]) => [
      key,
      SAME_ORIGIN_LINK_KEYS.has(key)
        ? normalizeSameOriginLink(nestedValue, requestOrigin)
        : safeString(nestedValue).slice(0, MAX_METADATA_VALUE_LENGTH),
    ])
    // A link that is not on this site is dropped rather than stored.
    .filter(([key, normalizedValue]) => normalizedValue !== '' || !SAME_ORIGIN_LINK_KEYS.has(key));
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
    // Signed-in callers were not limited at all, so any free account could
    // write rows in a loop. Members are keyed by account, visitors by IP.
    await applyRateLimit(sql, event, {
      scope: user ? 'public-button-report-user' : 'public-button-report-ip',
      key: user ? String(user.id) : getClientIp(event),
      limit: 120,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many button tracking requests.',
    });

    const { visitorSessionId, isNew, visitorCookie } = getOrCreateVisitorSession(event);
    const normalizedMetadata = normalizeMetadata(payload.metadata, getRequestOrigin(event));
    const audienceType = user && user.role === 'member' ? 'member' : 'visitor';

    await logRequestAudit(sql, event, {
      route,
      action,
      outcome: 'success',
      metadata: {
        ...normalizedMetadata,
        audienceType,
        authenticated: audienceType === 'member' ? 'true' : 'false',
        visitorSessionId,
      },
    });

    const responseHeaders = isNew ? { 'set-cookie': visitorCookie } : {};
    return jsonResponse(202, { ok: true }, responseHeaders);
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to store button tracking event' }, error.headers || {});
  }
}

