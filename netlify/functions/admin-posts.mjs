import crypto from 'node:crypto';
import { formatPost, getAuthenticatedUser, jsonResponse, parseBody, slugify } from './_admin.mjs';

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);

    if (event.httpMethod === 'GET') {
      const rows = await sql`SELECT * FROM posts ORDER BY COALESCE(published_at, created_at) DESC`;
      return jsonResponse(200, { items: rows.map(formatPost) });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const title = String(body.title ?? '').trim();
      if (!title) {
        return jsonResponse(400, { error: 'Title is required' });
      }
      const slug = slugify(body.slug || title);
      const status = body.status === 'draft' ? 'draft' : 'published';
      const rows = await sql`
        INSERT INTO posts (id, title, slug, tag, summary, body, read_time, status, published_at, created_by, updated_at)
        VALUES (
          ${crypto.randomUUID()},
          ${title},
          ${slug},
          ${String(body.tag ?? '').trim() || null},
          ${String(body.summary ?? '').trim()},
          ${String(body.body ?? '').trim()},
          ${String(body.readTime ?? '').trim() || null},
          ${status},
          ${status === 'published' ? new Date().toISOString() : null},
          ${user.id},
          NOW()
        )
        RETURNING *
      `;
      return jsonResponse(201, { item: formatPost(rows[0]) });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return jsonResponse(400, { error: 'Missing post id' });
      }
      await sql`DELETE FROM posts WHERE id = ${id}`;
      return jsonResponse(200, { deleted: true });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    const message = error.message?.includes('posts_slug_key') ? 'A post with this slug already exists' : (error.message || 'Post request failed');
    return jsonResponse(error.statusCode || 500, { error: message });
  }
}
