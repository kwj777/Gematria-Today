import test from 'node:test';
import assert from 'node:assert/strict';

import { handler as adminLogoutHandler } from '../netlify/functions/admin-logout.mjs';
import { handler as memberLogoutHandler } from '../netlify/functions/member-logout.mjs';
import { handler as adminSessionHandler } from '../netlify/functions/admin-session.mjs';
import { handler as memberSessionHandler } from '../netlify/functions/member-session.mjs';
import {
  AUTH_COOKIES,
  clearSessionCookie,
  createAdminSessionCookies,
  createVisitorSessionCookie,
  createVisitorSessionToken,
  getOrCreateVisitorSession,
  getVisitorSessionToken,
  parseCookies,
} from '../netlify/functions/_auth.mjs';

function parseBody(response) {
  return JSON.parse(response.body || '{}');
}

function collectSetCookies(response) {
  const single = response.headers?.['set-cookie'];
  const multi = response.multiValueHeaders?.['set-cookie'];
  const values = [];
  if (Array.isArray(multi)) values.push(...multi);
  else if (typeof multi === 'string') values.push(multi);
  if (Array.isArray(single)) values.push(...single);
  else if (typeof single === 'string') values.push(single);
  return values.join('\n');
}

test('member logout is idempotent and returns 200 with authenticated false', async () => {
  const response = await memberLogoutHandler({ httpMethod: 'POST', headers: {} });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parseBody(response), { authenticated: false });
  const cookies = collectSetCookies(response);
  assert.match(cookies, /gematria_member_session=/);
  assert.match(cookies, /gematria_member_tier=/);
});

test('admin logout is idempotent and returns 200 with authenticated false', async () => {
  const response = await adminLogoutHandler({ httpMethod: 'POST', headers: {} });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parseBody(response), { authenticated: false });
  const cookies = collectSetCookies(response);
  assert.match(cookies, /gematria_admin_session=/);
  assert.match(cookies, /gematria_admin_flag=;/);
});

test('logout endpoints reject non-POST methods with standard error payload', async () => {
  const [memberResponse, adminResponse] = await Promise.all([
    memberLogoutHandler({ httpMethod: 'GET', headers: {} }),
    adminLogoutHandler({ httpMethod: 'GET', headers: {} }),
  ]);
  assert.equal(memberResponse.statusCode, 405);
  assert.equal(adminResponse.statusCode, 405);
  assert.deepEqual(parseBody(memberResponse), { error: 'Method not allowed' });
  assert.deepEqual(parseBody(adminResponse), { error: 'Method not allowed' });
});

test('session endpoints return unauthenticated payload shape when unauthenticated', async () => {
  const [memberResponse, adminResponse] = await Promise.all([
    memberSessionHandler({ httpMethod: 'GET', headers: {} }),
    adminSessionHandler({ httpMethod: 'GET', headers: {} }),
  ]);

  assert.equal(memberResponse.statusCode, 200);
  assert.equal(adminResponse.statusCode, 200);
  assert.deepEqual(parseBody(memberResponse), { authenticated: false });
  assert.deepEqual(parseBody(adminResponse), { authenticated: false });
});

test('session endpoints reject non-GET methods with standard error payload', async () => {
  const [memberResponse, adminResponse] = await Promise.all([
    memberSessionHandler({ httpMethod: 'POST', headers: {} }),
    adminSessionHandler({ httpMethod: 'POST', headers: {} }),
  ]);

  assert.equal(memberResponse.statusCode, 405);
  assert.equal(adminResponse.statusCode, 405);
  assert.deepEqual(parseBody(memberResponse), { error: 'Method not allowed' });
  assert.deepEqual(parseBody(adminResponse), { error: 'Method not allowed' });
});

// cookie-consent.js and conversion-tracking.js cannot see the HttpOnly admin
// session, so they look for this exact cookie name instead.
test('admin sessions come with a readable flag cookie that holds no token', () => {
  assert.equal(AUTH_COOKIES.adminFlag, 'gematria_admin_flag');
  const expiresAt = new Date(Date.now() + 60_000);
  const [session, flag] = createAdminSessionCookies('secret-token', expiresAt);
  assert.match(session, /^gematria_admin_session=secret-token;.*HttpOnly/);
  assert.match(flag, /^gematria_admin_flag=1; Path=\//);
  assert.doesNotMatch(flag, /HttpOnly/);
  assert.doesNotMatch(flag, /secret-token/);
  assert.ok(flag.includes(`Expires=${expiresAt.toUTCString()}`));
});

test('clearing the admin session clears its flag; other sessions leave it alone', () => {
  const adminCleared = clearSessionCookie(AUTH_COOKIES.admin).join('\n');
  assert.match(adminCleared, /gematria_admin_session=;/);
  assert.match(adminCleared, /gematria_admin_flag=;/);
  assert.doesNotMatch(clearSessionCookie(AUTH_COOKIES.member).join('\n'), /gematria_admin_flag/);
});

test('AUTH_COOKIES includes visitor cookie name', () => {
  assert.equal(AUTH_COOKIES.visitor, 'gematria_visitor_session');
});

test('createVisitorSessionToken returns a 32-char hex string', () => {
  const token = createVisitorSessionToken();
  assert.match(token, /^[0-9a-f]{32}$/);
});

test('createVisitorSessionToken produces unique values', () => {
  const tokens = new Set(Array.from({ length: 10 }, () => createVisitorSessionToken()));
  assert.equal(tokens.size, 10);
});

test('createVisitorSessionCookie returns a valid Set-Cookie header string', () => {
  const token = createVisitorSessionToken();
  const cookie = createVisitorSessionCookie(token);
  assert.ok(cookie.startsWith(`${AUTH_COOKIES.visitor}=`));
  assert.ok(cookie.includes('Path=/'));
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Expires='));
  assert.ok(cookie.includes(encodeURIComponent(token)));
});

test('getVisitorSessionToken returns null when no cookie is present', () => {
  const event = { headers: {} };
  assert.equal(getVisitorSessionToken(event), null);
});

test('getVisitorSessionToken reads existing visitor cookie', () => {
  const token = createVisitorSessionToken();
  const event = {
    headers: { cookie: `${AUTH_COOKIES.visitor}=${token}` },
  };
  assert.equal(getVisitorSessionToken(event), token);
});

test('getOrCreateVisitorSession creates a new session when no cookie exists', () => {
  const event = { headers: {} };
  const result = getOrCreateVisitorSession(event);
  assert.ok(result.isNew);
  assert.match(result.visitorSessionId, /^[0-9a-f]{32}$/);
  assert.ok(typeof result.visitorCookie === 'string');
  assert.ok(result.visitorCookie.includes(AUTH_COOKIES.visitor));
});

test('getOrCreateVisitorSession returns existing session when cookie is present', () => {
  const token = createVisitorSessionToken();
  const event = {
    headers: { cookie: `${AUTH_COOKIES.visitor}=${token}` },
  };
  const result = getOrCreateVisitorSession(event);
  assert.equal(result.isNew, false);
  assert.equal(result.visitorSessionId, token);
  assert.equal(result.visitorCookie, null);
});

test('getOrCreateVisitorSession does not affect admin or member cookies', () => {
  const adminToken = 'abc123';
  const memberToken = 'def456';
  const event = {
    headers: {
      cookie: `${AUTH_COOKIES.admin}=${adminToken}; ${AUTH_COOKIES.member}=${memberToken}`,
    },
  };
  const result = getOrCreateVisitorSession(event);
  assert.ok(result.isNew);
  const cookies = parseCookies(event);
  assert.equal(cookies[AUTH_COOKIES.admin], adminToken);
  assert.equal(cookies[AUTH_COOKIES.member], memberToken);
});
