import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_COOKIES,
  CSRF_TOKEN_HEADER,
  clearMemberTierCookie,
  clearSessionCookie,
  createMemberTierCookie,
  createSessionCookie,
  generateCsrfToken,
  getCsrfTokenFromRequest,
  hashPassword,
  hashToken,
  isSameOriginRequest,
  parseCookies,
  validateCsrfRequest,
  validateCsrfToken,
  verifyPassword,
} from '../netlify/functions/_auth.mjs';
import { handler as memberCsrfHandler } from '../netlify/functions/member-csrf.mjs';

// CSRF helpers require a non-empty secret. Pin one for the whole file so the
// generate/validate tests can run; restore it (if any) at the end.
const PRIOR_CSRF_SECRET = process.env.CSRF_SECRET;
const PRIOR_AUTH_COOKIE_SECURE = process.env.AUTH_COOKIE_SECURE;
process.env.CSRF_SECRET = 'test-csrf-secret-do-not-use-in-prod';

test.after(() => {
  if (PRIOR_CSRF_SECRET === undefined) {
    delete process.env.CSRF_SECRET;
  } else {
    process.env.CSRF_SECRET = PRIOR_CSRF_SECRET;
  }
  if (PRIOR_AUTH_COOKIE_SECURE === undefined) {
    delete process.env.AUTH_COOKIE_SECURE;
  } else {
    process.env.AUTH_COOKIE_SECURE = PRIOR_AUTH_COOKIE_SECURE;
  }
});

// ---------- hashPassword / verifyPassword ----------

test('hashPassword produces a scrypt$salt$hex string', async () => {
  const stored = await hashPassword('correct horse battery staple');
  const parts = stored.split('$');
  assert.equal(parts.length, 3);
  assert.equal(parts[0], 'scrypt');
  assert.match(parts[1], /^[0-9a-f]{32}$/); // 16-byte salt as hex
  assert.match(parts[2], /^[0-9a-f]{128}$/); // 64-byte derived key as hex
});

test('hashPassword uses a fresh random salt by default', async () => {
  const [a, b] = await Promise.all([
    hashPassword('same-password'),
    hashPassword('same-password'),
  ]);
  assert.notEqual(a, b);
});

test('verifyPassword accepts a matching password', async () => {
  const stored = await hashPassword('hunter2');
  assert.equal(await verifyPassword('hunter2', stored), true);
});

test('verifyPassword rejects a wrong password', async () => {
  const stored = await hashPassword('hunter2');
  assert.equal(await verifyPassword('hunter3', stored), false);
});

test('verifyPassword rejects non-scrypt hashes outright', async () => {
  assert.equal(await verifyPassword('anything', ''), false);
  assert.equal(await verifyPassword('anything', null), false);
  assert.equal(await verifyPassword('anything', 'bcrypt$abc$def'), false);
  assert.equal(await verifyPassword('anything', 'plaintext'), false);
});

// ---------- hashToken ----------

test('hashToken returns a deterministic sha256 hex digest', () => {
  const a = hashToken('session-token-1');
  const b = hashToken('session-token-1');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('hashToken produces different output for different inputs', () => {
  assert.notEqual(hashToken('one'), hashToken('two'));
});

// ---------- generateCsrfToken / validateCsrfToken ----------

test('generateCsrfToken is deterministic for the same session token + secret', () => {
  const a = generateCsrfToken('session-abc');
  const b = generateCsrfToken('session-abc');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('generateCsrfToken differs across distinct session tokens', () => {
  assert.notEqual(generateCsrfToken('session-abc'), generateCsrfToken('session-def'));
});

test('validateCsrfToken accepts a token generated for the same session', () => {
  const token = generateCsrfToken('session-xyz');
  assert.equal(validateCsrfToken(token, 'session-xyz'), true);
});

test('validateCsrfToken rejects a token from a different session', () => {
  const token = generateCsrfToken('session-xyz');
  assert.equal(validateCsrfToken(token, 'session-zzz'), false);
});

test('validateCsrfToken rejects empty or missing tokens', () => {
  assert.equal(validateCsrfToken('', 'session'), false);
  assert.equal(validateCsrfToken('anything', ''), false);
  assert.equal(validateCsrfToken(undefined, 'session'), false);
  assert.equal(validateCsrfToken('anything', null), false);
});

test('validateCsrfToken rejects tokens of wrong length without throwing', () => {
  // Length mismatch must short-circuit before timingSafeEqual to avoid throwing.
  assert.equal(validateCsrfToken('short', 'session-xyz'), false);
});

// ---------- getCsrfTokenFromRequest ----------

test('getCsrfTokenFromRequest reads the x-csrf-token request header', () => {
  const event = { headers: { [CSRF_TOKEN_HEADER]: 'abc123' } };
  assert.equal(getCsrfTokenFromRequest(event), 'abc123');
});

test('getCsrfTokenFromRequest trims surrounding whitespace', () => {
  const event = { headers: { [CSRF_TOKEN_HEADER]: '  abc123  ' } };
  assert.equal(getCsrfTokenFromRequest(event), 'abc123');
});

test('getCsrfTokenFromRequest returns empty string when header is absent', () => {
  assert.equal(getCsrfTokenFromRequest({ headers: {} }), '');
  assert.equal(getCsrfTokenFromRequest({}), '');
});

test('getCsrfTokenFromRequest supports Headers-like get() accessor', () => {
  const event = {
    headers: {
      get(name) {
        return name === CSRF_TOKEN_HEADER ? 'fetch-style-token' : null;
      },
    },
  };
  assert.equal(getCsrfTokenFromRequest(event), 'fetch-style-token');
});

// ---------- isSameOriginRequest ----------

test('isSameOriginRequest accepts matching origin and host', () => {
  const event = {
    headers: { host: 'gematria.today', origin: 'https://gematria.today' },
  };
  assert.equal(isSameOriginRequest(event), true);
});

test('isSameOriginRequest rejects literal "null" origin', () => {
  const event = {
    headers: { host: 'gematria.today', origin: 'null' },
  };
  assert.equal(isSameOriginRequest(event), false);
});

test('isSameOriginRequest rejects mismatched cross-site origin', () => {
  const event = {
    headers: { host: 'gematria.today', origin: 'https://evil.example' },
  };
  assert.equal(isSameOriginRequest(event), false);
});

test('isSameOriginRequest falls back to referer when origin is absent', () => {
  const event = {
    headers: { host: 'gematria.today', referer: 'https://gematria.today/some/page' },
  };
  assert.equal(isSameOriginRequest(event), true);
});

test('isSameOriginRequest rejects mismatched referer when origin is absent', () => {
  const event = {
    headers: { host: 'gematria.today', referer: 'https://evil.example/page' },
  };
  assert.equal(isSameOriginRequest(event), false);
});

test('isSameOriginRequest returns false when no host header is present', () => {
  assert.equal(isSameOriginRequest({ headers: {} }), false);
});

test('isSameOriginRequest returns false when neither origin nor referer is present', () => {
  assert.equal(isSameOriginRequest({ headers: { host: 'gematria.today' } }), false);
});

test('isSameOriginRequest honors x-forwarded-host over host', () => {
  // Behind Netlify the host header is the function host; x-forwarded-host carries
  // the real public host that the origin header reflects.
  const event = {
    headers: {
      host: 'function-runner.netlify.internal',
      'x-forwarded-host': 'gematria.today',
      origin: 'https://gematria.today',
    },
  };
  assert.equal(isSameOriginRequest(event), true);
});

// ---------- validateCsrfRequest ----------

test('validateCsrfRequest accepts a valid CSRF token regardless of origin', () => {
  const sessionToken = 'session-token-value';
  const csrfToken = generateCsrfToken(sessionToken);
  const event = {
    headers: {
      host: 'gematria.today',
      origin: 'https://evil.example',
      [CSRF_TOKEN_HEADER]: csrfToken,
    },
  };
  assert.equal(validateCsrfRequest(event, sessionToken), true);
});

test('validateCsrfRequest falls back to same-origin check when CSRF token is absent', () => {
  const event = {
    headers: { host: 'gematria.today', origin: 'https://gematria.today' },
  };
  assert.equal(validateCsrfRequest(event, 'session-token-value'), true);
});

test('validateCsrfRequest rejects when both CSRF token and origin checks fail', () => {
  const event = {
    headers: {
      host: 'gematria.today',
      origin: 'https://evil.example',
      [CSRF_TOKEN_HEADER]: 'wrong-token',
    },
  };
  assert.equal(validateCsrfRequest(event, 'session-token-value'), false);
});

// ---------- parseCookies ----------

test('parseCookies returns empty object when no Cookie header is present', () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
  assert.deepEqual(parseCookies({}), {});
});

test('parseCookies handles capitalized Cookie header', () => {
  const result = parseCookies({ headers: { Cookie: 'foo=bar' } });
  assert.equal(result.foo, 'bar');
});

test('parseCookies splits multiple cookies on semicolons', () => {
  const result = parseCookies({ headers: { cookie: 'a=1; b=2; c=3' } });
  assert.deepEqual(result, { a: '1', b: '2', c: '3' });
});

test('parseCookies URL-decodes cookie values', () => {
  const value = 'space and+plus';
  const encoded = encodeURIComponent(value);
  const result = parseCookies({ headers: { cookie: `name=${encoded}` } });
  assert.equal(result.name, value);
});

test('parseCookies preserves "=" characters inside cookie values', () => {
  // base64-style values containing "=" must be preserved, not truncated.
  const result = parseCookies({ headers: { cookie: 'token=abc==' } });
  assert.equal(result.token, 'abc==');
});

test('parseCookies supports Headers-like get() accessor', () => {
  const event = {
    headers: {
      get(name) {
        return name === 'cookie' ? 'foo=bar; baz=qux' : null;
      },
    },
  };
  assert.deepEqual(parseCookies(event), { foo: 'bar', baz: 'qux' });
});

// ---------- createSessionCookie / clearSessionCookie ----------

test('createSessionCookie marks the cookie HttpOnly, Lax, and Path=/', () => {
  process.env.AUTH_COOKIE_SECURE = 'false'; // simplify the assertion across envs
  const expires = new Date(Date.now() + 60_000);
  const cookie = createSessionCookie('token-value', expires);
  assert.ok(cookie.startsWith(`${AUTH_COOKIES.admin}=`));
  assert.ok(cookie.includes('Path=/'));
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes(`Expires=${expires.toUTCString()}`));
  assert.ok(cookie.includes(encodeURIComponent('token-value')));
});

test('createSessionCookie honors a custom cookie name (member vs admin)', () => {
  process.env.AUTH_COOKIE_SECURE = 'false';
  const cookie = createSessionCookie('t', new Date(), AUTH_COOKIES.member);
  assert.ok(cookie.startsWith(`${AUTH_COOKIES.member}=`));
});

test('createSessionCookie adds Secure when AUTH_COOKIE_SECURE is enabled', () => {
  process.env.AUTH_COOKIE_SECURE = 'true';
  const cookie = createSessionCookie('t', new Date(Date.now() + 60_000));
  assert.ok(cookie.includes('Secure'));
});

test('createSessionCookie omits Secure when AUTH_COOKIE_SECURE is disabled', () => {
  process.env.AUTH_COOKIE_SECURE = 'false';
  const cookie = createSessionCookie('t', new Date(Date.now() + 60_000));
  assert.ok(!cookie.includes('Secure'));
});

test('clearSessionCookie returns an array of cookies with Expires=Thu, 01 Jan 1970', () => {
  process.env.AUTH_COOKIE_SECURE = 'false';
  const result = clearSessionCookie(AUTH_COOKIES.admin);
  assert.ok(Array.isArray(result));
  // The admin session also clears its readable companion flag.
  assert.equal(result.length, 2);
  assert.ok(result[0].startsWith(`${AUTH_COOKIES.admin}=;`));
  assert.ok(result[0].includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
  assert.ok(result[0].includes('HttpOnly'));
  assert.ok(result[1].startsWith(`${AUTH_COOKIES.adminFlag}=;`));
  assert.ok(result[1].includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
  assert.ok(!result[1].includes('HttpOnly'));

  const memberResult = clearSessionCookie(AUTH_COOKIES.member);
  assert.equal(memberResult.length, 1);
  assert.ok(memberResult[0].startsWith(`${AUTH_COOKIES.member}=;`));
});

// ---------- createMemberTierCookie / clearMemberTierCookie ----------

test('createMemberTierCookie accepts known tier values', () => {
  process.env.AUTH_COOKIE_SECURE = 'false';
  const expires = new Date(Date.now() + 60_000);
  const cookie = createMemberTierCookie('premium', expires);
  assert.ok(cookie.startsWith(`${AUTH_COOKIES.memberTier}=premium;`));
});

test('createMemberTierCookie coerces unknown tier values to "free"', () => {
  process.env.AUTH_COOKIE_SECURE = 'false';
  const expires = new Date(Date.now() + 60_000);
  const cookie = createMemberTierCookie('superuser', expires);
  assert.ok(cookie.startsWith(`${AUTH_COOKIES.memberTier}=free;`));
});

test('createMemberTierCookie is NOT HttpOnly (UI-readable hint cookie)', () => {
  process.env.AUTH_COOKIE_SECURE = 'false';
  const cookie = createMemberTierCookie('lifetime', new Date(Date.now() + 60_000));
  assert.ok(!cookie.includes('HttpOnly'));
});

test('clearMemberTierCookie clears the tier cookie without HttpOnly', () => {
  process.env.AUTH_COOKIE_SECURE = 'false';
  const result = clearMemberTierCookie();
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.ok(result[0].startsWith(`${AUTH_COOKIES.memberTier}=;`));
  assert.ok(!result[0].includes('HttpOnly'));
  assert.ok(result[0].includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
});

// ---------- member-csrf handler ----------

test('member-csrf rejects non-GET methods with 405 + Method not allowed', async () => {
  const response = await memberCsrfHandler({ httpMethod: 'POST', headers: {} });
  assert.equal(response.statusCode, 405);
  assert.deepEqual(JSON.parse(response.body || '{}'), { error: 'Method not allowed' });
});
