import {
  generateCsrfToken,
  getOptionalAuthenticatedSession,
  getSqlClient,
  jsonResponse,
} from './_auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    const { sessionToken } = await getOptionalAuthenticatedSession(event, { sql });

    if (sessionToken) {
      return jsonResponse(200, { csrfToken: generateCsrfToken(sessionToken) });
    }

    return jsonResponse(200, { csrfToken: null });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to generate CSRF token' });
  }
}
