import { clearSessionCookie, deleteSession, getAuthenticatedUser, jsonResponse } from './_admin.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, sessionToken } = await getAuthenticatedUser(event, { requireAuth: false });
    if (sql && sessionToken) {
      await deleteSession(sql, sessionToken);
    }
    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearSessionCookie() });
  } catch (error) {
    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearSessionCookie() });
  }
}
