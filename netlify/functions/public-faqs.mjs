import { ensureAdminSchema, formatFaq, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    const rows = await sql`SELECT * FROM faqs WHERE is_published = TRUE ORDER BY sort_order ASC, created_at ASC`;
    return jsonResponse(200, { items: rows.map(formatFaq) });
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'Failed to load FAQ entries' });
  }
}
