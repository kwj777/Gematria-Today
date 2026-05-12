import crypto from 'node:crypto';
import { formatCalculationHistory, getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';

const MAX_HISTORY_ITEMS = 100;
const FREE_MEMBERSHIP_SAVE_LIMIT = 3;

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
      const noteInput = body.note === undefined || body.note === null
        ? null
        : (String(body.note).trim() || null);

      if (!queryText || !resultPayload) {
        return jsonResponse(400, { error: 'queryText and resultPayload are required' });
      }

      if (member.membershipLevel === 'free') {
        const [{ count }] = await sql`
          SELECT COUNT(*)::int AS count
          FROM calculation_history
          WHERE user_id = ${member.id}
        `;

        if (count >= FREE_MEMBERSHIP_SAVE_LIMIT) {
          return jsonResponse(403, {
            error: `Free memberships can save up to ${FREE_MEMBERSHIP_SAVE_LIMIT} calculations. Delete an older saved search to add a new one.`,
            code: 'FREE_SAVE_LIMIT_REACHED',
            limit: FREE_MEMBERSHIP_SAVE_LIMIT,
          });
        }
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
          result_payload,
          note
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
          ${JSON.stringify(resultPayload)}::jsonb,
          ${noteInput}
        )
        ON CONFLICT (user_id, LOWER(query_text), query_type, calculator_source) DO NOTHING
        RETURNING *
      `;

      if (!rows.length) {
        const normalizedQueryText = queryText.toLowerCase();
        let existing;
        if (noteInput !== null) {
          [existing] = await sql`
            UPDATE calculation_history
            SET note = ${noteInput}, updated_at = NOW()
            WHERE user_id = ${member.id}
              AND LOWER(query_text) = ${normalizedQueryText}
              AND query_type = ${queryType}
              AND calculator_source = ${calculatorSource}
            RETURNING *
          `;
        } else {
          [existing] = await sql`
            SELECT *
            FROM calculation_history
            WHERE user_id = ${member.id}
              AND LOWER(query_text) = ${normalizedQueryText}
              AND query_type = ${queryType}
              AND calculator_source = ${calculatorSource}
            ORDER BY created_at DESC
            LIMIT 1
          `;
        }
        return jsonResponse(200, { duplicate: true, item: formatCalculationHistory(existing) });
      }

      return jsonResponse(201, { item: formatCalculationHistory(rows[0]) });
    }

    if (event.httpMethod === 'PATCH') {
      const body = parseBody(event);
      const id = String(body.id ?? '').trim();
      if (!id) {
        return jsonResponse(400, { error: 'id is required' });
      }

      if (body.note === undefined) {
        return jsonResponse(400, { error: 'No updatable fields provided' });
      }

      const noteValue = body.note === null
        ? null
        : (String(body.note).trim() || null);

      const rows = await sql`
        UPDATE calculation_history
        SET note = ${noteValue}, updated_at = NOW()
        WHERE id = ${id}
          AND user_id = ${member.id}
        RETURNING *
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'History item not found' });
      }

      return jsonResponse(200, { item: formatCalculationHistory(rows[0]) });
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
