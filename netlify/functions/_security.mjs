import crypto from 'node:crypto';
import net from 'node:net';

const DEFAULT_RATE_LIMIT_MESSAGE = 'Too many requests. Please try again later.';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const DEFAULT_CACHE_TTL_SECONDS = 60;
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

export function buildCacheKey(parts) {
  const digest = crypto.createHash('sha256');
  digest.update(stableStringify(parts));
  return digest.digest('hex');
}

export function getRequestHeaders(source) {
  if (!source) {
    return {};
  }

  if (typeof source.headers?.get === 'function') {
    const headers = {};
    for (const [key, value] of source.headers.entries()) {
      headers[key.toLowerCase()] = value;
    }
    return headers;
  }

  return Object.fromEntries(Object.entries(source.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
}

// Every per-IP rate limit is keyed by this. It used to return the first
// X-Forwarded-For entry, which is whatever the client wrote there -- proxies
// append the real address on the right -- so a random header per request got a
// fresh limit every time, and a victim's address in the header blocked them.
// Netlify sets x-nf-client-connection-ip itself from the connection, so it
// comes first. The rest only matter off Netlify (netlify dev, tests), and of
// X-Forwarded-For only the right-most hop, the one the nearest proxy added,
// is used.
export function getClientIp(source) {
  const headers = getRequestHeaders(source);
  const connectionIp = String(headers['x-nf-client-connection-ip'] || headers['client-ip'] || '').trim();
  if (connectionIp) {
    return connectionIp;
  }

  const forwardedHops = String(headers['x-forwarded-for'] || '')
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (forwardedHops.length) {
    return forwardedHops[forwardedHops.length - 1];
  }

  return headers['x-real-ip'] || 'unknown';
}

function expandIpv6(address) {
  let value = address;
  const embeddedIpv4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (embeddedIpv4) {
    const [a, b, c, d] = embeddedIpv4.slice(1).map(Number);
    value = `${value.slice(0, embeddedIpv4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = value.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = value.includes('::') ? 8 - headParts.length - tailParts.length : 0;
  return [...headParts, ...Array(missing).fill('0'), ...tailParts].map((part) => Number.parseInt(part, 16) || 0);
}

// Per-address limits key on this rather than the raw address. An IPv6
// subscriber -- any VPS included -- is handed a whole /64, so keyed by the
// full address each of its 2^64 addresses got a fresh allowance. IPv4 keeps
// the full address, and an IPv4 address written as IPv6 (::ffff:a.b.c.d)
// counts as that IPv4 address.
export function getRateLimitIpBucket(ip) {
  const raw = String(ip || '').trim().toLowerCase();
  const address = raw.split('%')[0];
  if (net.isIP(address) !== 6) {
    return raw || 'unknown';
  }
  const hextets = expandIpv6(address);
  if (hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === 0xffff) {
    return [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff].join('.');
  }
  return `${hextets.slice(0, 4).map((hextet) => hextet.toString(16)).join(':')}::/64`;
}

export function getClientRateLimitKey(source) {
  return getRateLimitIpBucket(getClientIp(source));
}

export function getRequestPath(source) {
  if (!source) {
    return 'unknown';
  }

  if (typeof source.url === 'string') {
    return new URL(source.url).pathname;
  }

  if (typeof source.rawUrl === 'string') {
    return new URL(source.rawUrl).pathname;
  }

  return source.path || 'unknown';
}

export function getUserAgent(source) {
  return getRequestHeaders(source)['user-agent'] || 'unknown';
}

export function getFingerprint(source, extra = {}) {
  return buildCacheKey({
    ip: getClientIp(source),
    path: getRequestPath(source),
    userAgent: getUserAgent(source),
    ...extra,
  });
}

// Rate limiting, the response cache and the audit log each call this before
// their own query, so a single public lookup ran these nine DDL statements
// three or four times -- and CREATE INDEX IF NOT EXISTS still takes its lock
// before it finds the index. Memoized per instance like ensureAdminSchema; a
// failure clears the promise so the next request tries again.
let securitySchemaReadyPromise = null;

export async function ensureSecuritySchema(sql) {
  if (securitySchemaReadyPromise) {
    return securitySchemaReadyPromise;
  }

  securitySchemaReadyPromise = ensureSecuritySchemaUncached(sql).catch((error) => {
    securitySchemaReadyPromise = null;
    throw error;
  });

  return securitySchemaReadyPromise;
}

async function ensureSecuritySchemaUncached(sql) {
  await sql`CREATE TABLE IF NOT EXISTS request_rate_limits (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scope, key)
  )`;

  await sql`CREATE INDEX IF NOT EXISTS request_rate_limits_blocked_until_idx ON request_rate_limits (blocked_until)`;
  await sql`CREATE INDEX IF NOT EXISTS request_rate_limits_last_seen_at_idx ON request_rate_limits (last_seen_at ASC)`;

  await sql`CREATE TABLE IF NOT EXISTS function_response_cache (
    cache_key TEXT PRIMARY KEY,
    route TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS function_response_cache_route_expires_idx ON function_response_cache (route, expires_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS function_response_cache_expires_at_idx ON function_response_cache (expires_at ASC)`;

  await sql`CREATE TABLE IF NOT EXISTS request_audit_log (
    id TEXT PRIMARY KEY,
    route TEXT NOT NULL,
    ip_address TEXT,
    request_fingerprint TEXT NOT NULL,
    action TEXT NOT NULL,
    outcome TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS request_audit_log_route_created_at_idx ON request_audit_log (route, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS request_audit_log_created_at_idx ON request_audit_log (created_at ASC)`;

  // The addresses (rate-limit buckets) that have signed in to each account, so
  // the per-account failure limit stops strangers without stopping the owner.
  await sql`CREATE TABLE IF NOT EXISTS login_known_sources (
    account_key TEXT NOT NULL,
    ip_bucket TEXT NOT NULL,
    last_success_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_key, ip_bucket)
  )`;
}

export function createRateLimitError(message = DEFAULT_RATE_LIMIT_MESSAGE, retryAfterSeconds = 60) {
  return Object.assign(new Error(message), {
    statusCode: 429,
    headers: {
      'retry-after': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    },
  });
}

export async function applyRateLimit(sql, source, {
  scope,
  key,
  limit,
  windowMs,
  blockMs = windowMs,
  message = DEFAULT_RATE_LIMIT_MESSAGE,
  auditMetadata = {},
} = {}) {
  await ensureSecuritySchema(sql);

  const now = new Date();
  const normalizedScope = String(scope || 'global');
  const normalizedKey = String(key || getClientIp(source) || 'unknown');
  const rateLimit = parseInteger(limit, 60);
  const windowSizeMs = parseInteger(windowMs, 60_000);
  const blockDurationMs = parseInteger(blockMs, windowSizeMs);

  const rows = await sql`
    INSERT INTO request_rate_limits AS limits (scope, key, count, window_started_at, blocked_until, last_seen_at, created_at, updated_at)
    VALUES (${normalizedScope}, ${normalizedKey}, 1, ${now.toISOString()}, NULL, ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()})
    ON CONFLICT (scope, key)
    DO UPDATE SET
      count = CASE
        WHEN limits.blocked_until IS NOT NULL AND limits.blocked_until > NOW() THEN limits.count
        WHEN NOW() - limits.window_started_at > (${windowSizeMs} * INTERVAL '1 millisecond') THEN 1
        ELSE limits.count + 1
      END,
      window_started_at = CASE
        WHEN NOW() - limits.window_started_at > (${windowSizeMs} * INTERVAL '1 millisecond') THEN NOW()
        ELSE limits.window_started_at
      END,
      blocked_until = CASE
        WHEN limits.blocked_until IS NOT NULL AND limits.blocked_until > NOW() THEN limits.blocked_until
        WHEN NOW() - limits.window_started_at > (${windowSizeMs} * INTERVAL '1 millisecond') THEN NULL
        WHEN limits.count + 1 > ${rateLimit} THEN NOW() + (${blockDurationMs} * INTERVAL '1 millisecond')
        ELSE NULL
      END,
      last_seen_at = NOW(),
      updated_at = NOW()
    RETURNING count, window_started_at, blocked_until
  `;

  const row = rows[0];
  const retryAfterSeconds = row?.blocked_until ? Math.max(1, (new Date(row.blocked_until).getTime() - now.getTime()) / 1000) : Math.ceil(windowSizeMs / 1000);

  if (row?.blocked_until && new Date(row.blocked_until).getTime() > now.getTime()) {
    await logRequestAudit(sql, source, {
      route: normalizedScope,
      action: 'rate_limit',
      outcome: 'blocked',
      metadata: { key: normalizedKey, count: row.count, retryAfterSeconds: Math.ceil(retryAfterSeconds), ...auditMetadata },
    });

    throw createRateLimitError(message, retryAfterSeconds);
  }

  return {
    count: Number(row?.count || 1),
    remaining: Math.max(0, rateLimit - Number(row?.count || 1)),
    limit: rateLimit,
    retryAfterSeconds: Math.ceil(retryAfterSeconds),
  };
}

// The login limits counted before the password is checked are keyed by
// account and caller, or guessing at an account locks its owner out. Keyed
// that way alone, nothing capped guessing at one account from many addresses,
// so password checks from addresses that have never signed in to an account
// are also capped per account, across every address. The slot is claimed in
// one atomic upsert before the password is checked: counting failures after
// the check let a burst of concurrent requests, one per fresh address, all
// read "not capped yet" and all reach the password check. A right password
// hands its slot back, so only failures use up the allowance. Addresses that
// have signed in to the account before are neither counted nor refused, so
// the owner is not the one locked out, and anyone else still has account
// recovery, which proves the address by email. admin-login and member-login
// share the count.
const LOGIN_ACCOUNT_STRANGER_SCOPE = 'login-account-unknown-source';
const LOGIN_ACCOUNT_STRANGER_LIMIT = 20;
const LOGIN_ACCOUNT_STRANGER_WINDOW_MS = 60 * 60_000;
const LOGIN_ACCOUNT_STRANGER_BLOCK_MS = 60 * 60_000;
const LOGIN_KNOWN_SOURCE_RETENTION_DAYS = 90;
const LOGIN_ACCOUNT_LOCKED_MESSAGE = 'Too many failed sign-in attempts for this account. Try again later from a device you have signed in from before, or reset your password.';

function normalizeLoginAccountKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Call before the password check. Returns the claim to pass to
// releaseLoginAttempt when the password is right, or null when nothing was
// counted (no account named, or an address that has signed in to it before).
// Throws a 429 once the account has had its allowance from strangers.
export async function claimLoginAttempt(sql, source, { account, message = LOGIN_ACCOUNT_LOCKED_MESSAGE } = {}) {
  const accountKey = normalizeLoginAccountKey(account);
  if (!accountKey) return null;
  await ensureSecuritySchema(sql);

  const known = await sql`
    SELECT 1 AS known
    FROM login_known_sources
    WHERE account_key = ${accountKey}
      AND ip_bucket = ${getClientRateLimitKey(source)}
    LIMIT 1
  `;
  if (known.length) return null;

  await applyRateLimit(sql, source, {
    scope: LOGIN_ACCOUNT_STRANGER_SCOPE,
    key: accountKey,
    limit: LOGIN_ACCOUNT_STRANGER_LIMIT,
    windowMs: LOGIN_ACCOUNT_STRANGER_WINDOW_MS,
    blockMs: LOGIN_ACCOUNT_STRANGER_BLOCK_MS,
    message,
  });
  return { accountKey };
}

// Hands back the slot a successful sign-in claimed. A cap already reached is
// left alone.
export async function releaseLoginAttempt(sql, claim) {
  if (!claim?.accountKey) return;
  await sql`
    UPDATE request_rate_limits
    SET count = GREATEST(count - 1, 0),
        updated_at = NOW()
    WHERE scope = ${LOGIN_ACCOUNT_STRANGER_SCOPE}
      AND key = ${claim.accountKey}
      AND (blocked_until IS NULL OR blocked_until <= NOW())
  `;
}

export async function rememberLoginSource(sql, source, accounts = []) {
  const ipBucket = getClientRateLimitKey(source);
  const accountKeys = [...new Set(accounts.map(normalizeLoginAccountKey).filter(Boolean))];
  if (!accountKeys.length || ipBucket === 'unknown') return;
  await ensureSecuritySchema(sql);
  for (const accountKey of accountKeys) {
    await sql`
      INSERT INTO login_known_sources (account_key, ip_bucket, last_success_at)
      VALUES (${accountKey}, ${ipBucket}, NOW())
      ON CONFLICT (account_key, ip_bucket)
      DO UPDATE SET last_success_at = NOW()
    `;
  }
}

export const HONEYPOT_FIELD = 'website_url';

export function isHoneypotTriggered(body) {
  if (!body || typeof body !== 'object') return false;
  const value = body[HONEYPOT_FIELD];
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export async function assertHoneypotEmpty(sql, source, body, { route, auditMetadata = {} } = {}) {
  if (!isHoneypotTriggered(body)) return;
  if (sql) {
    try {
      await logRequestAudit(sql, source, {
        route,
        action: 'anti_bot',
        outcome: 'honeypot_triggered',
        metadata: { ...auditMetadata, honeypotValueLength: String(body[HONEYPOT_FIELD] || '').length },
      });
    } catch (_error) {
      // Audit log is best-effort; never block the reject path on logging.
    }
  }
  throw Object.assign(new Error('Submission rejected'), { statusCode: 400 });
}

export async function logRequestAudit(sql, source, { route, action, outcome, metadata = {} } = {}) {
  await ensureSecuritySchema(sql);
  const visitorLocationMetadata = getVisitorLocationMetadata(source);
  const mergedMetadata = {
    ...visitorLocationMetadata,
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  };
  await sql`
    INSERT INTO request_audit_log (id, route, ip_address, request_fingerprint, action, outcome, metadata)
    VALUES (
      ${crypto.randomUUID()},
      ${String(route || getRequestPath(source))},
      ${getClientIp(source)},
      ${getFingerprint(source, { route })},
      ${String(action || 'request')},
      ${String(outcome || 'ok')},
      ${JSON.stringify(mergedMetadata)}::jsonb
    )
  `;
}

function getVisitorLocationMetadata(source) {
  const headers = getRequestHeaders(source);
  const getHeader = (name) => headers[name.toLowerCase()] || '';
  const userAgent = String(getHeader('user-agent') || '').trim();
  const normalizedCountry = normalizeGeoValue(
    getHeader('x-country')
      || getHeader('cf-ipcountry')
      || getHeader('x-vercel-ip-country')
      || source?.geo?.country?.code
      || source?.geo?.country
  );
  const normalizedRegion = normalizeGeoValue(
    getHeader('x-region')
      || getHeader('x-vercel-ip-country-region')
      || source?.geo?.subdivision?.code
      || source?.geo?.region
  );
  const normalizedCity = normalizeGeoValue(
    getHeader('x-city')
      || getHeader('x-vercel-ip-city')
      || source?.geo?.city
  );

  const locationMetadata = {};
  if (normalizedCountry) locationMetadata.country = normalizedCountry;
  if (normalizedRegion) locationMetadata.region = normalizedRegion;
  if (normalizedCity) locationMetadata.city = normalizedCity;
  if (userAgent) {
    locationMetadata.userAgent = userAgent.slice(0, 512);
    locationMetadata.clientType = isAutomatedUserAgent(userAgent) ? 'automation' : 'human';
  }
  return locationMetadata;
}

function normalizeGeoValue(value) {
  if (!value) return '';
  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === 'unknown') return '';
  return normalized;
}

function isAutomatedUserAgent(userAgent) {
  return /(bot|crawler|spider|headless|lighthouse|netlify|pingdom|uptimerobot|statuscake|gtmetrix|pagespeed|chrome-lighthouse|curl|wget|axios|python-requests|node-fetch|node\.js|nodejs|node\/|undici|postman|insomnia|k6|playwright|puppeteer|httpclient)/i.test(String(userAgent || ''));
}

export function securityHeaders(extraHeaders = {}) {
  return {
    'content-type': JSON_CONTENT_TYPE,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    ...extraHeaders,
  };
}

// Netlify's [[headers]] rules in netlify.toml apply to files served from the
// publish directory, not to responses proxied from a function. Server-rendered
// documents (/w/:word, /v/:value, the words sitemap) therefore have to send the
// site header set themselves, or they ship with no CSP at all.
//
// These values mirror the `for = "/*"` block in netlify.toml; the trade-offs
// documented there (style-src keeps 'unsafe-inline', COEP deliberately unset)
// apply here too. tests/document-security-headers.test.mjs fails if the two
// drift apart, so change them together.
export const DOCUMENT_SECURITY_HEADERS = Object.freeze({
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'permissions-policy': 'accelerometer=(), autoplay=(), browsing-topics=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), hid=(), idle-detection=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(self), xr-spatial-tracking=()',
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self' https://api.follow.it https://follow.it; script-src 'self' https://www.googletagmanager.com; style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://bootswatch.com https://www.google-analytics.com https://region1.google-analytics.com https://ingesteer.services-prod.nsvcs.net; frame-src 'self'; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests",
});

export function documentSecurityHeaders(extraHeaders = {}) {
  return { ...DOCUMENT_SECURITY_HEADERS, ...extraHeaders };
}

export function jsonResponse(statusCode, payload, extraHeaders = {}) {
  const setCookie = extraHeaders['set-cookie'];
  if (Array.isArray(setCookie)) {
    const { 'set-cookie': _omit, ...rest } = extraHeaders;
    return {
      statusCode,
      headers: securityHeaders(rest),
      multiValueHeaders: { 'set-cookie': setCookie },
      body: JSON.stringify(payload),
    };
  }
  return {
    statusCode,
    headers: securityHeaders(extraHeaders),
    body: JSON.stringify(payload),
  };
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Rejects once timeoutMs passes, so a caller can fall back instead of waiting
// on a slow database. The work itself is not cancelled.
export function withTimeBudget(promise, timeoutMs, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took longer than ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function getCachedJson(sql, cacheKey) {
  await ensureSecuritySchema(sql);
  const rows = await sql`
    SELECT status_code, payload, expires_at
    FROM function_response_cache
    WHERE cache_key = ${cacheKey}
      AND expires_at > NOW()
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  return {
    statusCode: Number(rows[0].status_code),
    payload: rows[0].payload,
    expiresAt: rows[0].expires_at,
  };
}

export async function clearCachedJson(sql, { route } = {}) {
  await ensureSecuritySchema(sql);

  if (route) {
    const result = await sql`DELETE FROM function_response_cache WHERE route = ${String(route)} RETURNING cache_key`;
    return { deletedCount: result.length, route: String(route) };
  }

  const result = await sql`DELETE FROM function_response_cache RETURNING cache_key`;
  return { deletedCount: result.length, route: 'all' };
}

export async function setCachedJson(sql, { cacheKey, route, statusCode = 200, payload, ttlSeconds = DEFAULT_CACHE_TTL_SECONDS } = {}) {
  await ensureSecuritySchema(sql);
  const expiresAt = new Date(Date.now() + parseInteger(ttlSeconds, DEFAULT_CACHE_TTL_SECONDS) * 1000);
  await sql`
    INSERT INTO function_response_cache AS cache (cache_key, route, status_code, payload, expires_at, created_at, updated_at)
    VALUES (${cacheKey}, ${String(route || 'unknown')}, ${statusCode}, ${JSON.stringify(payload)}::jsonb, ${expiresAt.toISOString()}, NOW(), NOW())
    ON CONFLICT (cache_key)
    DO UPDATE SET
      route = EXCLUDED.route,
      status_code = EXCLUDED.status_code,
      payload = EXCLUDED.payload,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `;
}

export async function withCachedJson(sql, { cacheKey, route, ttlSeconds = DEFAULT_CACHE_TTL_SECONDS, compute } = {}) {
  const cached = await getCachedJson(sql, cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const payload = await compute();
  await setCachedJson(sql, { cacheKey, route, statusCode: 200, payload, ttlSeconds });
  return { statusCode: 200, payload, cached: false };
}



export function getRetentionConfig() {
  return {
    auditLogRetentionDays: parseInteger(process.env.REQUEST_AUDIT_LOG_RETENTION_DAYS, 30),
    responseCacheGraceDays: parseInteger(process.env.FUNCTION_RESPONSE_CACHE_GRACE_DAYS, 2),
    rateLimitRetentionDays: parseInteger(process.env.REQUEST_RATE_LIMIT_RETENTION_DAYS, 7),
  };
}

export async function pruneSecurityData(sql, {
  auditLogRetentionDays,
  responseCacheGraceDays,
  rateLimitRetentionDays,
} = {}) {
  await ensureSecuritySchema(sql);

  const defaults = getRetentionConfig();
  const normalizedAuditDays = parseInteger(auditLogRetentionDays, defaults.auditLogRetentionDays);
  const normalizedCacheGraceDays = parseInteger(responseCacheGraceDays, defaults.responseCacheGraceDays);
  const normalizedRateLimitDays = parseInteger(rateLimitRetentionDays, defaults.rateLimitRetentionDays);

  const auditDeletedRows = await sql`
    DELETE FROM request_audit_log
    WHERE created_at < NOW() - (${normalizedAuditDays} * INTERVAL '1 day')
    RETURNING id
  `;

  const cacheDeletedRows = await sql`
    DELETE FROM function_response_cache
    WHERE expires_at < NOW() - (${normalizedCacheGraceDays} * INTERVAL '1 day')
    RETURNING cache_key
  `;

  const rateLimitDeletedRows = await sql`
    DELETE FROM request_rate_limits
    WHERE COALESCE(blocked_until, last_seen_at, updated_at, created_at) < NOW() - (${normalizedRateLimitDays} * INTERVAL '1 day')
    RETURNING scope
  `;

  const knownLoginSourceDeletedRows = await sql`
    DELETE FROM login_known_sources
    WHERE last_success_at < NOW() - (${LOGIN_KNOWN_SOURCE_RETENTION_DAYS} * INTERVAL '1 day')
    RETURNING account_key
  `;

  return {
    auditLogDeletedCount: auditDeletedRows.length,
    cacheDeletedCount: cacheDeletedRows.length,
    rateLimitDeletedCount: rateLimitDeletedRows.length,
    knownLoginSourceDeletedCount: knownLoginSourceDeletedRows.length,
    retention: {
      auditLogRetentionDays: normalizedAuditDays,
      responseCacheGraceDays: normalizedCacheGraceDays,
      rateLimitRetentionDays: normalizedRateLimitDays,
    },
  };
}
export function getProtectionConfig() {
  return {
    highAlertMode: String(process.env.PROTECTION_HIGH_ALERT_MODE || '').toLowerCase() === 'true',
    disableExpensivePublicEndpoints: String(process.env.DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS || '').toLowerCase() === 'true',
    wordnikTimeoutMs: parseInteger(process.env.WORDNIK_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS),
    stripeTimeoutMs: parseInteger(process.env.STRIPE_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS),
  };
}

export function assertEndpointEnabled({ publicRoute = false, expensive = false, route = 'unknown' } = {}) {
  const config = getProtectionConfig();
  const normalizedRoute = String(route || 'unknown');

  const logDisabledEndpoint = (reason) => {
    const metadata = {
      route: normalizedRoute,
      reason,
      highAlertMode: config.highAlertMode,
      disableExpensivePublicEndpoints: config.disableExpensivePublicEndpoints,
      timestamp: new Date().toISOString(),
    };
    console.warn('[security] Endpoint disabled by protection config', metadata);
  };

  if (config.highAlertMode && expensive) {
    logDisabledEndpoint('high_alert_mode');
    throw Object.assign(new Error(`The ${normalizedRoute} endpoint is temporarily unavailable while protection mode is active.`), { statusCode: 503 });
  }

  if (config.disableExpensivePublicEndpoints && publicRoute && expensive) {
    logDisabledEndpoint('public_expensive_endpoints_disabled');
    throw Object.assign(new Error(`The ${normalizedRoute} endpoint is temporarily disabled.`), { statusCode: 503 });
  }
}
