import crypto from 'node:crypto';
import { formatCalculationHistory, getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';

const MAX_HISTORY_ITEMS = 100;

export async function handler(event) {
  try {
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });

    if (event.httpMethod === 'GET') {
      const url = new URL(event.rawUrl || `http://localhost${event.path || '/.netlify/functions/member-history'}`);
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 25), 1), MAX_HISTORY_ITEMS);
      const rows = await sql`
        SELECT *
        FROM calculation_history
        WHERE user_id = ${member.id}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return jsonResponse(200, { history: rows.map(formatCalculationHistory) });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const queryText = String(body.queryText ?? '').trim();
      const queryType = String(body.queryType ?? 'word').trim() || 'word';
      const calculatorSource = String(body.calculatorSource ?? 'calculator').trim() || 'calculator';
      const resultPayload = body.resultPayload && typeof body.resultPayload === 'object' ? body.resultPayload : null;

      if (!queryText || !resultPayload) {
        return jsonResponse(400, { error: 'queryText and resultPayload are required' });
      }

      const rows = await sql`
        INSERT INTO calculation_history (
          id,
          user_id,
          query_text,
          query_type,
          calculator_source,
          gematria_total,
          digital_root,
          is_base_root,
          result_payload
        )
        VALUES (
          ${crypto.randomUUID()},
          ${member.id},
          ${queryText},
          ${queryType},
          ${calculatorSource},
          ${body.gematriaTotal ?? null},
          ${body.digitalRoot ?? null},
          ${typeof body.isBaseRoot === 'boolean' ? body.isBaseRoot : null},
          ${JSON.stringify(resultPayload)}::jsonb
        )
        RETURNING *
      `;

      return jsonResponse(201, { item: formatCalculationHistory(rows[0]) });
    }

    if (event.httpMethod === 'DELETE') {
      const body = parseBody(event);
      const id = String(body.id ?? '').trim();
      if (!id) {
        return jsonResponse(400, { error: 'id is required' });
      }

      const rows = await sql`
        DELETE FROM calculation_history
        WHERE id = ${id}
          AND user_id = ${member.id}
        RETURNING *
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'History item not found' });
      }

      return jsonResponse(200, { deleted: true, item: formatCalculationHistory(rows[0]) });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'History request failed' });
  }
}
