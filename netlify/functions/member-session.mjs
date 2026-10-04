import {
  AUTH_COOKIES,
  clearMemberTierCookie,
  clearSessionCookie,
  createMemberTierCookie,
  generateCsrfToken,
  jsonResponse,
  parseCookies,
} from './_auth.mjs';
import { getAuthenticatedMember } from './_member.mjs';

const MEMBER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function signedOutResponse() {
  return jsonResponse(200, { authenticated: false }, {
    'set-cookie': [...clearSessionCookie(AUTH_COOKIES.member), ...clearMemberTierCookie()],
  });
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // A visitor with no session cookie is signed out; there is nothing to look up.
  const cookies = parseCookies(event);
  if (!cookies[AUTH_COOKIES.member] && !cookies[AUTH_COOKIES.admin]) {
    return signedOutResponse();
  }

  try {
    const { user, member, profile, sessionToken } = await getAuthenticatedMember(event, { requireAuth: true });
    const tierExpiresAt = new Date(Date.now() + MEMBER_SESSION_TTL_MS);
    return jsonResponse(200, { authenticated: true, user, member, profile, csrfToken: generateCsrfToken(sessionToken) }, {
      'set-cookie': createMemberTierCookie(member?.membershipLevel, tierExpiresAt),
    });
  } catch (error) {
    // Only a session the database refused signs the member out. Every error
    // used to land here, so a Neon timeout or a cold-start DDL failure expired
    // a perfectly good session cookie site-wide, and pages such as premium
    // research read the 200 as "not a member". Anything else is a 503 that
    // leaves the cookies alone, so the next request can succeed.
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return signedOutResponse();
    }

    console.error('[member-session] session check failed:', error);
    return jsonResponse(503, { error: 'We could not check your sign-in right now. Please try again.' });
  }
}
