import { getSqlClient, jsonResponse } from './_auth.mjs';
import {
  OAUTH_RETURN_PATH,
  buildAuthorizationUrl,
  buildReturnUrl,
  createOAuthState,
  createOAuthStateCookie,
  getOAuthClientCredentials,
  getOAuthProvider,
  redirectResponse,
  resolveOAuthRedirectUri,
  sanitizeReturnPath,
} from './_oauth.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';

// This endpoint is reached by clicking a link, so every outcome -- including
// every failure -- has to be a redirect back to a page that can explain itself.
// Returning JSON here would show the member a raw error document.
function failureRedirect(returnTo, code) {
  return redirectResponse(buildReturnUrl(returnTo, { oauth_error: code }));
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const params = event.queryStringParameters || {};
  const returnTo = sanitizeReturnPath(params.return_to || OAUTH_RETURN_PATH);

  let sql = null;
  try {
    sql = getSqlClient();
  } catch {
    // No database means no audit log and no rate limiting, but the OAuth
    // handshake itself does not need one -- do not block sign-in on it.
    sql = null;
  }

  try {
    const provider = getOAuthProvider(params.provider);
    const { clientId, clientSecret } = getOAuthClientCredentials(provider);
    if (!clientId || !clientSecret) {
      console.error(`[oauth] ${provider.id} sign-in requested but ${provider.clientIdEnv}/${provider.clientSecretEnv} are not configured.`);
      return failureRedirect(returnTo, 'provider_unavailable');
    }

    if (sql) {
      await applyRateLimit(sql, event, {
        scope: 'member-oauth-start-ip',
        key: getClientIp(event),
        limit: 12,
        windowMs: 10 * 60_000,
        blockMs: 15 * 60_000,
        message: 'Too many sign-in attempts from this IP address.',
        auditMetadata: { provider: provider.id },
      });
    }

    const { state, nonce } = createOAuthState({ provider: provider.id, returnTo });
    const authorizationUrl = buildAuthorizationUrl(provider, {
      clientId,
      redirectUri: resolveOAuthRedirectUri(event),
      state,
      nonce,
    });

    if (sql) {
      await logRequestAudit(sql, event, {
        route: 'member-oauth-start',
        action: 'authorize_redirect',
        outcome: 'success',
        metadata: { provider: provider.id },
      });
    }

    return redirectResponse(authorizationUrl, { cookies: [createOAuthStateCookie(state)] });
  } catch (error) {
    if (error.statusCode === 429) {
      return failureRedirect(returnTo, 'rate_limited');
    }
    if (error.code === 'unknown_provider') {
      return failureRedirect(returnTo, 'unknown_provider');
    }
    console.error('[member-oauth-start] unable to start OAuth flow:', error.message);
    return failureRedirect(returnTo, error.code || 'provider_error');
  }
}
