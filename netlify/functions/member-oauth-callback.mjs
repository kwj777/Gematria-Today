import {
  AUTH_COOKIES,
  createMemberEmailVerificationRequest,
  createMemberTierCookie,
  createSession,
  createSessionCookie,
  getSqlClient,
  markVerificationEmailDelivered,
} from './_member.mjs';
import {
  OAUTH_RETURN_PATH,
  OAUTH_STATE_COOKIE,
  buildReturnUrl,
  clearOAuthStateCookie,
  exchangeOAuthCode,
  fetchOAuthProfile,
  findOrCreateMemberFromOAuth,
  getOAuthClientCredentials,
  getOAuthProvider,
  redirectResponse,
  resolveOAuthRedirectUri,
  verifyOAuthState,
} from './_oauth.mjs';
import { jsonResponse, parseCookies } from './_auth.mjs';
import { sendMemberVerificationEmail } from './_email.mjs';
import { applyRateLimit, getClientIp, logRequestAudit } from './_security.mjs';
import { isSiteModuleEnabled } from './_site-modules.mjs';

// Provider-side errors are a fixed vocabulary; anything unrecognised becomes a
// generic code so a provider can never inject arbitrary text into the page.
const PROVIDER_ERROR_CODES = new Set([
  'access_denied',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
]);

// Two failures are only fixable at the password form, so those force the login
// tab. Every other failure returns the member to the tab they started on.
const PASSWORD_FORM_ERROR_CODES = new Set(['link_requires_password', 'staff_account_conflict']);

function failureRedirect(returnTo, code, cookies = []) {
  return redirectResponse(
    buildReturnUrl(returnTo, {
      ...(PASSWORD_FORM_ERROR_CODES.has(code) ? { auth: 'login' } : {}),
      oauth_error: code,
    }),
    { cookies: [clearOAuthStateCookie(), ...cookies] },
  );
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const params = event.queryStringParameters || {};
  let returnTo = OAUTH_RETURN_PATH;

  try {
    if (params.error) {
      const code = PROVIDER_ERROR_CODES.has(params.error) ? params.error : 'provider_error';
      return failureRedirect(returnTo, code);
    }

    // Both halves of the state check matter: the signature proves we minted it,
    // the cookie proves it came back to the browser that started the flow.
    const statePayload = verifyOAuthState({
      stateFromQuery: params.state,
      stateFromCookie: parseCookies(event)[OAUTH_STATE_COOKIE],
    });
    if (!statePayload) {
      return failureRedirect(returnTo, 'invalid_state');
    }
    returnTo = statePayload.r || OAUTH_RETURN_PATH;

    if (!params.code) {
      return failureRedirect(returnTo, 'missing_code');
    }

    const provider = getOAuthProvider(statePayload.p);
    const { clientId, clientSecret } = getOAuthClientCredentials(provider);
    if (!clientId || !clientSecret) {
      return failureRedirect(returnTo, 'provider_unavailable');
    }

    const sql = getSqlClient();
    await applyRateLimit(sql, event, {
      scope: 'member-oauth-callback-ip',
      key: getClientIp(event),
      limit: 12,
      windowMs: 10 * 60_000,
      blockMs: 15 * 60_000,
      message: 'Too many sign-in attempts from this IP address.',
      auditMetadata: { provider: provider.id },
    });

    const tokens = await exchangeOAuthCode(provider, {
      code: params.code,
      redirectUri: resolveOAuthRedirectUri(event),
      clientId,
      clientSecret,
      codeVerifier: statePayload.codeVerifier,
    });
    const oauthProfile = await fetchOAuthProfile(provider, tokens, { clientId, nonce: statePayload.n });
    const result = await findOrCreateMemberFromOAuth(sql, oauthProfile, {
      allowSignup: await isSiteModuleEnabled(sql, 'membership'),
    });

    // No session until the address is confirmed. Signing them in here would
    // make our own verification email pointless.
    if (result.requiresEmailVerification) {
      // The account row is already committed by this point. If the send throws,
      // reporting a generic sign-in failure would be a lie -- the account exists
      // and the member needs to be told the link is not coming.
      let delivery = { delivered: false };
      try {
        const verification = await createMemberEmailVerificationRequest(sql, result.member.id);
        delivery = await sendMemberVerificationEmail({
          sql,
          toEmail: result.member.email,
          username: result.member.username,
          verificationToken: verification.token,
          expiresAt: verification.expiresAt,
        });
        await markVerificationEmailDelivered(sql, result.member.id, delivery.delivered);
      } catch (deliveryError) {
        console.error('[member-oauth-callback] verification email failed:', deliveryError.message);
        delivery = { delivered: false, delivery: 'send-failed', reason: deliveryError.message };
      }
      await logRequestAudit(sql, event, {
        route: 'member-oauth-callback',
        action: 'authenticate',
        outcome: 'pending_email_verification',
        metadata: {
          provider: provider.id,
          memberId: result.member.id,
          // Same delivery record the password signup writes, so an outage shows
          // up in admin reports whichever door the member came through.
          verificationDelivery: delivery.delivery || 'unknown',
          ...(delivery.delivered ? {} : { verificationDeliveryError: delivery.reason || 'unknown' }),
        },
      });
      return redirectResponse(
        buildReturnUrl(returnTo, {
          auth: 'login',
          oauth: 'verify',
          oauth_provider: provider.id,
          oauth_email_sent: delivery.delivered ? '1' : '0',
        }),
        { cookies: [clearOAuthStateCookie()] },
      );
    }

    const { token, expiresAt } = await createSession(sql, result.member.id);
    await logRequestAudit(sql, event, {
      route: 'member-oauth-callback',
      action: 'authenticate',
      outcome: result.created ? 'success_signup' : 'success',
      metadata: { provider: provider.id, memberId: result.member.id, linked: result.linked },
    });

    return redirectResponse(
      buildReturnUrl(returnTo, {
        oauth: 'success',
        oauth_provider: provider.id,
        ...(result.created ? { oauth_new: '1' } : {}),
        ...(result.linked ? { oauth_linked: '1' } : {}),
        ...(result.passwordRetired ? { oauth_password_retired: '1' } : {}),
      }, { remove: ['auth'] }),
      {
        cookies: [
          clearOAuthStateCookie(),
          createSessionCookie(token, expiresAt, AUTH_COOKIES.member),
          createMemberTierCookie(result.member.membershipLevel, expiresAt),
        ],
      },
    );
  } catch (error) {
    if (error.statusCode === 429) {
      return failureRedirect(returnTo, 'rate_limited');
    }
    // Best-effort: a logging failure must never turn a handled error into an
    // unhandled one, and sql may not exist if getSqlClient is what threw.
    try {
      const auditSql = getSqlClient();
      await logRequestAudit(auditSql, event, {
        route: 'member-oauth-callback',
        action: 'authenticate',
        outcome: 'failure',
        metadata: { code: error.code || 'unknown', statusCode: error.statusCode || 500 },
      });
    } catch { /* logging is not worth failing the response over */ }
    // Codes the member can act on are passed through by name so the page can
    // show the matching instruction; anything else collapses to a generic code.
    const actionableCodes = new Set([
      'link_requires_password',
      'staff_account_conflict',
      'missing_email',
      'account_not_active',
      'provider_unavailable',
      'nonce_mismatch',
      'signup_closed',
    ]);
    if (error.code && actionableCodes.has(error.code)) {
      return failureRedirect(returnTo, error.code);
    }
    console.error('[member-oauth-callback] sign-in failed:', error.message);
    return failureRedirect(returnTo, 'sign_in_failed');
  }
}
