import crypto from 'node:crypto';
import { cookieSecureDirective } from './_auth.mjs';
import { fetchWithTimeout } from './_security.mjs';
import {
  MEMBER_USERNAME_PATTERN,
  ensureMemberProfile,
  ensureMemberSchema,
  formatMemberUser,
  normalizeEmail,
} from './_member.mjs';

// Provider registry. Everything provider-specific lives here so adding a second
// provider is a new entry plus a normalizeProfile function, not a new endpoint.
export const OAUTH_PROVIDERS = Object.freeze({
  google: Object.freeze({
    id: 'google',
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    // Google mints id_token with either issuer spelling; both are legitimate.
    issuers: Object.freeze(['https://accounts.google.com', 'accounts.google.com']),
    authorizeParams: Object.freeze({
      // access_type=online: we never call Google APIs on the member's behalf
      // after sign-in, so asking for a refresh token would be storing a
      // long-lived credential with no use for it.
      access_type: 'online',
      // Without this a member who is signed into one Google account is silently
      // signed in as that account with no chance to pick another.
      prompt: 'select_account',
    }),
  }),
});

export const OAUTH_STATE_COOKIE = 'gematria_oauth_state';
export const OAUTH_STATE_TTL_MS = 10 * 60_000;
export const OAUTH_CALLBACK_PATH = '/api/member-oauth-callback';
export const OAUTH_RETURN_PATH = '/member.html';

// users.password_hash is NOT NULL, and an OAuth-only account has no password to
// put there. verifyPassword rejects anything that does not start with 'scrypt$',
// so this sentinel can never authenticate -- it is a placeholder, not a secret.
// Members who want a password use the account-recovery flow to set one.
export const OAUTH_ONLY_PASSWORD_HASH = 'oauth-only$no-password';

const OAUTH_FETCH_TIMEOUT_MS = 10_000;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 40;

export function getOAuthProvider(providerId) {
  const normalized = String(providerId || '').trim().toLowerCase();
  const provider = Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, normalized)
    ? OAUTH_PROVIDERS[normalized]
    : null;
  if (!provider) {
    throw Object.assign(new Error('Unknown sign-in provider'), { statusCode: 400, code: 'unknown_provider' });
  }
  return provider;
}

export function getOAuthClientCredentials(provider) {
  const clientId = String(process.env[provider.clientIdEnv] || '').trim();
  const clientSecret = String(process.env[provider.clientSecretEnv] || '').trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

export function isOAuthProviderConfigured(providerId) {
  try {
    return getOAuthClientCredentials(getOAuthProvider(providerId)).configured;
  } catch {
    return false;
  }
}

export function listConfiguredOAuthProviders() {
  return Object.values(OAUTH_PROVIDERS)
    .filter((provider) => getOAuthClientCredentials(provider).configured)
    .map((provider) => ({ id: provider.id, label: provider.label }));
}

function readHeader(event, name) {
  const lower = name.toLowerCase();
  if (typeof event?.headers?.get === 'function') {
    return String(event.headers.get(lower) || '').trim();
  }
  const headers = event?.headers || {};
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return String(headers[key] || '').trim();
    }
  }
  return '';
}

// The redirect_uri has to be byte-identical between the authorize call and the
// token exchange or Google returns redirect_uri_mismatch, so both endpoints
// derive it here rather than each building their own.
export function resolveSiteBaseUrl(event) {
  const configured = String(process.env.PUBLIC_SITE_URL || process.env.URL || '').trim().replace(/\/+$/, '');
  if (configured) {
    return configured;
  }
  const forwardedHost = readHeader(event, 'x-forwarded-host').split(',')[0].trim();
  const host = forwardedHost || readHeader(event, 'host');
  if (!host) {
    throw Object.assign(new Error('Unable to determine the site URL for the OAuth redirect'), {
      statusCode: 500,
      code: 'missing_site_url',
    });
  }
  const forwardedProto = readHeader(event, 'x-forwarded-proto').split(',')[0].trim();
  const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export function resolveOAuthRedirectUri(event) {
  return `${resolveSiteBaseUrl(event)}${OAUTH_CALLBACK_PATH}`;
}

function getOAuthStateSecret() {
  const secret = String(process.env.OAUTH_STATE_SECRET || process.env.CSRF_SECRET || '').trim();
  if (!secret) {
    console.error('[config] Neither OAUTH_STATE_SECRET nor CSRF_SECRET is set; OAuth sign-in cannot sign its state parameter.');
    throw Object.assign(new Error('Social sign-in is temporarily unavailable. Please try again shortly.'), {
      statusCode: 503,
      code: 'oauth_state_secret_missing',
    });
  }
  return secret;
}

function base64UrlEncode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), 'base64url').toString('utf8');
}

function signStatePayload(encodedPayload) {
  return crypto.createHmac('sha256', getOAuthStateSecret()).update(encodedPayload).digest('base64url');
}

// Only same-site paths are honoured as a post-sign-in destination. An open
// redirect here would let an attacker send the member (and their brand new
// session cookie) anywhere.
export function sanitizeReturnPath(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return OAUTH_RETURN_PATH;
  }
  return raw;
}

export function createOAuthState({ provider, returnTo = OAUTH_RETURN_PATH } = {}) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = {
    p: String(provider),
    n: nonce,
    r: sanitizeReturnPath(returnTo),
    t: Date.now(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const state = `${encodedPayload}.${signStatePayload(encodedPayload)}`;
  return { state, nonce, payload };
}

export function parseOAuthState(state) {
  const raw = String(state || '');
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) {
    return null;
  }
  const encodedPayload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const expected = signStatePayload(encodedPayload);
  if (signature.length !== expected.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (!Number.isFinite(payload.t) || Date.now() - payload.t > OAUTH_STATE_TTL_MS) {
    return null;
  }
  return payload;
}

// Signature plus TTL proves we minted the state; the cookie comparison proves it
// came back in the same browser that started the flow. Both are required -- a
// signed state on its own can be replayed into a victim's session (login CSRF).
export function verifyOAuthState({ stateFromQuery, stateFromCookie } = {}) {
  const queryState = String(stateFromQuery || '');
  const cookieState = String(stateFromCookie || '');
  if (!queryState || !cookieState || queryState.length !== cookieState.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(queryState, 'utf8'), Buffer.from(cookieState, 'utf8'))) {
    return null;
  }
  return parseOAuthState(queryState);
}

export function createOAuthStateCookie(state) {
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  // SameSite=Lax, not Strict: the callback arrives as a top-level GET navigation
  // from accounts.google.com, and Strict would withhold the cookie on exactly
  // that request, breaking every sign-in.
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly${cookieSecureDirective()}; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearOAuthStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly${cookieSecureDirective()}; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function buildAuthorizationUrl(provider, { clientId, redirectUri, state, nonce }) {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', provider.scope);
  url.searchParams.set('state', state);
  if (nonce) {
    url.searchParams.set('nonce', nonce);
  }
  for (const [key, value] of Object.entries(provider.authorizeParams || {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function exchangeOAuthCode(provider, { code, redirectUri, clientId, clientSecret }) {
  const response = await fetchWithTimeout(provider.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  }, OAUTH_FETCH_TIMEOUT_MS);

  const rawBody = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || !payload.access_token) {
    // The token endpoint echoes the client_secret back in some error shapes, so
    // only the provider's error code reaches the log, never the body.
    console.error(`[oauth] ${provider.id} token exchange failed`, {
      status: response.status,
      error: payload?.error || 'unparseable_response',
    });
    throw Object.assign(new Error('Could not complete sign-in with that provider'), {
      statusCode: 502,
      code: 'token_exchange_failed',
    });
  }

  return payload;
}

// The id_token arrives over a TLS connection to the provider's token endpoint
// that we authenticated with our client secret, so the transport already proves
// origin and the JWT signature adds nothing (this is the documented direct-
// exchange exception). The claims still have to be checked: a token minted for
// another client, or an expired one, must not be accepted.
export function decodeIdTokenClaims(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const claims = JSON.parse(base64UrlDecode(parts[1]));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

export function assertIdTokenClaims(provider, claims, { clientId, nonce } = {}) {
  if (!claims) {
    throw Object.assign(new Error('Sign-in provider returned an unreadable identity token'), {
      statusCode: 502,
      code: 'invalid_id_token',
    });
  }
  const issuers = provider.issuers || [];
  if (issuers.length && !issuers.includes(String(claims.iss || ''))) {
    throw Object.assign(new Error('Sign-in provider identity token has an unexpected issuer'), {
      statusCode: 502,
      code: 'invalid_id_token_issuer',
    });
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.map(String).includes(String(clientId))) {
    throw Object.assign(new Error('Sign-in provider identity token was issued for a different application'), {
      statusCode: 502,
      code: 'invalid_id_token_audience',
    });
  }
  if (Number.isFinite(Number(claims.exp)) && Number(claims.exp) * 1000 <= Date.now()) {
    throw Object.assign(new Error('Sign-in provider identity token has expired'), {
      statusCode: 502,
      code: 'expired_id_token',
    });
  }
  if (nonce && String(claims.nonce || '') !== String(nonce)) {
    throw Object.assign(new Error('Sign-in response did not match this browser session'), {
      statusCode: 400,
      code: 'nonce_mismatch',
    });
  }
  return claims;
}

export function normalizeOAuthProfile(provider, source) {
  const claims = source || {};
  const providerUserId = String(claims.sub || claims.id || '').trim();
  const email = normalizeEmail(claims.email);
  const displayName = String(claims.name || claims.given_name || '').trim();
  return {
    provider: provider.id,
    providerUserId,
    email,
    // Absent email_verified is treated as unverified. Guessing "probably fine"
    // here is what turns account linking into account takeover.
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    displayName,
    avatarUrl: String(claims.picture || '').trim() || null,
  };
}

export async function fetchOAuthProfile(provider, tokens, { clientId, nonce } = {}) {
  if (tokens.id_token) {
    const claims = assertIdTokenClaims(provider, decodeIdTokenClaims(tokens.id_token), { clientId, nonce });
    return normalizeOAuthProfile(provider, claims);
  }

  if (!provider.userInfoUrl) {
    throw Object.assign(new Error('Sign-in provider did not return an identity token'), {
      statusCode: 502,
      code: 'missing_id_token',
    });
  }

  const response = await fetchWithTimeout(provider.userInfoUrl, {
    headers: {
      authorization: `Bearer ${tokens.access_token}`,
      accept: 'application/json',
    },
  }, OAUTH_FETCH_TIMEOUT_MS);

  if (!response.ok) {
    console.error(`[oauth] ${provider.id} userinfo request failed`, { status: response.status });
    throw Object.assign(new Error('Could not read your profile from that provider'), {
      statusCode: 502,
      code: 'userinfo_failed',
    });
  }

  return normalizeOAuthProfile(provider, await response.json());
}

let oauthSchemaReadyPromise = null;

export async function ensureOAuthSchema(sql) {
  if (oauthSchemaReadyPromise) {
    return oauthSchemaReadyPromise;
  }

  oauthSchemaReadyPromise = (async () => {
    await ensureMemberSchema(sql);
    await sql`CREATE TABLE IF NOT EXISTS member_oauth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      display_name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS member_oauth_identities_provider_subject_idx
      ON member_oauth_identities (provider, provider_user_id)`;
    // One account per provider, so "sign in with Google" can never resolve to
    // two different rows for the same member.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS member_oauth_identities_user_provider_idx
      ON member_oauth_identities (user_id, provider)`;
  })();

  try {
    await oauthSchemaReadyPromise;
  } catch (error) {
    oauthSchemaReadyPromise = null;
    throw error;
  }
}

// Usernames are the public badge slug (/b/<username>), so an OAuth signup still
// has to end up with one that matches MEMBER_USERNAME_PATTERN. Providers hand us
// display names full of spaces and accents, so build a candidate rather than
// trusting whatever came back.
export function buildUsernameSeed(profile) {
  const fromEmail = String(profile?.email || '').split('@')[0] || '';
  const fromName = String(profile?.displayName || '');
  const raw = fromEmail || fromName;
  const slug = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.\-_]+|[.\-_]+$/g, '')
    .slice(0, USERNAME_MAX_LENGTH)
    .toLowerCase();
  if (slug.length >= USERNAME_MIN_LENGTH) {
    return slug;
  }
  return `member-${crypto.randomBytes(4).toString('hex')}`;
}

export function buildUsernameCandidate(seed, attempt) {
  if (attempt === 0 && MEMBER_USERNAME_PATTERN.test(seed)) {
    return seed;
  }
  const suffix = crypto.randomBytes(3).toString('hex');
  const trimmedSeed = seed.slice(0, USERNAME_MAX_LENGTH - suffix.length - 1).replace(/[.\-_]+$/, '');
  const candidate = `${trimmedSeed || 'member'}-${suffix}`;
  return MEMBER_USERNAME_PATTERN.test(candidate) ? candidate : `member-${crypto.randomBytes(6).toString('hex')}`;
}

export async function allocateUsername(sql, profile) {
  const seed = buildUsernameSeed(profile);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = buildUsernameCandidate(seed, attempt);
    const taken = await sql`SELECT 1 FROM users WHERE username = ${candidate} LIMIT 1`;
    if (!taken.length) {
      return candidate;
    }
  }
  return `member-${crypto.randomBytes(8).toString('hex')}`;
}

async function loadMemberRow(sql, userId) {
  const rows = await sql`
    SELECT id, username, email, display_name, membership_level, membership_started_at, membership_expires_at,
           stripe_customer_id, stripe_last_checkout_session_id, stripe_subscription_id, stripe_subscription_status,
           stripe_subscription_current_period_end, status, email_verified, created_at, updated_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;
  return rows.length ? formatMemberUser(rows[0]) : null;
}

async function upsertOAuthIdentity(sql, userId, profile) {
  await sql`
    INSERT INTO member_oauth_identities (
      id, user_id, provider, provider_user_id, email, email_verified, display_name, avatar_url
    )
    VALUES (
      ${crypto.randomUUID()},
      ${userId},
      ${profile.provider},
      ${profile.providerUserId},
      ${profile.email || null},
      ${Boolean(profile.emailVerified)},
      ${profile.displayName || null},
      ${profile.avatarUrl || null}
    )
    ON CONFLICT (provider, provider_user_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      email_verified = EXCLUDED.email_verified,
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      last_login_at = NOW()
  `;
}

async function markEmailVerifiedAndActivate(sql, userId) {
  await sql`
    UPDATE users
    SET email_verified = TRUE,
        status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
        updated_at = NOW()
    WHERE id = ${userId}
  `;
}

/**
 * Resolves a provider profile to a membership account, creating or linking one
 * as needed. Returns { member, profile, created, linked, requiresEmailVerification }.
 */
export async function findOrCreateMemberFromOAuth(sql, oauthProfile) {
  await ensureOAuthSchema(sql);

  if (!oauthProfile?.providerUserId) {
    throw Object.assign(new Error('Sign-in provider did not identify your account'), {
      statusCode: 502,
      code: 'missing_provider_subject',
    });
  }
  if (!oauthProfile.email) {
    throw Object.assign(new Error('Your provider account has no email address to create a membership with'), {
      statusCode: 400,
      code: 'missing_email',
    });
  }

  const existingIdentity = await sql`
    SELECT user_id
    FROM member_oauth_identities
    WHERE provider = ${oauthProfile.provider}
      AND provider_user_id = ${oauthProfile.providerUserId}
    LIMIT 1
  `;

  if (existingIdentity.length) {
    const userId = existingIdentity[0].user_id;
    if (oauthProfile.emailVerified) {
      await markEmailVerifiedAndActivate(sql, userId);
    }
    await upsertOAuthIdentity(sql, userId, oauthProfile);
    const member = await loadMemberRow(sql, userId);
    if (!member) {
      throw Object.assign(new Error('That membership account no longer exists'), { statusCode: 404, code: 'member_missing' });
    }
    if (member.status !== 'active') {
      throw Object.assign(new Error(`This membership account is ${member.status}`), { statusCode: 403, code: 'account_not_active' });
    }
    const memberProfile = await ensureMemberProfile(sql, userId, {});
    return { member, profile: memberProfile, created: false, linked: false, requiresEmailVerification: false };
  }

  const existingByEmail = await sql`
    SELECT id, role, status
    FROM users
    WHERE LOWER(email) = ${oauthProfile.email}
    LIMIT 1
  `;

  if (existingByEmail.length) {
    const existing = existingByEmail[0];
    // An admin signing in here would be handed a member-scoped session cookie
    // that every member endpoint then rejects as the wrong role. Send them to
    // the sign-in that matches their account instead of half-authenticating.
    if (existing.role !== 'member') {
      throw Object.assign(new Error('That email belongs to a staff account. Please sign in with your username and password.'), {
        statusCode: 409,
        code: 'staff_account_conflict',
      });
    }
    // Linking on an unverified provider email is the account-takeover path:
    // anyone who can create a provider account claiming this address would
    // inherit the existing membership.
    if (!oauthProfile.emailVerified) {
      throw Object.assign(new Error('An account already uses that email. Sign in with your password first, then link this provider.'), {
        statusCode: 409,
        code: 'link_requires_password',
      });
    }
    if (existing.status === 'suspended' || existing.status === 'deleted') {
      throw Object.assign(new Error(`This membership account is ${existing.status}`), { statusCode: 403, code: 'account_not_active' });
    }

    await markEmailVerifiedAndActivate(sql, existing.id);
    await upsertOAuthIdentity(sql, existing.id, oauthProfile);
    const member = await loadMemberRow(sql, existing.id);
    const memberProfile = await ensureMemberProfile(sql, existing.id, {});
    return { member, profile: memberProfile, created: false, linked: true, requiresEmailVerification: false };
  }

  const username = await allocateUsername(sql, oauthProfile);
  const displayName = oauthProfile.displayName || username;
  const emailVerified = Boolean(oauthProfile.emailVerified);
  const userId = crypto.randomUUID();

  const inserted = await sql`
    INSERT INTO users (
      id, username, email, display_name, password_hash, role, membership_level, status, email_verified
    )
    VALUES (
      ${userId},
      ${username},
      ${oauthProfile.email},
      ${displayName},
      ${OAUTH_ONLY_PASSWORD_HASH},
      'member',
      'free',
      ${emailVerified ? 'active' : 'pending'},
      ${emailVerified}
    )
    RETURNING id
  `;

  await upsertOAuthIdentity(sql, inserted[0].id, oauthProfile);
  const memberProfile = await ensureMemberProfile(sql, inserted[0].id, {});
  const member = await loadMemberRow(sql, inserted[0].id);
  return {
    member,
    profile: memberProfile,
    created: true,
    linked: false,
    // Google only withholds email_verified for a handful of Workspace domain
    // setups, but when it does we fall back to our own verification email
    // rather than trusting the address.
    requiresEmailVerification: !emailVerified,
  };
}

export function redirectResponse(location, { cookies = [] } = {}) {
  const headers = {
    location,
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
  };
  const response = {
    statusCode: 302,
    headers,
    body: '',
  };
  if (cookies.length) {
    response.multiValueHeaders = { 'set-cookie': cookies };
  }
  return response;
}

export function buildReturnUrl(returnPath, params = {}, { remove = [] } = {}) {
  const path = sanitizeReturnPath(returnPath);
  const [pathname, existingQuery = ''] = path.split('#')[0].split('?');
  const hash = path.includes('#') ? `#${path.split('#').slice(1).join('#')}` : '';
  const search = new URLSearchParams(existingQuery);
  for (const key of remove) {
    search.delete(key);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

