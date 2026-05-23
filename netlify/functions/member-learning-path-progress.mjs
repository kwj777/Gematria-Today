import { getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';
import { generateCsrfToken, validateCsrfRequest } from './_auth.mjs';

const MAX_LEVEL = 3;

// Idempotently records the highest learning-path level a member has reached
// in their profile preferences (`learningPathLevelReached`). The dashboard
// reads this to drive the "Continue Level N" CTA on the aspirational card.
// Never decreases the recorded level — only raises it.
export async function recordLearningPathLevelReached(sql, userId, level) {
  const target = Number(level);
  if (!Number.isInteger(target) || target < 1 || target > MAX_LEVEL) {
    throw Object.assign(new Error('Invalid level'), { statusCode: 400 });
  }
  const rows = await sql`
    UPDATE member_profiles
    SET preferences = jsonb_set(
          COALESCE(preferences, '{}'::jsonb),
          '{learningPathLevelReached}',
          to_jsonb(GREATEST(
            COALESCE((preferences->>'learningPathLevelReached')::int, 0),
            ${target}::int
          )),
          true
        ),
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

    const body = parseBody(event) || {};
    const preferences = await recordLearningPathLevelReached(sql, member.id, body.level);

    return jsonResponse(200, {
      preferences,
      csrfToken: generateCsrfToken(sessionToken),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to record learning-path progress' });
  }
}
