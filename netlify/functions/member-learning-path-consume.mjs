import { getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { generateCsrfToken, validateCsrfRequest } from './_auth.mjs';

export async function consumeLearningPathStep1Intent(sql, userId) {
  const rows = await sql`
    UPDATE member_profiles
    SET preferences = preferences - 'learningPathStep1Intent',
        updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING preferences
  `;
  return rows[0]?.preferences ?? {};
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, member, sessionToken } = await getAuthenticatedMember(event, { requireAuth: true });

    if (!validateCsrfRequest(event, sessionToken)) {
      return jsonResponse(403, { error: 'Invalid or missing CSRF token' });
    }

    const preferences = await consumeLearningPathStep1Intent(sql, member.id);

    return jsonResponse(200, {
      preferences,
      csrfToken: generateCsrfToken(sessionToken),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to consume learning-path intent' });
  }
}
