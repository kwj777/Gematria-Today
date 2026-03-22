import {
  AUTH_COOKIES,
  createSession,
  createSessionCookie,
  getSqlClient,
  jsonResponse,
  parseBody,
  registerMember,
} from './_member.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    const body = parseBody(event);
    const registration = await registerMember(sql, body);
    const { token, expiresAt } = await createSession(sql, registration.member.id);

    return jsonResponse(201, {
      authenticated: true,
      member: registration.member,
      profile: registration.profile,
    }, {
      'set-cookie': createSessionCookie(token, expiresAt, AUTH_COOKIES.member),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to register member' });
  }
}
