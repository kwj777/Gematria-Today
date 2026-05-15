import {
  AUTH_COOKIES,
  clearMemberTierCookie,
  clearSessionCookie,
  createMemberTierCookie,
  generateCsrfToken,
  jsonResponse,
} from './_auth.mjs';
import { getAuthenticatedMember } from './_member.mjs';

const MEMBER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { user, member, profile, sessionToken } = await getAuthenticatedMember(event, { requireAuth: true });
    const tierExpiresAt = new Date(Date.now() + MEMBER_SESSION_TTL_MS);
    return jsonResponse(200, { authenticated: true, user, member, profile, csrfToken: generateCsrfToken(sessionToken) }, {
      'set-cookie': createMemberTierCookie(member?.membershipLevel, tierExpiresAt),
    });
  } catch (error) {
    return jsonResponse(200, { authenticated: false }, {
      'set-cookie': [...clearSessionCookie(AUTH_COOKIES.member), ...clearMemberTierCookie()],
    });
  }
}
