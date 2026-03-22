import {
  AUTH_COOKIES,
  authenticateMemberCredentials,
  clearSessionCookie,
  createSession,
  createSessionCookie,
  ensureMemberProfile,
  getSqlClient,
  jsonResponse,
  parseBody,
} from './_member.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    const { identifier = '', password = '' } = parseBody(event);
    const member = await authenticateMemberCredentials(sql, identifier, password);

    if (!member) {
      return jsonResponse(401, { error: 'Invalid username/email or password' }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.member) });
    }

    const profile = await ensureMemberProfile(sql, member.id, {});
    const { token, expiresAt } = await createSession(sql, member.id);

    return jsonResponse(200, {
      authenticated: true,
      member,
      profile,
    }, {
      'set-cookie': createSessionCookie(token, expiresAt, AUTH_COOKIES.member),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to sign in' });
  }
}
