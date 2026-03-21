import { ensureAdminSchema, formatFeed, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    const rows = await sql`SELECT * FROM feeds WHERE is_active = TRUE ORDER BY created_at DESC`;
    return jsonResponse(200, { items: rows.map(formatFeed) });
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'Failed to load feeds' });
  }
}
