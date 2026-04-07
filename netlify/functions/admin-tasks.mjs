import crypto from 'node:crypto';
import { formatTask, getAuthenticatedUser, jsonResponse, parseBody, routeByHttpMethod } from './_admin.mjs';

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);
    return await routeByHttpMethod(event, {
      GET: async () => {
      const rows = await sql`SELECT * FROM tasks WHERE status = 'open' ORDER BY due_date ASC NULLS LAST, created_at DESC`;
      return jsonResponse(200, { items: rows.map(formatTask) });
      },

      POST: async () => {
      const body = parseBody(event);
      const rows = await sql`
        INSERT INTO tasks (id, title, owner, due_date, notes, status, created_by, updated_at)
        VALUES (
          ${crypto.randomUUID()},
          ${String(body.title ?? '').trim()},
          ${String(body.owner ?? '').trim() || null},
          ${body.dueDate || null},
          ${String(body.notes ?? '').trim() || null},
          'open',
          ${user.id},
          NOW()
        )
        RETURNING *
      `;
      return jsonResponse(201, { item: formatTask(rows[0]) });
      },

      DELETE: async () => {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return jsonResponse(400, { error: 'Missing task id' });
      }
      const rows = await sql`UPDATE tasks SET status = 'done', updated_at = NOW() WHERE id = ${id} RETURNING *`;
      return jsonResponse(200, { item: rows[0] ? formatTask(rows[0]) : null, deleted: true });
      },
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Task request failed' });
  }
}
