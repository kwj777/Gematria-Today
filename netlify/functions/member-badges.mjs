import { getAuthenticatedMember, jsonResponse } from './_member.mjs';
import { assertEndpointEnabled } from './_security.mjs';
import { BADGE_DEFINITIONS, getUserBadgeData } from './_badges.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: false, expensive: false, route: 'memberBadges' });
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    const data = await getUserBadgeData(sql, member.id);
    return jsonResponse(200, {
      ...data,
      catalog: BADGE_DEFINITIONS.map((badge) => ({
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        tier: badge.tier,
        metric: badge.metric,
        threshold: badge.threshold,
      })),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load badges' });
  }
}
