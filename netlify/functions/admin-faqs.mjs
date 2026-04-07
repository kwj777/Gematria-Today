import crypto from 'node:crypto';
import { formatFaq, getAuthenticatedUser, jsonResponse, parseBody, routeByHttpMethod } from './_admin.mjs';

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);
    return await routeByHttpMethod(event, {
      GET: async () => {
      const rows = await sql`SELECT * FROM faqs ORDER BY sort_order ASC, created_at ASC`;
      return jsonResponse(200, { items: rows.map(formatFaq) });
      },

      POST: async () => {
      const body = parseBody(event);
      const question = String(body.question ?? '').trim();
      const answer = String(body.answer ?? '').trim();
      if (!question || !answer) {
        return jsonResponse(400, { error: 'Question and answer are required' });
      }

      const rows = await sql`
        INSERT INTO faqs (id, question, answer, sort_order, is_published, created_by, updated_at)
        VALUES (
          ${crypto.randomUUID()},
          ${question},
          ${answer},
          ${Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0},
          ${body.isPublished !== false},
          ${user.id},
          NOW()
        )
        RETURNING *
      `;
      return jsonResponse(201, { item: formatFaq(rows[0]) });
      },

      PUT: async () => {
      const body = parseBody(event);
      const id = String(body.id ?? '').trim();
      const question = String(body.question ?? '').trim();
      const answer = String(body.answer ?? '').trim();
      if (!id) {
        return jsonResponse(400, { error: 'FAQ id is required' });
      }
      if (!question || !answer) {
        return jsonResponse(400, { error: 'Question and answer are required' });
      }

      const rows = await sql`
        UPDATE faqs
        SET question = ${question},
            answer = ${answer},
            sort_order = ${Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0},
            is_published = ${body.isPublished !== false},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'FAQ entry not found' });
      }

      return jsonResponse(200, { item: formatFaq(rows[0]) });
      },

      DELETE: async () => {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return jsonResponse(400, { error: 'Missing FAQ id' });
      }
      await sql`DELETE FROM faqs WHERE id = ${id}`;
      return jsonResponse(200, { deleted: true });
      },
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'FAQ request failed' });
  }
}
