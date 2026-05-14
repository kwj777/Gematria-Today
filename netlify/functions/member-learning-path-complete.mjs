import { getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { generateCsrfToken, validateCsrfToken, getCsrfTokenFromRequest } from './_auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, member, sessionToken } = await getAuthenticatedMember(event, { requireAuth: true });

    const csrfToken = getCsrfTokenFromRequest(event);
    if (!validateCsrfToken(csrfToken, sessionToken)) {
      return jsonResponse(403, { error: 'Invalid or missing CSRF token' });
    }

    const rows = await sql`
      UPDATE member_profiles
      SET preferences = CASE
            WHEN preferences ? 'learningPathCompletedAt'
              THEN preferences
            ELSE jsonb_set(
              COALESCE(preferences, '{}'::jsonb),
              '{learningPathCompletedAt}',
              to_jsonb(NOW()::text),
              true
            )
          END,
          updated_at = NOW()
      WHERE user_id = ${member.id}
      RETURNING preferences
    `;

    return jsonResponse(200, {
      preferences: rows[0]?.preferences ?? {},
      csrfToken: generateCsrfToken(sessionToken),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to record learning-path completion' });
  }
}
