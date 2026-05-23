import { getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { generateCsrfToken, validateCsrfRequest } from './_auth.mjs';
import { ensureLearningPathBadgeIfCompleted } from './_badges.mjs';

// Idempotent: writes `learningPathCompletedAt` only when it isn't already set,
// so a re-run on an already-completed profile preserves the original timestamp.
export async function recordLearningPathCompletion(sql, userId) {
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

    const preferences = await recordLearningPathCompletion(sql, member.id);
    const newBadge = await ensureLearningPathBadgeIfCompleted(sql, member.id);

    return jsonResponse(200, {
      preferences,
      newBadges: newBadge ? [newBadge] : [],
      csrfToken: generateCsrfToken(sessionToken),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to record learning-path completion' });
  }
}
