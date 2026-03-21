import crypto from 'node:crypto';
import { formatFeed, getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);

    if (event.httpMethod === 'GET') {
      const rows = await sql`SELECT * FROM feeds ORDER BY created_at DESC`;
      return jsonResponse(200, { items: rows.map(formatFeed) });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const rows = await sql`
        INSERT INTO feeds (id, name, url, category, notes, is_active, created_by, updated_at)
        VALUES (
          ${crypto.randomUUID()},
          ${String(body.name ?? '').trim()},
          ${String(body.url ?? '').trim()},
          ${String(body.category ?? '').trim() || null},
          ${String(body.notes ?? '').trim() || null},
          ${body.isActive !== false},
          ${user.id},
          NOW()
        )
        RETURNING *
      `;
      return jsonResponse(201, { item: formatFeed(rows[0]) });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return jsonResponse(400, { error: 'Missing feed id' });
      }
      await sql`DELETE FROM feeds WHERE id = ${id}`;
      return jsonResponse(200, { deleted: true });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Feed request failed' });
  }
}
