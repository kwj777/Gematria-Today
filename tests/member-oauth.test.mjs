import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
  OAUTH_ONLY_PASSWORD_HASH,
  allocateUsername,
  createOAuthState,
  createOAuthStateCookie,
  decodeIdTokenClaims,
  fetchOAuthProfile,
  findOrCreateMemberFromOAuth,
  getOAuthProvider,
  listConfiguredOAuthProviders,
  normalizeOAuthProfile,
  parseOAuthState,
  resolveOAuthRedirectUri,
  revokeUnprovenOAuthIdentities,
  sanitizeReturnPath,
  sanitizeSignupSource,
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

test('buildUsernameSeed produces a badge-safe slug from the display name', () => {
  assert.equal(buildUsernameSeed({ displayName: 'Renée Ó Súilleabháin' }), 'renee-o-suilleabhain');
  assert.match(buildUsernameSeed({ displayName: 'Al' }), /^member-[0-9a-f]{8}$/);
  assert.match(buildUsernameSeed({}), /^member-[0-9a-f]{8}$/);
});

test('the public badge slug is never derived from the email address', () => {
  // /b/<username> is public and there is no rename endpoint, so an email-derived
  // slug would permanently publish a guess at the member's address.
  const seed = buildUsernameSeed({ email: 'john.smith@example.com', displayName: '' });
  assert.ok(!seed.includes('john'), `seed ${JSON.stringify(seed)} leaks the email local part`);
  assert.match(seed, /^member-[0-9a-f]{8}$/);
  assert.equal(buildUsernameSeed({ email: 'john.smith@example.com', displayName: 'John S' }), 'john-s');
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
  rotatedIdentityRows = [],
  renamedRows = [],
} = {}) {
  const calls = [];

  function sql(strings, ...values) {
    const query = strings.join('?');
    calls.push({ query, values });

    if (/FROM member_oauth_identities AS identities/i.test(query)) {
      return Promise.resolve(identityRows);
    }
    if (/UPDATE member_oauth_identities/i.test(query)) {
      return Promise.resolve(rotatedIdentityRows);
    }
    if (/UPDATE users\s+SET username/i.test(query)) {
      return Promise.resolve(renamedRows);
    }
    if (/SELECT id, role, status, email_verified\s+FROM users/i.test(query)) {
      return Promise.resolve(userByEmailRows);
    }
    if (/SELECT 1 FROM users WHERE LOWER\(username\)/i.test(query)) {
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

// Guards the mock itself. Routing by regex over query text fails open -- a query
// this mock stops recognising falls through to [] and can make a test pass for
// the wrong reason -- so assert the branches actually fire.
test('the mock sql routes every query the account helpers issue', async () => {
  const { sql, calls } = createMockSql({ identityRows: [{ user_id: 'user-1', role: 'member', status: 'active', email_verified: true }] });
  await findOrCreateMemberFromOAuth(sql, verifiedProfile());
  const matched = (pattern) => calls.some(({ query }) => pattern.test(query));
  assert.ok(matched(/FROM member_oauth_identities AS identities/i), 'identity lookup route is live');
  assert.ok(matched(/UPDATE member_oauth_identities/i), 'rotation route is live');
  assert.ok(matched(/FROM users\s+WHERE id =/i), 'loadMemberRow route is live');
  assert.ok(matched(/INSERT INTO member_profiles/i), 'profile route is live');
});

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

test('findOrCreateMemberFromOAuth signs a lapsed premium member in as free', async () => {
  // The tier cookie and the first render after an OAuth sign-in come from this
  // member, so it has to agree with what getAuthenticatedMember will enforce.
  const { sql } = createMockSql({
    identityRows: [{ user_id: 'user-1', role: 'member', status: 'active', email_verified: true }],
    memberRow: { ...MEMBER_ROW, membership_level: 'premium', membership_expires_at: '2025-01-01T00:00:00.000Z' },
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile());
  assert.equal(result.member.membershipLevel, 'free');
});

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

// The membership switch closes sign-ups. Social sign-in used to create
// accounts regardless, so switching membership off left a second door open.
test('findOrCreateMemberFromOAuth creates no membership while sign-ups are closed', async () => {
  const { sql, calls } = createMockSql();
  await assert.rejects(
    findOrCreateMemberFromOAuth(sql, verifiedProfile(), { allowSignup: false }),
    (error) => error.code === 'signup_closed' && error.statusCode === 403,
  );
  assert.ok(!calls.some(({ query }) => /INSERT INTO users/i.test(query)), 'no account may be created');
});

test('findOrCreateMemberFromOAuth still signs existing members in while sign-ups are closed', async () => {
  const { sql } = createMockSql({
    identityRows: [{ user_id: 'user-1', role: 'member', status: 'active', email_verified: true }],
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile(), { allowSignup: false });
  assert.equal(result.created, false);
  assert.equal(result.member.id, 'user-1');

  const linking = createMockSql({ userByEmailRows: [{ id: 'user-1', role: 'member', status: 'active', email_verified: true }] });
  const linked = await findOrCreateMemberFromOAuth(linking.sql, verifiedProfile(), { allowSignup: false });
  assert.equal(linked.linked, true);
});

test('the OAuth callback passes the membership switch and names signup_closed for the page', () => {
  const callback = readFileSync(new URL('../netlify/functions/member-oauth-callback.mjs', import.meta.url), 'utf8');
  assert.match(callback, /allowSignup: await isSiteModuleEnabled\(sql, 'membership'\)/);
  assert.match(callback, /'signup_closed',/);
  const client = readFileSync(new URL('../member-oauth.js', import.meta.url), 'utf8');
  assert.match(client, /signup_closed: '/);
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
  const { sql, calls } = createMockSql({ identityRows: [{ user_id: 'user-1', role: 'member', status: 'active', email_verified: true }] });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile());
  assert.equal(result.created, false);
  assert.equal(result.linked, false);
  assert.equal(result.member.id, 'user-1');
  assert.ok(!calls.some(({ query }) => /SELECT id, role, status, email_verified\s+FROM users/i.test(query)), 'a known identity should not fall through to the email lookup');
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

  const [cookieState, codeVerifier] = decodeURIComponent(cookies[0].split(';')[0].split('=')[1]).split('~');
  assert.equal(cookieState, location.searchParams.get('state'));

  // PKCE: the challenge goes to the provider, the verifier stays in the cookie.
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const challenge = location.searchParams.get('code_challenge');
  assert.ok(challenge, 'authorize URL must carry a code_challenge');
  assert.equal(challenge, crypto.createHash('sha256').update(codeVerifier).digest('base64url'));
  // The verifier must never travel through the provider.
  assert.ok(!location.search.includes(codeVerifier), 'code_verifier must not appear in the authorize URL');
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

// ---------- regressions for the audit findings ----------
// Each test below fails against the pre-audit implementation.

test('linking retires the password of a local account that was never verified', async () => {
  // Account pre-hijacking: anyone can register any address by password, leaving a
  // pending row whose password is inert only because pending rows cannot sign in.
  // Linking activates that row, so the stale credential must not survive it.
  const { sql, calls } = createMockSql({
    userByEmailRows: [{ id: 'user-1', role: 'member', status: 'pending', email_verified: false }],
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile());

  assert.equal(result.linked, true);
  assert.equal(result.passwordRetired, true);

  const retire = calls.find(({ query }) => /UPDATE users\s+SET password_hash/i.test(query));
  assert.ok(retire, 'the unverified account password must be retired before the row is activated');
  assert.ok(retire.values.includes(OAUTH_ONLY_PASSWORD_HASH));
  assert.ok(
    calls.some(({ query }) => /DELETE FROM sessions/i.test(query)),
    'any session opened against the pre-registered row must be revoked',
  );

  // Ordering matters: activating first would arm the password, however briefly.
  const retireAt = calls.findIndex(({ query }) => /UPDATE users\s+SET password_hash/i.test(query));
  const activateAt = calls.findIndex(({ query }) => /SET email_verified = TRUE/i.test(query));
  assert.ok(retireAt < activateAt, 'the password must be retired before the account is activated');
});

test('linking leaves a genuinely verified account password alone', async () => {
  const { sql, calls } = createMockSql({
    userByEmailRows: [{ id: 'user-1', role: 'member', status: 'active', email_verified: true }],
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile());

  assert.equal(result.linked, true);
  assert.equal(result.passwordRetired, false);
  assert.ok(!calls.some(({ query }) => /UPDATE users\s+SET password_hash/i.test(query)));
  assert.ok(!calls.some(({ query }) => /DELETE FROM sessions/i.test(query)));
});

test('a linked identity whose user was promoted to admin is refused', async () => {
  // The staff refusal on the email branch only covers the first sign-in. Once an
  // identity row exists, a later promotion would otherwise hand out a member
  // cookie for an admin user -- which admin-session upgrades to an admin cookie.
  const { sql } = createMockSql({
    identityRows: [{ user_id: 'admin-1', role: 'admin', status: 'active', email_verified: true }],
  });
  await assert.rejects(
    findOrCreateMemberFromOAuth(sql, verifiedProfile()),
    (error) => error.code === 'staff_account_conflict',
  );
});

test('a linked identity on a suspended account is refused', async () => {
  const { sql } = createMockSql({
    identityRows: [{ user_id: 'user-1', role: 'member', status: 'suspended', email_verified: true }],
  });
  await assert.rejects(
    findOrCreateMemberFromOAuth(sql, verifiedProfile()),
    (error) => error.code === 'account_not_active',
  );
});

test('retrying on a still-pending account resends verification instead of dead-ending', async () => {
  const pendingRow = { ...MEMBER_ROW, status: 'pending', email_verified: false };
  const { sql } = createMockSql({
    identityRows: [{ user_id: 'user-1', role: 'member', status: 'pending', email_verified: false }],
    memberRow: pendingRow,
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile({ emailVerified: false }));
  assert.equal(result.requiresEmailVerification, true);
  assert.equal(result.member.status, 'pending');
});

test('a re-keyed provider account rotates its subject instead of colliding', async () => {
  // Two unique indexes cover member_oauth_identities but a statement gets one
  // arbiter, so a new sub for an existing (user, provider) pair used to raise
  // 23505 and break that member's sign-in permanently.
  const { sql, calls } = createMockSql({
    userByEmailRows: [{ id: 'user-1', role: 'member', status: 'active', email_verified: true }],
    rotatedIdentityRows: [{ id: 'identity-1' }],
  });
  await findOrCreateMemberFromOAuth(sql, verifiedProfile({ providerUserId: 'google-sub-2' }));

  const rotate = calls.find(({ query }) => /UPDATE member_oauth_identities/i.test(query));
  assert.ok(rotate, 'an existing (user, provider) row must be updated in place');
  assert.ok(rotate.values.includes('google-sub-2'));
  assert.ok(
    !calls.some(({ query }) => /INSERT INTO member_oauth_identities/i.test(query)),
    'a successful rotation must not also attempt the insert',
  );
});

test('a fresh identity still inserts when there is nothing to rotate', async () => {
  const { sql, calls } = createMockSql({ rotatedIdentityRows: [] });
  await findOrCreateMemberFromOAuth(sql, verifiedProfile());
  assert.ok(calls.some(({ query }) => /INSERT INTO member_oauth_identities/i.test(query)));
});

test('allocateUsername keeps trying until it finds a free handle', async () => {
  const seen = [];
  function sql(strings, ...values) {
    const query = strings.join('?');
    if (/SELECT 1 FROM users WHERE LOWER\(username\)/i.test(query)) {
      seen.push(values[0]);
      // First two candidates are taken; the third is free.
      return Promise.resolve(seen.length < 3 ? [{ '?column?': 1 }] : []);
    }
    return Promise.resolve([]);
  }
  const username = await allocateUsername(sql, { displayName: 'Kev Smith' });
  assert.equal(seen.length, 3);
  assert.equal(username, seen[2]);
  assert.equal(new Set(seen).size, 3, 'each attempt must propose a different handle');
  for (const candidate of seen) {
    assert.ok(MEMBER_USERNAME_PATTERN.test(candidate), `${candidate} is not a valid username`);
  }
});

// Answers the taken-check the way Postgres would for whichever comparison the
// query asks for, so an exact-match lookup is caught letting a case twin through.
function createUsernameTableSql(existingUsernames) {
  const seen = [];
  function sql(strings, ...values) {
    const query = strings.join('?');
    const lookup = /SELECT 1 FROM users WHERE (LOWER\(username\) = LOWER\(\?\)|username = \?)/i.exec(query);
    if (!lookup) {
      return Promise.resolve([]);
    }
    const candidate = String(values[0]);
    seen.push(candidate);
    const caseInsensitive = lookup[1].startsWith('LOWER');
    const taken = existingUsernames.some((username) => (caseInsensitive
      ? username.toLowerCase() === candidate.toLowerCase()
      : username === candidate));
    return Promise.resolve(taken ? [{ '?column?': 1 }] : []);
  }
  return { sql, seen };
}

test('allocateUsername treats a username taken in another letter case as taken', async () => {
  // The seed is lowercased, so "JohnSmith" used to come back as "johnsmith"
  // right beside the existing member, and /b/JohnSmith then resolved to either.
  const { sql, seen } = createUsernameTableSql(['JohnSmith']);
  const username = await allocateUsername(sql, { displayName: 'JohnSmith' });
  assert.equal(seen[0], 'johnsmith');
  assert.notEqual(username.toLowerCase(), 'johnsmith');
  assert.match(username, /^johnsmith-[0-9a-f]{6}$/);
});

test('allocateUsername never hands out a staff username, whatever the case', async () => {
  // A Google account named "KevAdmin" was allocated "kevadmin", which the
  // bootstrap's case-folded promotion then made a super admin.
  const { sql } = createUsernameTableSql([]);
  const seeded = await allocateUsername(sql, { displayName: 'KevAdmin' });
  assert.notEqual(seeded.toLowerCase(), 'kevadmin');

  // withEnv restores synchronously, before an async body has finished.
  const previous = { SUPER_ADMIN_USERNAMES: process.env.SUPER_ADMIN_USERNAMES, ADMIN_USERNAME: process.env.ADMIN_USERNAME };
  process.env.SUPER_ADMIN_USERNAMES = 'Moderator';
  process.env.ADMIN_USERNAME = 'SiteOps';
  try {
    for (const displayName of ['moderator', 'MODERATOR', 'siteops']) {
      const username = await allocateUsername(sql, { displayName });
      assert.notEqual(username.toLowerCase(), displayName.toLowerCase(), `${displayName} must not be allocated`);
      assert.ok(MEMBER_USERNAME_PATTERN.test(username), `${username} is not a valid username`);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('sanitizeReturnPath strips the URL characters browsers ignore', () => {
  // A browser removes ASCII tab, LF and CR before parsing a URL, so '/<tab>/host'
  // resolves to //host. Prefix-matching '//' never saw it coming.
  assert.equal(sanitizeReturnPath('/\t/evil.example'), '/member.html');
  assert.equal(sanitizeReturnPath('/\n/evil.example'), '/member.html');
  assert.equal(sanitizeReturnPath('/\r/evil.example'), '/member.html');
  assert.equal(sanitizeReturnPath('/\t\t//evil.example'), '/member.html');
  assert.equal(sanitizeReturnPath('/\\/evil.example'), '/member.html');
  assert.equal(sanitizeReturnPath('https:/\t/evil.example'), '/member.html');
  // Legitimate paths still survive intact.
  assert.equal(sanitizeReturnPath('/member.html?auth=login#authSection'), '/member.html?auth=login#authSection');
});

test('no sanitizeReturnPath output can leave the site', () => {
  const hostile = [
    '/\t/evil.example', '//evil.example', '/\\evil.example', 'https://evil.example',
    '/\t\\evil.example', '/%09/evil.example', '/ /evil.example', '///evil.example',
    'javascript:alert(1)', '/\r\n/evil.example',
  ];
  for (const candidate of hostile) {
    const resolved = new URL(sanitizeReturnPath(candidate), 'https://gematria.today');
    assert.equal(resolved.origin, 'https://gematria.today', `${JSON.stringify(candidate)} escaped the site`);
  }
});

test('assertIdTokenClaims requires an expiry rather than skipping the check', () => {
  const claims = { iss: 'accounts.google.com', aud: 'client-123', nonce: 'n' };
  assert.throws(
    () => assertIdTokenClaims(GOOGLE, claims, { clientId: 'client-123', nonce: 'n' }),
    (error) => error.code === 'expired_id_token',
  );
});

test('an OIDC provider that returns no id_token is refused, not read from userinfo', async () => {
  // The userinfo response carries no audience, issuer or nonce, so accepting it
  // would drop exactly the binding that stops a captured code being replayed.
  await assert.rejects(
    fetchOAuthProfile(GOOGLE, { access_token: 'token-without-id-token' }, { clientId: 'client-123', nonce: 'n' }),
    (error) => error.code === 'missing_id_token',
  );
});

test('createOAuthState keeps the PKCE verifier out of the state parameter', () => {
  const { state, codeVerifier, codeChallenge, cookieValue } = createOAuthState({ provider: 'google' });
  assert.ok(codeVerifier && codeChallenge);
  assert.ok(!state.includes(codeVerifier), 'the verifier must never travel to the provider');
  assert.equal(codeChallenge, crypto.createHash('sha256').update(codeVerifier).digest('base64url'));
  assert.equal(cookieValue, `${state}~${codeVerifier}`);
});

test('verifyOAuthState returns the verifier the cookie carried', () => {
  const { state, codeVerifier, cookieValue } = createOAuthState({ provider: 'google' });
  const payload = verifyOAuthState({ stateFromQuery: state, stateFromCookie: cookieValue });
  assert.equal(payload.codeVerifier, codeVerifier);
  assert.equal(payload.p, 'google');
  // A cookie carrying a different state still fails, verifier or not.
  const other = createOAuthState({ provider: 'google' });
  assert.equal(verifyOAuthState({ stateFromQuery: state, stateFromCookie: other.cookieValue }), null);
});

test('member-oauth-start will not emit a Location that leaves the site', async () => {
  const response = await withEnv(
    { GOOGLE_OAUTH_CLIENT_ID: undefined, GOOGLE_OAUTH_CLIENT_SECRET: undefined, DATABASE_URL: undefined },
    () => startHandler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { provider: 'google', return_to: '/\t/evil.example' },
    }),
  );
  assert.equal(new URL(response.headers.location, 'https://gematria.today').origin, 'https://gematria.today');
});

// ---------- linked identities, adopted rows, state cookie, signup source ----------

test('a linked identity cannot verify an account at an address it does not assert', async () => {
  // The identity is found by provider subject alone. A provider account that
  // created a pending row from an unverified claim to victim@example.com, then
  // moved to an address its holder really owns, used to activate the row it
  // never proved -- email_verified described the NEW address, not this one.
  const pendingRow = { ...MEMBER_ROW, email: 'victim@example.com', status: 'pending', email_verified: false };
  const { sql, calls } = createMockSql({
    identityRows: [{
      user_id: 'user-1', role: 'member', status: 'pending', email_verified: false, email: 'victim@example.com',
    }],
    memberRow: pendingRow,
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile({ email: 'attacker@example.net', emailVerified: true }));

  assert.ok(
    !calls.some(({ query }) => /SET email_verified = TRUE/i.test(query)),
    'a verified claim to some other address must not verify this account',
  );
  // Still pending, so the callback sends our own link to the account's address.
  assert.equal(result.requiresEmailVerification, true);
  assert.equal(result.member.email, 'victim@example.com');
});

test('a linked identity still verifies the account at the address it does assert', async () => {
  const { sql, calls } = createMockSql({
    identityRows: [{
      user_id: 'user-1', role: 'member', status: 'pending', email_verified: false, email: 'Kev@Example.com',
    }],
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile({ email: 'kev@example.com', emailVerified: true }));

  const activate = calls.find(({ query }) => /SET email_verified = TRUE/i.test(query));
  assert.ok(activate, 'a verified claim to the account\'s own address (in any letter case) verifies it');
  assert.ok(activate.values.includes('user-1'));
  assert.equal(result.requiresEmailVerification, false);
});

test('adopting a never-verified pending account replaces the username and display name its registrant chose', async () => {
  // Anyone can register any address by password and pick the handle. The row
  // is adopted on the owner's first Google sign-in, and the username is the
  // public /b/ slug with no rename endpoint, so it must not survive adoption.
  const { sql, calls } = createMockSql({
    userByEmailRows: [{ id: 'user-1', role: 'member', status: 'pending', email_verified: false }],
    renamedRows: [{ id: 'user-1' }],
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile({ displayName: 'Renee Owner' }));
  assert.equal(result.linked, true);
  assert.equal(result.passwordRetired, true);
  assert.equal(result.usernameReplaced, true);

  const rename = calls.find(({ query }) => /UPDATE users\s+SET username/i.test(query));
  assert.ok(rename, 'the unverified row must be renamed before it is adopted');
  assert.match(rename.query, /display_name = \?/);
  assert.ok(rename.values.includes('renee-owner'), 'the username comes from the provider profile, as for a new signup');
  assert.ok(rename.values.includes('Renee Owner'));
  assert.ok(rename.values.includes('user-1'));
  // Only a row nobody ever used: pending, unverified, unpaid and never reset.
  assert.match(rename.query, /AND status = 'pending'/);
  assert.match(rename.query, /AND email_verified = FALSE/);
  assert.match(rename.query, /membership_level = 'free'/);
  assert.match(rename.query, /stripe_customer_id IS NULL/);
  assert.match(rename.query, /stripe_subscription_id IS NULL/);
  assert.match(rename.query, /NOT EXISTS \(\s*SELECT 1 FROM account_recovery_requests ar/);
  assert.match(rename.query, /ar\.consumed_at IS NOT NULL/);

  assert.ok(
    calls.some(({ query }) => /SELECT 1 FROM users WHERE LOWER\(username\)/i.test(query)),
    'the replacement username is allocated like any other',
  );
  const renameAt = calls.findIndex(({ query }) => /UPDATE users\s+SET username/i.test(query));
  const activateAt = calls.findIndex(({ query }) => /SET email_verified = TRUE/i.test(query));
  assert.ok(renameAt < activateAt, 'the rename has to run while the row is still pending');
});

test('a pending row the rename does not apply to is not reported as renamed', async () => {
  // A paid or reset-proven pending row is exempt in the statement itself.
  const { sql } = createMockSql({
    userByEmailRows: [{ id: 'user-1', role: 'member', status: 'pending', email_verified: false }],
    renamedRows: [],
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile());
  assert.equal(result.usernameReplaced, false);
});

test('an active account that predates email verification keeps its username when linked', async () => {
  // email_verified was added with DEFAULT FALSE, so long-standing members are
  // active but unverified. They have been signing in and posting under that
  // name; it is theirs.
  const { sql, calls } = createMockSql({
    userByEmailRows: [{ id: 'user-1', role: 'member', status: 'active', email_verified: false }],
    renamedRows: [{ id: 'user-1' }],
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile({ displayName: 'Renee Owner' }));
  assert.equal(result.usernameReplaced, false);
  assert.ok(!calls.some(({ query }) => /UPDATE users\s+SET username/i.test(query)));
});

test('linking a verified local account keeps the username its owner chose', async () => {
  const { sql, calls } = createMockSql({
    userByEmailRows: [{ id: 'user-1', role: 'member', status: 'active', email_verified: true }],
    renamedRows: [{ id: 'user-1' }],
  });
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile({ displayName: 'Renee Owner' }));
  assert.equal(result.usernameReplaced, false);
  assert.ok(!calls.some(({ query }) => /UPDATE users\s+SET username/i.test(query)));
  assert.ok(!calls.some(({ query }) => /SELECT 1 FROM users WHERE LOWER\(username\)/i.test(query)));
});

test('the state cookie lifetime counts from receipt, not from the server clock', () => {
  // Expires alone is compared with the browser's clock, so a device running
  // more than ten minutes fast discarded the cookie on arrival and every
  // sign-in on it ended in invalid_state.
  const cookie = createOAuthStateCookie('state~verifier');
  assert.match(cookie, new RegExp(`; Max-Age=${OAUTH_STATE_TTL_MS / 1000}(;|$)`));
  assert.ok(cookie.startsWith(`${OAUTH_STATE_COOKIE}=`));
});

test('member-oauth-start sets the state cookie with a relative lifetime', async () => {
  const response = await withEnv(
    {
      GOOGLE_OAUTH_CLIENT_ID: 'client-123',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      PUBLIC_SITE_URL: 'https://gematria.today',
      DATABASE_URL: undefined,
    },
    () => startHandler({ httpMethod: 'GET', headers: {}, queryStringParameters: { provider: 'google' } }),
  );
  assert.match(response.multiValueHeaders['set-cookie'][0], /; Max-Age=600(;|$)/);
});

test('createOAuthState carries a recognised signup source and drops anything else', () => {
  const learning = createOAuthState({ provider: 'google', signupSource: 'learning_path_level_0' });
  assert.equal(parseOAuthState(learning.state).s, 'learning_path_level_0');

  for (const signupSource of ['', 'something_else', '<script>', undefined]) {
    const { state } = createOAuthState({ provider: 'google', signupSource });
    assert.equal(parseOAuthState(state).s, undefined, `${JSON.stringify(signupSource)} must not be carried`);
  }
  assert.equal(sanitizeSignupSource(' learning_path_level_0 '), 'learning_path_level_0');
  assert.equal(sanitizeSignupSource('constructor'), '');
});

test('member-oauth-start carries the signup source into the signed state', async () => {
  const response = await withEnv(
    {
      GOOGLE_OAUTH_CLIENT_ID: 'client-123',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      PUBLIC_SITE_URL: 'https://gematria.today',
      DATABASE_URL: undefined,
    },
    () => startHandler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: {
        provider: 'google',
        return_to: '/member.html?auth=register',
        signup_source: 'learning_path_level_0',
      },
    }),
  );
  const state = new URL(response.headers.location).searchParams.get('state');
  const payload = parseOAuthState(state);
  assert.equal(payload.s, 'learning_path_level_0');
  assert.equal(payload.r, '/member.html?auth=register');
});

function insertedPreferences(calls) {
  const insert = calls.find(({ query }) => /INSERT INTO member_profiles/i.test(query));
  assert.ok(insert, 'a profile row should be written');
  return JSON.parse(insert.values[1]);
}

test('a Google signup from the learning path seeds the step-1 intent like the password form does', async () => {
  const { sql, calls } = createMockSql();
  const result = await findOrCreateMemberFromOAuth(sql, verifiedProfile(), { signupSource: 'learning_path_level_0' });
  assert.equal(result.created, true);
  assert.deepEqual(insertedPreferences(calls), { learningPathStep1Intent: true });
});

test('a Google signup without a recognised source starts with empty preferences', async () => {
  for (const options of [undefined, {}, { signupSource: 'elsewhere' }]) {
    const { sql, calls } = createMockSql();
    await findOrCreateMemberFromOAuth(sql, verifiedProfile(), options);
    assert.deepEqual(insertedPreferences(calls), {});
  }
});

test('revokeUnprovenOAuthIdentities keeps only identities that vouch for the account address', async () => {
  const { sql, calls } = createMockSql();
  await revokeUnprovenOAuthIdentities(sql, 'user-1');
  const revoke = calls.find(({ query }) => /DELETE FROM member_oauth_identities/i.test(query));
  assert.ok(revoke, 'the revoke must issue a delete');
  assert.deepEqual(revoke.values, ['user-1']);
  assert.match(revoke.query, /identities\.user_id = \?/);
  assert.match(revoke.query, /identities\.email_verified = FALSE/);
  assert.match(revoke.query, /identities\.email IS NULL/);
  assert.match(revoke.query, /LOWER\(identities\.email\) IS DISTINCT FROM LOWER\(users\.email\)/);
});

// member-oauth.js is a classic browser script, so it runs in a vm against just
// enough of window and document to reveal the buttons and build their links.
function loadOAuthButtonsScript(containerAttributes, { href = 'https://gematria.today/gematria-account-setup.html' } = {}) {
  const source = readFileSync(new URL('../member-oauth.js', import.meta.url), 'utf8');
  const button = {
    href: '',
    attributes: { 'data-oauth-provider': 'google' },
    getAttribute(name) { return this.attributes[name] ?? null; },
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
  };
  const container = {
    getAttribute(name) { return containerAttributes[name] ?? null; },
    querySelectorAll() { return [button]; },
    classList: { toggle() {} },
  };
  const replaced = [];
  const window = {
    location: { href },
    history: { replaceState(_state, _title, url) { replaced.push(url); } },
    localStorage: { setItem() {} },
  };
  const context = {
    window,
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelectorAll: (selector) => (selector === '[data-oauth-buttons]' ? [container] : []),
      querySelector: () => null,
    },
    fetch: async () => ({ ok: true, json: async () => ({ providers: [{ id: 'google', label: 'Google' }] }) }),
    URL,
    URLSearchParams,
  };
  vm.runInNewContext(source, context);
  return { oauth: window.GematriaOAuth, button, replaced };
}

test('the OAuth button carries its container signup source to member-oauth-start', async () => {
  const { oauth, button } = loadOAuthButtonsScript({
    'data-oauth-buttons': '',
    'data-oauth-signup-source': 'learning_path_level_0',
    'data-oauth-return-to': '/member.html?auth=register',
  });
  await oauth.initOAuthButtons();
  const url = new URL(button.href, 'https://gematria.today');
  assert.equal(url.pathname, '/api/member-oauth-start');
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('return_to'), '/member.html?auth=register');
  assert.equal(url.searchParams.get('signup_source'), 'learning_path_level_0');
});

test('an OAuth button without a signup source sends none', async () => {
  const { oauth, button } = loadOAuthButtonsScript({ 'data-oauth-buttons': '', 'data-oauth-return-to': '/member.html' });
  await oauth.initOAuthButtons();
  assert.equal(new URL(button.href, 'https://gematria.today').searchParams.has('signup_source'), false);
});

test('the learning-path account setup page tags its Google button with the learning-path signup source', () => {
  // The password form on this page sends signupSource: 'learning_path_level_0';
  // without the same tag on the OAuth container a Google signup lost the
  // step-1 continuation.
  const page = readFileSync(new URL('../src/gematria-account-setup.html', import.meta.url), 'utf8');
  const container = /<div[^>]*\bdata-oauth-buttons\b[^>]*>/.exec(page);
  assert.ok(container, 'the page has an OAuth button container');
  assert.match(container[0], /\bdata-oauth-signup-source="learning_path_level_0"/);
});

test('the page explains a replaced username and strips the flag from the address bar', () => {
  const href = 'https://gematria.today/member.html?oauth=success&oauth_provider=google&oauth_linked=1'
    + '&oauth_password_retired=1&oauth_username_replaced=1';
  const { oauth, replaced } = loadOAuthButtonsScript({}, { href });
  assert.equal(oauth.outcome.tone, 'warning');
  assert.match(oauth.outcome.message, /password[^.]*removed/);
  assert.match(oauth.outcome.message, /username and display name[^.]*replaced with new ones from Google/);
  assert.deepEqual(replaced, ['/member.html']);

  const withoutRename = loadOAuthButtonsScript({}, {
    href: 'https://gematria.today/member.html?oauth=success&oauth_provider=google&oauth_linked=1&oauth_password_retired=1',
  });
  assert.doesNotMatch(withoutRename.oauth.outcome.message, /username/);
});
