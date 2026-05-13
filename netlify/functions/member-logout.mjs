import { AUTH_COOKIES, clearMemberTierCookie, clearSessionCookie, deleteSession, jsonResponse } from './_auth.mjs';
import { getAuthenticatedMember } from './_member.mjs';

const clearedCookies = () => [clearSessionCookie(AUTH_COOKIES.member), clearMemberTierCookie()];

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, sessionToken } = await getAuthenticatedMember(event, { requireAuth: false });
    if (sql && sessionToken) {
      await deleteSession(sql, sessionToken);
    }

    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearedCookies() });
  } catch {
    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearedCookies() });
  }
}
