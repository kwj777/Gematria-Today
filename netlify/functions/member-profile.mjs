import { getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';
import { generateCsrfToken, validateCsrfToken, getCsrfTokenFromRequest } from './_auth.mjs';

export async function handler(event) {
  try {
    const { sql, member, profile, sessionToken } = await getAuthenticatedMember(event, { requireAuth: true });

    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { member, profile, csrfToken: generateCsrfToken(sessionToken) });
    }

    if (event.httpMethod === 'PATCH' || event.httpMethod === 'PUT') {
      const csrfToken = getCsrfTokenFromRequest(event);
      if (!validateCsrfToken(csrfToken, sessionToken)) {
        return jsonResponse(403, { error: 'Invalid or missing CSRF token' });
      }

      const body = parseBody(event);
      const displayName = String(body.displayName ?? member.displayName ?? '').trim() || member.username;
      const favoriteCipher = body.favoriteCipher ? String(body.favoriteCipher).trim() : null;
      const timezone = body.timezone ? String(body.timezone).trim() : null;
      const preferences = body.preferences && typeof body.preferences === 'object' ? body.preferences : profile.preferences || {};

      const memberRows = await sql`
        UPDATE users
        SET display_name = ${displayName},
            updated_at = NOW()
        WHERE id = ${member.id}
        RETURNING id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, created_at, updated_at
      `;

      const profileRows = await sql`
        INSERT INTO member_profiles (user_id, preferences, favorite_cipher, timezone)
        VALUES (${member.id}, ${JSON.stringify(preferences)}::jsonb, ${favoriteCipher}, ${timezone})
        ON CONFLICT (user_id)
        DO UPDATE SET
          preferences = EXCLUDED.preferences,
          favorite_cipher = EXCLUDED.favorite_cipher,
          timezone = EXCLUDED.timezone,
          updated_at = NOW()
        RETURNING *
      `;

      return jsonResponse(200, {
        member: {
          id: memberRows[0].id,
          username: memberRows[0].username,
          email: memberRows[0].email,
          displayName: memberRows[0].display_name,
          membershipLevel: memberRows[0].membership_level,
          membershipStartedAt: memberRows[0].membership_started_at,
          membershipExpiresAt: memberRows[0].membership_expires_at,
          stripeCustomerId: memberRows[0].stripe_customer_id,
          stripeLastCheckoutSessionId: memberRows[0].stripe_last_checkout_session_id,
          status: memberRows[0].status,
          emailVerified: memberRows[0].email_verified,
          createdAt: memberRows[0].created_at,
          updatedAt: memberRows[0].updated_at,
        },
        profile: {
          userId: profileRows[0].user_id,
          preferences: profileRows[0].preferences,
          favoriteCipher: profileRows[0].favorite_cipher,
          timezone: profileRows[0].timezone,
          createdAt: profileRows[0].created_at,
          updatedAt: profileRows[0].updated_at,
        },
      });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Profile request failed' });
  }
}
