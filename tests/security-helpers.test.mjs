import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertEndpointEnabled,
  assertHoneypotEmpty,
  buildCacheKey,
  createRateLimitError,
  getClientIp,
  getClientRateLimitKey,
  getFingerprint,
  getProtectionConfig,
  getRequestHeaders,
  getRateLimitIpBucket,
  getRequestPath,
  getRetentionConfig,
  getUserAgent,
  HONEYPOT_FIELD,
  isHoneypotTriggered,
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

// Every per-IP rate limit is keyed by this. The left of X-Forwarded-For is
// whatever the client wrote there, so preferring it let a random header buy a
// fresh limit per request, and a victim's address in the header block them.
test('getClientIp prefers the address Netlify saw over anything in X-Forwarded-For', () => {
  const source = {
    headers: {
      'x-forwarded-for': '198.51.100.99, 203.0.113.5',
      'client-ip': '198.51.100.98',
      'x-nf-client-connection-ip': '203.0.113.5',
    },
  };
  assert.equal(getClientIp(source), '203.0.113.5');
});

test('getClientIp does not let a spoofed X-Forwarded-For change the rate-limit key on Netlify', () => {
  const real = { 'x-nf-client-connection-ip': '203.0.113.5' };
  const keys = new Set(['10.0.0.1', '10.0.0.2', '192.0.2.77'].map((spoofed) => getClientIp({
    headers: { ...real, 'x-forwarded-for': `${spoofed}, 203.0.113.5` },
  })));
  assert.deepEqual([...keys], ['203.0.113.5']);
});

test('getClientIp also reads x-nf-client-connection-ip from a Fetch API Request', () => {
  const request = new Request('https://gematria.today/api/x', {
    headers: { 'x-forwarded-for': '198.51.100.99', 'x-nf-client-connection-ip': '203.0.113.21' },
  });
  assert.equal(getClientIp(request), '203.0.113.21');
});

test('getClientIp falls back to client-ip when Netlify\'s header is absent', () => {
  assert.equal(getClientIp({ headers: { 'client-ip': '203.0.113.10' } }), '203.0.113.10');
});

test('getClientIp off Netlify uses the right-most X-Forwarded-For hop, the one the proxy added', () => {
  const source = { headers: { 'x-forwarded-for': '203.0.113.5, 198.51.100.7, 127.0.0.1' } };
  assert.equal(getClientIp(source), '127.0.0.1');
  assert.equal(getClientIp({ headers: { 'x-forwarded-for': ' 203.0.113.9 ,' } }), '203.0.113.9');
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

// ---------- getRateLimitIpBucket ----------

test('an IPv6 caller is rate limited by its /64, however it writes the address', () => {
  // A VPS is handed a whole /64; keyed by the full address, each of its 2^64
  // addresses got a fresh per-address allowance.
  const bucket = getRateLimitIpBucket('2001:db8:1234:5678::1');
  assert.equal(bucket, '2001:db8:1234:5678::/64');
  for (const address of [
    '2001:db8:1234:5678:ffff:ffff:ffff:ffff',
    '2001:0DB8:1234:5678:0:0:0:abcd',
    '2001:db8:1234:5678:a:b:1.2.3.4',
    '2001:db8:1234:5678::9%eth0',
  ]) {
    assert.equal(getRateLimitIpBucket(address), bucket, address);
  }
  assert.notEqual(getRateLimitIpBucket('2001:db8:1234:5679::1'), bucket, 'the next /64 is another subscriber');
  assert.equal(getRateLimitIpBucket('::1'), '0:0:0:0::/64');
});

test('an IPv4 caller keeps its full address, including one written as IPv6', () => {
  assert.equal(getRateLimitIpBucket('203.0.113.10'), '203.0.113.10');
  assert.equal(getRateLimitIpBucket('::ffff:203.0.113.10'), '203.0.113.10');
  assert.equal(getRateLimitIpBucket('::ffff:cb00:710a'), '203.0.113.10');
  assert.equal(getRateLimitIpBucket(''), 'unknown');
  assert.equal(getRateLimitIpBucket('not-an-ip'), 'not-an-ip');
});

test('getClientRateLimitKey buckets the connection address', () => {
  assert.equal(
    getClientRateLimitKey({ headers: { 'x-nf-client-connection-ip': '2001:db8:aa:bb:cc:dd:ee:ff' } }),
    '2001:db8:aa:bb::/64',
  );
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

// ---------- ensureSecuritySchema ----------

// Rate limiting, the response cache and the audit log each run this before
// their own query, so one public lookup used to issue the nine DDL statements
// three or four times. Each test loads a fresh copy of the module, standing in
// for a new lambda instance.
let securityColdStarts = 0;
async function freshSecurityModule() {
  securityColdStarts += 1;
  return import(`../netlify/functions/_security.mjs?cold-start=${securityColdStarts}`);
}

function createDdlCountingSql({ failFirstDdl = false } = {}) {
  const calls = [];
  let failNext = failFirstDdl;
  const sql = (strings) => {
    const text = strings.join('?');
    calls.push(text);
    if (failNext && /CREATE TABLE IF NOT EXISTS request_rate_limits/.test(text)) {
      failNext = false;
      return Promise.reject(new Error('lock timeout'));
    }
    if (/INSERT INTO request_rate_limits/.test(text)) {
      return Promise.resolve([{ count: 1, window_started_at: new Date().toISOString(), blocked_until: null }]);
    }
    return Promise.resolve([]);
  };
  const ddlCount = () => calls.filter((text) => /^\s*CREATE (TABLE|INDEX) IF NOT EXISTS/.test(text)).length;
  return { sql, ddlCount };
}

test('ensureSecuritySchema runs its DDL once per instance, however many helpers a request uses', async () => {
  const { applyRateLimit, ensureSecuritySchema, getCachedJson, logRequestAudit, setCachedJson } = await freshSecurityModule();
  const { sql, ddlCount } = createDdlCountingSql();
  const source = { headers: {}, path: '/api/englishGematria' };

  await applyRateLimit(sql, source, { scope: 'lookup', key: 'k', limit: 10, windowMs: 60_000 });
  const afterFirstHelper = ddlCount();
  assert.equal(afterFirstHelper, 10, 'the first call creates the four tables and six indexes');

  await getCachedJson(sql, 'cache-key');
  await setCachedJson(sql, { cacheKey: 'cache-key', route: 'lookup', payload: {} });
  await logRequestAudit(sql, source, { route: 'lookup', action: 'request', outcome: 'ok' });
  await ensureSecuritySchema(sql);
  assert.equal(ddlCount(), afterFirstHelper, 'later calls reuse the finished schema');
});

test('a failed ensureSecuritySchema is retried by the next request instead of poisoning the instance', async () => {
  const { ensureSecuritySchema } = await freshSecurityModule();
  const { sql, ddlCount } = createDdlCountingSql({ failFirstDdl: true });

  await assert.rejects(ensureSecuritySchema(sql), /lock timeout/);
  await ensureSecuritySchema(sql);
  assert.equal(ddlCount(), 1 + 10, 'the retry ran the whole schema again');
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

// ---------- isHoneypotTriggered / assertHoneypotEmpty ----------

test('HONEYPOT_FIELD is the website_url field', () => {
  assert.equal(HONEYPOT_FIELD, 'website_url');
});

test('isHoneypotTriggered returns false for empty / missing / whitespace honeypot values', () => {
  assert.equal(isHoneypotTriggered({}), false);
  assert.equal(isHoneypotTriggered({ website_url: '' }), false);
  assert.equal(isHoneypotTriggered({ website_url: '   ' }), false);
  assert.equal(isHoneypotTriggered({ website_url: null }), false);
  assert.equal(isHoneypotTriggered(null), false);
  assert.equal(isHoneypotTriggered(undefined), false);
});

test('isHoneypotTriggered returns true when the honeypot has any non-whitespace content', () => {
  assert.equal(isHoneypotTriggered({ website_url: 'https://spam.example' }), true);
  assert.equal(isHoneypotTriggered({ website_url: 'x' }), true);
});

test('assertHoneypotEmpty resolves silently when the honeypot is empty', async () => {
  await assert.doesNotReject(() => assertHoneypotEmpty(null, {}, { foo: 'bar' }, { route: 'r' }));
  await assert.doesNotReject(() => assertHoneypotEmpty(null, {}, { website_url: '' }, { route: 'r' }));
});

test('assertHoneypotEmpty throws a 400 when the honeypot has content, even without a sql client', async () => {
  await assert.rejects(
    () => assertHoneypotEmpty(null, {}, { website_url: 'spam' }, { route: 'r' }),
    (err) => err.statusCode === 400,
  );
});
