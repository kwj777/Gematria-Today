import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  MEMBER_USERNAME_PATTERN,
} from '../netlify/functions/_member.mjs';
import {
  OAUTH_PROVIDERS,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  assertIdTokenClaims,
  buildAuthorizationUrl,
  buildReturnUrl,
  buildUsernameCandidate,
  buildUsernameSeed,
  createOAuthState,
  decodeIdTokenClaims,
  findOrCreateMemberFromOAuth,
  getOAuthProvider,
  listConfiguredOAuthProviders,
  normalizeOAuthProfile,
  parseOAuthState,
  resolveOAuthRedirectUri,
  sanitizeReturnPath,
  verifyOAuthState,
} from '../netlify/functions/_oauth.mjs';
import { handler as providersHandler } from '../netlify/functions/member-oauth-providers.mjs';
import { handler as startHandler } from '../netlify/functions/member-oauth-start.mjs';
import { handler as callbackHandler } from '../netlify/functions/member-oauth-callback.mjs';

process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret';

const GOOGLE = OAUTH_PROVIDERS.google;

function withEnv(overrides, run) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function encodeIdToken(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.signature-not-checked`;
}

// ---------- state parameter ----------

test('createOAuthState round-trips through parseOAuthState', () => {
  const { state, nonce, payload } = createOAuthState({ provider: 'google', returnTo: '/member.html?auth=login' });
  const parsed = parseOAuthState(state);
  assert.equal(parsed.p, 'google');
  assert.equal(parsed.n, nonce);
  assert.equal(parsed.r, '/member.html?auth=login');
  assert.equal(parsed.t, payload.t);
});

test('parseOAuthState rejects a tampered payload', () => {
  const { state } = createOAuthState({ provider: 'google' });
  const [encodedPayload, signature] = state.split('.');
  const tampered = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  tampered.r = '/admin.html';
  const forged = `${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${signature}`;
  assert.equal(parseOAuthState(forged), null);
});

test('parseOAuthState rejects a state signed with a different secret', () => {
  const foreign = withEnv({ CSRF_SECRET: 'someone-elses-secret' }, () => createOAuthState({ provider: 'google' }).state);
  assert.equal(parseOAuthState(foreign), null);
});

test('parseOAuthState rejects a correctly signed but expired state', () => {
  // Signed with the real secret so only the age is wrong -- otherwise this
  // would pass for the signature check and never reach the TTL branch.
  const stalePayload = { p: 'google', n: 'nonce', r: '/member.html', t: Date.now() - (OAUTH_STATE_TTL_MS + 1_000) };
  const encoded = Buffer.from(JSON.stringify(stalePayload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.CSRF_SECRET).update(encoded).digest('base64url');
  assert.equal(parseOAuthState(`${encoded}.${signature}`), null);
  // Sanity check that the same construction parses when it is fresh.
  const freshEncoded = Buffer.from(JSON.stringify({ ...stalePayload, t: Date.now() })).toString('base64url');
  const freshSignature = crypto.createHmac('sha256', process.env.CSRF_SECRET).update(freshEncoded).digest('base64url');
  assert.ok(parseOAuthState(`${freshEncoded}.${freshSignature}`));
});

test('verifyOAuthState requires the query state and the cookie state to match', () => {
  const { state } = createOAuthState({ provider: 'google' });
  const other = createOAuthState({ provider: 'google' }).state;
  assert.ok(verifyOAuthState({ stateFromQuery: state, stateFromCookie: state }));
  assert.equal(verifyOAuthState({ stateFromQuery: state, stateFromCookie: other }), null);
  assert.equal(verifyOAuthState({ stateFromQuery: state, stateFromCookie: '' }), null);
  assert.equal(verifyOAuthState({ stateFromQuery: '', stateFromCookie: state }), null);
});

// ---------- redirect targets ----------

test('sanitizeReturnPath refuses off-site destinations', () => {
  assert.equal(sanitizeReturnPath('https://evil.example/steal'), '/member.html');
  assert.equal(sanitizeReturnPath('//evil.example/steal'), '/member.html');
  assert.equal(sanitizeReturnPath('/\\evil.example'), '/member.html');
  assert.equal(sanitizeReturnPath('member.html'), '/member.html');
  assert.equal(sanitizeReturnPath(''), '/member.html');
  assert.equal(sanitizeReturnPath('/member.html?auth=login#authSection'), '/member.html?auth=login#authSection');
});

test('buildReturnUrl keeps the existing query and hash while adding outcome params', () => {
  const url = buildReturnUrl('/member.html?auth=register#authSection', { oauth: 'success', oauth_new: '1' });
  const parsed = new URL(url, 'https://gematria.today');
  assert.equal(parsed.pathname, '/member.html');
  assert.equal(parsed.searchParams.get('auth'), 'register');
  assert.equal(parsed.searchParams.get('oauth'), 'success');
  assert.equal(parsed.searchParams.get('oauth_new'), '1');
  assert.equal(parsed.hash, '#authSection');
});

test('buildReturnUrl drops empty values instead of emitting bare keys', () => {
  assert.equal(buildReturnUrl('/member.html', { oauth: 'success', oauth_linked: '' }), '/member.html?oauth=success');
});

test('buildReturnUrl can drop a param the outcome makes obsolete', () => {
  // A signed-in member has no auth tab to return to, so the hint the button
  // round-tripped is removed rather than left in the address bar.
  assert.equal(
    buildReturnUrl('/member.html?auth=register', { oauth: 'success' }, { remove: ['auth'] }),
    '/member.html?oauth=success',
  );
});

test('resolveOAuthRedirectUri prefers the configured site URL over the request host', () => {
  const fromEnv = withEnv({ PUBLIC_SITE_URL: 'https://gematria.today/' }, () => resolveOAuthRedirectUri({ headers: { host: 'attacker.example' } }));
  assert.equal(fromEnv, 'https://gematria.today/api/member-oauth-callback');

  const fromHost = withEnv({ PUBLIC_SITE_URL: undefined, URL: undefined }, () => resolveOAuthRedirectUri({ headers: { host: 'deploy-preview.netlify.app' } }));
  assert.equal(fromHost, 'https://deploy-preview.netlify.app/api/member-oauth-callback');
});

// ---------- authorization URL ----------

test('buildAuthorizationUrl carries state, nonce, scope and the provider defaults', () => {
  const url = new URL(buildAuthorizationUrl(GOOGLE, {
    clientId: 'client-123',
    redirectUri: 'https://gematria.today/api/member-oauth-callback',
    state: 'state-value',
    nonce: 'nonce-value',
  }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-123');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://gematria.today/api/member-oauth-callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.get('nonce'), 'nonce-value');
  assert.equal(url.searchParams.get('access_type'), 'online');
  assert.equal(url.searchParams.get('prompt'), 'select_account');
});

test('getOAuthProvider rejects a provider that is not in the registry', () => {
  assert.throws(() => getOAuthProvider('myspace'), (error) => error.code === 'unknown_provider');
});

// ---------- id_token claims ----------

test('decodeIdTokenClaims reads the payload segment and rejects malformed tokens', () => {
  assert.deepEqual(decodeIdTokenClaims(encodeIdToken({ sub: '42' })), { sub: '42' });
  assert.equal(decodeIdTokenClaims('not-a-jwt'), null);
  assert.equal(decodeIdTokenClaims(''), null);
});

test('assertIdTokenClaims accepts a well-formed Google token', () => {
  const claims = {
    iss: 'https://accounts.google.com',
    aud: 'client-123',
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: 'nonce-value',
    sub: '42',
  };
  assert.equal(assertIdTokenClaims(GOOGLE, claims, { clientId: 'client-123', nonce: 'nonce-value' }), claims);
});

test('assertIdTokenClaims rejects a token minted for another client', () => {
  const claims = { iss: 'https://accounts.google.com', aud: 'someone-elses-client', exp: Math.floor(Date.now() / 1000) + 600 };
  assert.throws(
    () => assertIdTokenClaims(GOOGLE, claims, { clientId: 'client-123' }),
    (error) => error.code === 'invalid_id_token_audience',
  );
});

test('assertIdTokenClaims rejects an unexpected issuer', () => {
  const claims = { iss: 'https://accounts.evil.example', aud: 'client-123', exp: Math.floor(Date.now() / 1000) + 600 };
  assert.throws(
    () => assertIdTokenClaims(GOOGLE, claims, { clientId: 'client-123' }),
    (error) => error.code === 'invalid_id_token_issuer',
  );
});

test('assertIdTokenClaims rejects an expired token', () => {
  const claims = { iss: 'accounts.google.com', aud: 'client-123', exp: Math.floor(Date.now() / 1000) - 5 };
  assert.throws(
    () => assertIdTokenClaims(GOOGLE, claims, { clientId: 'client-123' }),
    (error) => error.code === 'expired_id_token',
  );
});

test('assertIdTokenClaims rejects a replayed token whose nonce does not match this browser', () => {
  const claims = { iss: 'accounts.google.com', aud: 'client-123', exp: Math.floor(Date.now() / 1000) + 600, nonce: 'other' };
  assert.throws(
    () => assertIdTokenClaims(GOOGLE, claims, { clientId: 'client-123', nonce: 'nonce-value' }),
    (error) => error.code === 'nonce_mismatch',
  );
});

// ---------- profile normalization ----------

test('normalizeOAuthProfile treats a missing email_verified claim as unverified', () => {
  const profile = normalizeOAuthProfile(GOOGLE, { sub: '42', email: 'Person@Example.COM', name: 'A Person' });
  assert.equal(profile.provider, 'google');
  assert.equal(profile.providerUserId, '42');
  assert.equal(profile.email, 'person@example.com');
  assert.equal(profile.emailVerified, false);
  assert.equal(profile.displayName, 'A Person');
});

test('normalizeOAuthProfile only trusts an explicit verified flag', () => {
  assert.equal(normalizeOAuthProfile(GOOGLE, { email_verified: true }).emailVerified, true);
  assert.equal(normalizeOAuthProfile(GOOGLE, { email_verified: 'true' }).emailVerified, true);
  assert.equal(normalizeOAuthProfile(GOOGLE, { email_verified: 1 }).emailVerified, false);
  assert.equal(normalizeOAuthProfile(GOOGLE, { email_verified: 'yes' }).emailVerified, false);
});

// ---------- username allocation ----------

test('buildUsernameSeed produces a badge-safe slug from provider profiles', () => {
  assert.equal(buildUsernameSeed({ email: 'Kev.Smith@example.com' }), 'kev.smith');
  assert.equal(buildUsernameSeed({ email: '', displayName: 'Renée Ó Súilleabháin' }), 'renee-o-suilleabhain');
  assert.match(buildUsernameSeed({ email: 'a@example.com' }), /^member-[0-9a-f]{8}$/);
  assert.match(buildUsernameSeed({}), /^member-[0-9a-f]{8}$/);
});

test('every generated username satisfies the badge-link username pattern', () => {
  const profiles = [
    { email: 'kev.smith@example.com' },
    { email: '', displayName: '张伟' },
    { email: '...@example.com' },
    { email: `${'x'.repeat(80)}@example.com` },
    {},
  ];
  for (const profile of profiles) {
    const seed = buildUsernameSeed(profile);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = buildUsernameCandidate(seed, attempt);
      assert.ok(
        MEMBER_USERNAME_PATTERN.test(candidate),
        `candidate ${JSON.stringify(candidate)} from ${JSON.stringify(profile)} is not a valid username`,
      );
    }
  }
});

test('buildUsernameCandidate adds a suffix once the plain seed is taken', () => {
  const first = buildUsernameCandidate('kev.smith', 0);
  const second = buildUsernameCandidate('kev.smith', 1);
  assert.equal(first, 'kev.smith');
  assert.notEqual(second, 'kev.smith');
  assert.match(second, /^kev\.smith-[0-9a-f]{6}$/);
});

// ---------- account resolution ----------

const MEMBER_ROW = {
  id: 'user-1',
  username: 'kev.smith',
  email: 'kev@example.com',
  display_name: 'Kev',
  membership_level: 'free',
  membership_started_at: null,
  membership_expires_at: null,
  stripe_customer_id: null,
  stripe_last_checkout_session_id: null,
  stripe_subscription_id: null,
  stripe_subscription_status: null,
  stripe_subscription_current_period_end: null,
  status: 'active',
  email_verified: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// Routes by query content the same way tests/account-recovery-lifecycle.test.mjs
// does, so the helpers run against the real neon() tagged-template shape.
function createMockSql({
  identityRows = [],
  userByEmailRows = [],
  memberRow = MEMBER_ROW,
  usernameTaken = false,
} = {}) {
  const calls = [];

  function sql(strings, ...values) {
    const query = strings.join('?');
    calls.push({ query, values });

    if (/SELECT user_id\s+FROM member_oauth_identities/i.test(query)) {
      return Promise.resolve(identityRows);
    }
    if (/SELECT id, role, status\s+FROM users/i.test(query)) {
      return Promise.resolve(userByEmailRows);
    }
    if (/SELECT 1 FROM users WHERE username/i.test(query)) {
      return Promise.resolve(usernameTaken ? [{ '?column?': 1 }] : []);
    }
    if (/INSERT INTO users/i.test(query)) {
      return Promise.resolve([{ id: memberRow.id }]);
    }
    if (/FROM users\s+WHERE id =/i.test(query)) {
      return Promise.resolve(memberRow ? [memberRow] : []);
    }
    if (/INSERT INTO member_profiles/i.test(query)) {
      return Promise.resolve([{
        user_id: memberRow?.id || 'user-1',
        preferences: {},
        favorite_cipher: null,
        timezone: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }]);
    }
    return Promise.resolve([]);
  }

  return { sql, calls };
}

function verifiedProfile(overrides = {}) {
  return {
    provider: 'google',
    providerUserId: 'google-sub-1',
    email: 'kev@example.com',
    emailVerified: true,
    displayName: 'Kev',
    avatarUrl: null,
    ...overrides,
  };
}

test('findOrCreateMemberFromOAuth creates a membership when nothing matches', async () => {
  const { sql, calls } = createMockSql();
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile());
  assert.equal(result.created, true);
  assert.equal(result.linked, false);
  assert.equal(result.requiresEmailVerification, false);
  assert.equal(result.member.id, 'user-1');

  const insert = calls.find(({ query }) => /INSERT INTO users/i.test(query));
  assert.ok(insert, 'a users row should be inserted');
  // A verified provider email means the account is usable immediately -- no
  // second verification email for an address the provider already confirmed.
  assert.ok(insert.values.includes('active'));
  assert.ok(insert.values.includes(true));
});

test('findOrCreateMemberFromOAuth links a verified provider email to an existing member', async () => {
  const { sql, calls } = createMockSql({ userByEmailRows: [{ id: 'user-1', role: 'member', status: 'active' }] });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile());
  assert.equal(result.linked, true);
  assert.equal(result.created, false);
  assert.ok(calls.some(({ query }) => /INSERT INTO member_oauth_identities/i.test(query)));
  assert.ok(!calls.some(({ query }) => /INSERT INTO users/i.test(query)), 'must not create a duplicate account');
});

test('findOrCreateMemberFromOAuth refuses to link an unverified provider email to an existing member', async () => {
  const { sql, calls } = createMockSql({ userByEmailRows: [{ id: 'user-1', role: 'member', status: 'active' }] });
  await assert.rejects(
    findOrCreateMemberFromOAuth(sql, verifiedProfile({ emailVerified: false })),
    (error) => error.code === 'link_requires_password' && error.statusCode === 409,
  );
  assert.ok(!calls.some(({ query }) => /INSERT INTO member_oauth_identities/i.test(query)));
});

test('findOrCreateMemberFromOAuth refuses to link a staff account', async () => {
  const { sql } = createMockSql({ userByEmailRows: [{ id: 'admin-1', role: 'admin', status: 'active' }] });
  await assert.rejects(
    findOrCreateMemberFromOAuth(sql, verifiedProfile()),
    (error) => error.code === 'staff_account_conflict',
  );
});

test('findOrCreateMemberFromOAuth refuses a suspended account', async () => {
  const { sql } = createMockSql({ userByEmailRows: [{ id: 'user-1', role: 'member', status: 'suspended' }] });
  await assert.rejects(
    findOrCreateMemberFromOAuth(sql, verifiedProfile()),
    (error) => error.code === 'account_not_active',
  );
});

test('findOrCreateMemberFromOAuth signs a returning member in through their stored identity', async () => {
  const { sql, calls } = createMockSql({ identityRows: [{ user_id: 'user-1' }] });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile());
  assert.equal(result.created, false);
  assert.equal(result.linked, false);
  assert.equal(result.member.id, 'user-1');
  assert.ok(!calls.some(({ query }) => /SELECT id, role, status\s+FROM users/i.test(query)), 'a known identity should not fall through to the email lookup');
});

test('findOrCreateMemberFromOAuth needs an email address to create a membership', async () => {
  const { sql } = createMockSql();
  await assert.rejects(
    findOrCreateMemberFromOAuth(sql, verifiedProfile({ email: '' })),
    (error) => error.code === 'missing_email',
  );
});

test('findOrCreateMemberFromOAuth needs a provider subject', async () => {
  const { sql } = createMockSql();
  await assert.rejects(
    findOrCreateMemberFromOAuth(sql, verifiedProfile({ providerUserId: '' })),
    (error) => error.code === 'missing_provider_subject',
  );
});

test('an unverified provider email on a brand new account still gets our own verification email', async () => {
  const { sql, calls } = createMockSql();
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile({ emailVerified: false }));
  assert.equal(result.created, true);
  assert.equal(result.requiresEmailVerification, true);
  const insert = calls.find(({ query }) => /INSERT INTO users/i.test(query));
  assert.ok(insert.values.includes('pending'));
});

// ---------- endpoints ----------

test('member-oauth-providers reports nothing while the credentials are unset', async () => {
  const response = await withEnv(
    { GOOGLE_OAUTH_CLIENT_ID: undefined, GOOGLE_OAUTH_CLIENT_SECRET: undefined },
    () => providersHandler({ httpMethod: 'GET', headers: {} }),
  );
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { providers: [] });
});

test('member-oauth-providers reports Google once both credentials are set', async () => {
  const providers = withEnv(
    { GOOGLE_OAUTH_CLIENT_ID: 'client-123', GOOGLE_OAUTH_CLIENT_SECRET: 'secret' },
    () => listConfiguredOAuthProviders(),
  );
  assert.deepEqual(providers, [{ id: 'google', label: 'Google' }]);
});

test('member-oauth-providers ignores a half-configured provider', () => {
  const providers = withEnv(
    { GOOGLE_OAUTH_CLIENT_ID: 'client-123', GOOGLE_OAUTH_CLIENT_SECRET: undefined },
    () => listConfiguredOAuthProviders(),
  );
  assert.deepEqual(providers, []);
});

test('member-oauth-start redirects to the provider with a state cookie', async () => {
  const response = await withEnv(
    {
      GOOGLE_OAUTH_CLIENT_ID: 'client-123',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      PUBLIC_SITE_URL: 'https://gematria.today',
      DATABASE_URL: undefined,
    },
    () => startHandler({ httpMethod: 'GET', headers: { host: 'gematria.today' }, queryStringParameters: { provider: 'google' } }),
  );

  assert.equal(response.statusCode, 302);
  const location = new URL(response.headers.location);
  assert.equal(location.host, 'accounts.google.com');

  const cookies = response.multiValueHeaders['set-cookie'];
  assert.equal(cookies.length, 1);
  assert.ok(cookies[0].startsWith(`${OAUTH_STATE_COOKIE}=`));
  assert.ok(cookies[0].includes('HttpOnly'));
  // Strict would withhold the cookie on the top-level redirect back from the
  // provider, which is the one request that needs it.
  assert.ok(cookies[0].includes('SameSite=Lax'));

  const cookieState = decodeURIComponent(cookies[0].split(';')[0].split('=')[1]);
  assert.equal(cookieState, location.searchParams.get('state'));
});

test('member-oauth-start sends an unconfigured provider back to the page instead of an error document', async () => {
  const response = await withEnv(
    { GOOGLE_OAUTH_CLIENT_ID: undefined, GOOGLE_OAUTH_CLIENT_SECRET: undefined, DATABASE_URL: undefined },
    () => startHandler({ httpMethod: 'GET', headers: {}, queryStringParameters: { provider: 'google' } }),
  );
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/member.html?oauth_error=provider_unavailable');
});

test('member-oauth-start refuses an unknown provider', async () => {
  const response = await startHandler({ httpMethod: 'GET', headers: {}, queryStringParameters: { provider: 'myspace' } });
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/member.html?oauth_error=unknown_provider');
});

test('member-oauth-start will not redirect off-site even when asked to', async () => {
  const response = await withEnv(
    { GOOGLE_OAUTH_CLIENT_ID: undefined, GOOGLE_OAUTH_CLIENT_SECRET: undefined, DATABASE_URL: undefined },
    () => startHandler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { provider: 'google', return_to: 'https://evil.example/' },
    }),
  );
  assert.equal(response.headers.location, '/member.html?oauth_error=provider_unavailable');
});

test('member-oauth-callback reports a cancelled sign-in and clears the state cookie', async () => {
  const response = await callbackHandler({
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: { error: 'access_denied' },
  });
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/member.html?oauth_error=access_denied');
  assert.ok(response.multiValueHeaders['set-cookie'][0].includes('Expires=Thu, 01 Jan 1970'));
});

test('member-oauth-callback collapses an unrecognised provider error to a generic code', async () => {
  const response = await callbackHandler({
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: { error: '<script>alert(1)</script>' },
  });
  assert.equal(response.headers.location, '/member.html?oauth_error=provider_error');
});

test('member-oauth-callback rejects a state that never came from this browser', async () => {
  const { state } = createOAuthState({ provider: 'google' });
  const response = await callbackHandler({
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: { state, code: 'auth-code' },
  });
  assert.equal(response.headers.location, '/member.html?oauth_error=invalid_state');
});

test('member-oauth-callback rejects a state cookie that does not match the returned state', async () => {
  const { state } = createOAuthState({ provider: 'google' });
  const other = createOAuthState({ provider: 'google' }).state;
  const response = await callbackHandler({
    httpMethod: 'GET',
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${encodeURIComponent(other)}` },
    queryStringParameters: { state, code: 'auth-code' },
  });
  assert.equal(response.headers.location, '/member.html?oauth_error=invalid_state');
});

test('member-oauth-callback requires an authorization code', async () => {
  const { state } = createOAuthState({ provider: 'google', returnTo: '/member.html?auth=login' });
  const response = await callbackHandler({
    httpMethod: 'GET',
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}` },
    queryStringParameters: { state },
  });
  assert.equal(response.headers.location, '/member.html?auth=login&oauth_error=missing_code');
});
