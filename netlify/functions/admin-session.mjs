import { AUTH_COOKIES, clearSessionCookie, jsonResponse } from './_auth.mjs';
import { getAuthenticatedUser } from './_admin.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { user } = await getAuthenticatedUser(event);
    return jsonResponse(200, { authenticated: true, user });
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return jsonResponse(statusCode, { authenticated: false }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.admin) });
  }
}
