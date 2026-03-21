import { authenticateCredentials, clearSessionCookie, createSession, createSessionCookie, getSqlClient, jsonResponse, parseBody } from './_admin.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    const { username = '', password = '' } = parseBody(event);
    const user = await authenticateCredentials(sql, username.trim(), password);

    if (!user) {
      return jsonResponse(401, { error: 'Invalid username or password' }, { 'set-cookie': clearSessionCookie() });
    }

    const { token, expiresAt } = await createSession(sql, user.id);
    return jsonResponse(200, {
      authenticated: true,
      user: { id: user.id, username: user.username, role: user.role },
    }, {
      'set-cookie': createSessionCookie(token, expiresAt),
    });
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'Failed to log in' });
  }
}

