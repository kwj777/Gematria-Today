import { AUTH_COOKIES, clearSessionCookie, deleteSession, jsonResponse } from './_auth.mjs';
import { getAuthenticatedMember } from './_member.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, sessionToken } = await getAuthenticatedMember(event, { requireAuth: false });
    if (sql && sessionToken) {
      await deleteSession(sql, sessionToken);
    }

    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'Failed to sign out' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
  }
}
