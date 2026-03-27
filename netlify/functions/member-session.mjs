import { AUTH_COOKIES, clearSessionCookie, jsonResponse } from './_auth.mjs';
import { getAuthenticatedMember } from './_member.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { user, member, profile } = await getAuthenticatedMember(event, { requireAuth: true });
    return jsonResponse(200, { authenticated: true, user, member, profile });
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return jsonResponse(statusCode, { authenticated: false }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
  }
}
