import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertEndpointEnabled,
  buildCacheKey,
  createRateLimitError,
  getClientIp,
  getFingerprint,
  getProtectionConfig,
  getRequestHeaders,
  getRequestPath,
  getRetentionConfig,
  getUserAgent,
  jsonResponse,
  securityHeaders,
} from '../netlify/functions/_security.mjs';

const PRIOR_ENV = {
  PROTECTION_HIGH_ALERT_MODE: process.env.PROTECTION_HIGH_ALERT_MODE,
  DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS: process.env.DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS,
  WORDNIK_TIMEOUT_MS: process.env.WORDNIK_TIMEOUT_MS,
  STRIPE_TIMEOUT_MS: process.env.STRIPE_TIMEOUT_MS,
  REQUEST_AUDIT_LOG_RETENTION_DAYS: process.env.REQUEST_AUDIT_LOG_RETENTION_DAYS,
  FUNCTION_RESPONSE_CACHE_GRACE_DAYS: process.env.FUNCTION_RESPONSE_CACHE_GRACE_DAYS,
  REQUEST_RATE_LIMIT_RETENTION_DAYS: process.env.REQUEST_RATE_LIMIT_RETENTION_DAYS,
};

function clearEnv() {
  for (const key of Object.keys(PRIOR_ENV)) {
    delete process.env[key];
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(PRIOR_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test.after(restoreEnv);

// ---------- buildCacheKey ----------

test('buildCacheKey returns a 64-character sha256 hex digest', () => {
  const key = buildCacheKey({ route: 'r', word: 'w' });
  assert.match(key, /^[0-9a-f]{64}$/);
});

test('buildCacheKey is deterministic for equivalent inputs', () => {
  assert.equal(
    buildCacheKey({ route: 'r', word: 'w' }),
    buildCacheKey({ route: 'r', word: 'w' }),
  );
});

test('buildCacheKey treats object key order as insignificant (stable stringify)', () => {
  assert.equal(
    buildCacheKey({ a: 1, b: 2, c: 3 }),
    buildCacheKey({ c: 3, b: 2, a: 1 }),
  );
});

test('buildCacheKey changes when any nested value changes', () => {
  assert.notEqual(
    buildCacheKey({ route: 'r', word: 'one' }),
    buildCacheKey({ route: 'r', word: 'two' }),
  );
});

test('buildCacheKey preserves array order in nested values', () => {
  // Order in arrays is meaningful — a different order must produce a different key.
  assert.notEqual(
    buildCacheKey({ tags: ['a', 'b'] }),
    buildCacheKey({ tags: ['b', 'a'] }),
  );
});

// ---------- getRequestHeaders ----------

test('getRequestHeaders normalizes plain-object headers to lowercase keys', () => {
  const result = getRequestHeaders({ headers: { 'Content-Type': 'text/plain', 'X-Custom': 'v' } });
  assert.equal(result['content-type'], 'text/plain');
  assert.equal(result['x-custom'], 'v');
});

test('getRequestHeaders reads Headers-like sources via entries()', () => {
  const headers = new Map([['Content-Type', 'application/json'], ['x-trace', 't1']]);
  // Wrap as a Headers-like object exposing a get + entries iterator.
  const source = {
    headers: {
      get: (name) => headers.get(name) || null,
      entries: () => headers.entries(),
    },
  };
  const result = getRequestHeaders(source);
  assert.equal(result['content-type'], 'application/json');
  assert.equal(result['x-trace'], 't1');
});

test('getRequestHeaders returns an empty object when source is null', () => {
  assert.deepEqual(getRequestHeaders(null), {});
  assert.deepEqual(getRequestHeaders(undefined), {});
});

// ---------- getClientIp ----------

test('getClientIp returns the first hop in x-forwarded-for', () => {
  const source = { headers: { 'x-forwarded-for': '203.0.113.5, 198.51.100.7, 127.0.0.1' } };
  assert.equal(getClientIp(source), '203.0.113.5');
});

test('getClientIp falls back to client-ip then x-nf-client-connection-ip', () => {
  assert.equal(getClientIp({ headers: { 'client-ip': '203.0.113.10' } }), '203.0.113.10');
  assert.equal(
    getClientIp({ headers: { 'x-nf-client-connection-ip': '203.0.113.20' } }),
    '203.0.113.20',
  );
});

test('getClientIp falls back to x-real-ip when no forwarded headers exist', () => {
  assert.equal(getClientIp({ headers: { 'x-real-ip': '203.0.113.30' } }), '203.0.113.30');
});

test('getClientIp returns "unknown" when no client identity is available', () => {
  assert.equal(getClientIp({ headers: {} }), 'unknown');
});

// ---------- getRequestPath ----------

test('getRequestPath extracts pathname from url', () => {
  assert.equal(
    getRequestPath({ url: 'https://gematria.today/calculator?q=foo' }),
    '/calculator',
  );
});

test('getRequestPath extracts pathname from rawUrl when url is absent', () => {
  assert.equal(
    getRequestPath({ rawUrl: 'https://gematria.today/tools.html' }),
    '/tools.html',
  );
});

test('getRequestPath falls back to source.path', () => {
  assert.equal(getRequestPath({ path: '/some-path' }), '/some-path');
});

test('getRequestPath returns "unknown" for an empty source', () => {
  assert.equal(getRequestPath(null), 'unknown');
  assert.equal(getRequestPath({}), 'unknown');
});

// ---------- getUserAgent ----------

test('getUserAgent reads the user-agent header (case-insensitive)', () => {
  assert.equal(
    getUserAgent({ headers: { 'User-Agent': 'Mozilla/5.0' } }),
    'Mozilla/5.0',
  );
});

test('getUserAgent returns "unknown" when absent', () => {
  assert.equal(getUserAgent({ headers: {} }), 'unknown');
});

// ---------- getFingerprint ----------

test('getFingerprint is stable for identical sources + extras', () => {
  const source = { headers: { 'user-agent': 'ua', 'x-forwarded-for': '1.1.1.1' }, path: '/x' };
  assert.equal(getFingerprint(source), getFingerprint(source));
});

test('getFingerprint changes when extra context changes', () => {
  const source = { headers: { 'user-agent': 'ua' }, path: '/x' };
  assert.notEqual(getFingerprint(source, { route: 'a' }), getFingerprint(source, { route: 'b' }));
});

// ---------- createRateLimitError ----------

test('createRateLimitError attaches statusCode 429 and a retry-after header', () => {
  const err = createRateLimitError('Slow down', 42);
  assert.equal(err.statusCode, 429);
  assert.equal(err.message, 'Slow down');
  assert.equal(err.headers['retry-after'], '42');
});

test('createRateLimitError rounds fractional retry-after seconds up and enforces minimum 1', () => {
  assert.equal(createRateLimitError('m', 0.4).headers['retry-after'], '1');
  assert.equal(createRateLimitError('m', 1.2).headers['retry-after'], '2');
  assert.equal(createRateLimitError('m', -5).headers['retry-after'], '1');
});

// ---------- securityHeaders ----------

test('securityHeaders emits the standard hardening header set', () => {
  const headers = securityHeaders();
  assert.equal(headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(headers['cache-control'], 'no-store');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'same-origin');
});

test('securityHeaders allows callers to override or extend the set', () => {
  const headers = securityHeaders({ 'cache-control': 'public, max-age=60', 'x-custom': 'on' });
  assert.equal(headers['cache-control'], 'public, max-age=60');
  assert.equal(headers['x-custom'], 'on');
  assert.equal(headers['x-content-type-options'], 'nosniff');
});

// ---------- jsonResponse ----------

test('jsonResponse returns a body-stringified payload with status + standard headers', () => {
  const response = jsonResponse(200, { ok: true });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true });
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('jsonResponse promotes an array of set-cookie values into multiValueHeaders', () => {
  const response = jsonResponse(200, { ok: true }, {
    'set-cookie': ['gematria_member_session=foo; Path=/', 'gematria_member_tier=premium; Path=/'],
    'x-custom': 'on',
  });
  assert.deepEqual(response.multiValueHeaders['set-cookie'], [
    'gematria_member_session=foo; Path=/',
    'gematria_member_tier=premium; Path=/',
  ]);
  // Single-valued set-cookie must NOT be duplicated into headers.
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.headers['x-custom'], 'on');
});

test('jsonResponse passes a single string set-cookie through the regular headers map', () => {
  const response = jsonResponse(200, { ok: true }, {
    'set-cookie': 'gematria_member_session=foo; Path=/',
  });
  assert.equal(response.headers['set-cookie'], 'gematria_member_session=foo; Path=/');
  assert.equal(response.multiValueHeaders, undefined);
});

// ---------- getProtectionConfig ----------

test('getProtectionConfig returns sensible defaults when env vars are unset', () => {
  clearEnv();
  const config = getProtectionConfig();
  assert.equal(config.highAlertMode, false);
  assert.equal(config.disableExpensivePublicEndpoints, false);
  assert.equal(config.wordnikTimeoutMs, 5000);
  assert.equal(config.stripeTimeoutMs, 5000);
});

test('getProtectionConfig honors env-driven overrides (case-insensitive booleans, integers)', () => {
  clearEnv();
  process.env.PROTECTION_HIGH_ALERT_MODE = 'TRUE';
  process.env.DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS = 'true';
  process.env.WORDNIK_TIMEOUT_MS = '8000';
  process.env.STRIPE_TIMEOUT_MS = '12000';
  const config = getProtectionConfig();
  assert.equal(config.highAlertMode, true);
  assert.equal(config.disableExpensivePublicEndpoints, true);
  assert.equal(config.wordnikTimeoutMs, 8000);
  assert.equal(config.stripeTimeoutMs, 12000);
});

test('getProtectionConfig ignores non-"true" string values for boolean envs', () => {
  clearEnv();
  process.env.PROTECTION_HIGH_ALERT_MODE = '1';
  process.env.DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS = 'yes';
  const config = getProtectionConfig();
  assert.equal(config.highAlertMode, false);
  assert.equal(config.disableExpensivePublicEndpoints, false);
});

test('getProtectionConfig falls back to default timeout when env value is non-positive or non-numeric', () => {
  clearEnv();
  process.env.WORDNIK_TIMEOUT_MS = 'not-a-number';
  process.env.STRIPE_TIMEOUT_MS = '0';
  const config = getProtectionConfig();
  assert.equal(config.wordnikTimeoutMs, 5000);
  assert.equal(config.stripeTimeoutMs, 5000);
});

// ---------- getRetentionConfig ----------

test('getRetentionConfig returns defaults when env vars are unset', () => {
  clearEnv();
  const config = getRetentionConfig();
  assert.equal(config.auditLogRetentionDays, 30);
  assert.equal(config.responseCacheGraceDays, 2);
  assert.equal(config.rateLimitRetentionDays, 7);
});

test('getRetentionConfig honors env-driven overrides', () => {
  clearEnv();
  process.env.REQUEST_AUDIT_LOG_RETENTION_DAYS = '90';
  process.env.FUNCTION_RESPONSE_CACHE_GRACE_DAYS = '7';
  process.env.REQUEST_RATE_LIMIT_RETENTION_DAYS = '14';
  const config = getRetentionConfig();
  assert.equal(config.auditLogRetentionDays, 90);
  assert.equal(config.responseCacheGraceDays, 7);
  assert.equal(config.rateLimitRetentionDays, 14);
});

// ---------- assertEndpointEnabled ----------

test('assertEndpointEnabled allows everything by default', () => {
  clearEnv();
  assert.doesNotThrow(() => assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'r' }));
  assert.doesNotThrow(() => assertEndpointEnabled({ publicRoute: false, expensive: false, route: 'r' }));
});

test('assertEndpointEnabled blocks expensive routes when high-alert mode is on (regardless of public/private)', () => {
  clearEnv();
  process.env.PROTECTION_HIGH_ALERT_MODE = 'true';
  assert.throws(
    () => assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'wordnik' }),
    (err) => err.statusCode === 503,
  );
  assert.throws(
    () => assertEndpointEnabled({ publicRoute: false, expensive: true, route: 'admin-x' }),
    (err) => err.statusCode === 503,
  );
});

test('assertEndpointEnabled permits cheap routes during high-alert mode', () => {
  clearEnv();
  process.env.PROTECTION_HIGH_ALERT_MODE = 'true';
  assert.doesNotThrow(
    () => assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'cheap' }),
  );
});

test('assertEndpointEnabled blocks ONLY expensive public routes when the public-expensive flag is on', () => {
  clearEnv();
  process.env.DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS = 'true';
  assert.throws(
    () => assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'wordnik' }),
    (err) => err.statusCode === 503,
  );
  // Admin/private expensive endpoints stay open.
  assert.doesNotThrow(
    () => assertEndpointEnabled({ publicRoute: false, expensive: true, route: 'admin-reports' }),
  );
  // Cheap public endpoints stay open.
  assert.doesNotThrow(
    () => assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'cheap' }),
  );
});
