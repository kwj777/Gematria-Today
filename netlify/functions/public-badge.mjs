import { getSqlClient, jsonResponse } from './_member.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp } from './_security.mjs';
import { ensureBadgeSchema, getBadgeDefinition, LEARNING_PATH_BADGE_SLUG } from './_badges.mjs';

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-badge' });

    const params = event.queryStringParameters || {};
    const username = String(params.user || params.u || '').trim();
    if (!username || !USERNAME_PATTERN.test(username)) {
      return jsonResponse(400, { error: 'Invalid username' });
    }
    const slug = String(params.slug || LEARNING_PATH_BADGE_SLUG).trim();
    const definition = getBadgeDefinition(slug);
    if (!definition) {
      return jsonResponse(404, { error: 'Unknown badge' });
    }

    const sql = getSqlClient();

    await applyRateLimit(sql, event, {
      scope: 'public-badge-ip',
      key: getClientIp(event),
      limit: 60,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many badge lookups. Please try again shortly.',
    });

    await ensureBadgeSchema(sql);

    const rows = await sql`
      SELECT u.username, u.display_name, b.earned_at
      FROM users u
      JOIN member_badges b ON b.user_id = u.id
      WHERE LOWER(u.username) = LOWER(${username})
        AND b.badge_slug = ${slug}
      LIMIT 1
    `;

    if (!rows.length) {
      return jsonResponse(404, { error: 'Badge not found for that user' });
    }

    const row = rows[0];
    return jsonResponse(200, {
      username: row.username,
      displayName: row.display_name || row.username,
      badge: {
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        earnedAt: row.earned_at,
      },
    }, {
      'cache-control': 'public, max-age=300, stale-while-revalidate=120',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load badge' });
  }
}
