import crypto from 'node:crypto';
import { getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';

function sanitizeSources(rawSources) {
  if (!Array.isArray(rawSources)) return [];
  return rawSources
    .slice(0, 10)
    .map((source) => ({
      title: String(source?.title || '').trim().slice(0, 180),
      url: String(source?.url || '').trim().slice(0, 500),
      snippet: String(source?.snippet || '').trim().slice(0, 400),
    }))
    .filter((source) => source.title || source.url || source.snippet);
}

function formatFeedback(row) {
  return {
    id: row.id,
    query: row.query,
    cleanedQuery: row.cleaned_query,
    answerText: row.answer_text,
    sources: Array.isArray(row.sources_json) ? row.sources_json : [],
    wasExpected: row.was_expected,
    feedbackText: row.feedback_text,
    status: row.status,
    adminReply: row.admin_reply,
    repliedBy: row.replied_by,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function handler(event) {
  try {
    const method = String(event?.httpMethod || '').toUpperCase();
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });

    if (method === 'GET') {
      const rows = await sql`
        SELECT *
        FROM chatbot_search_feedback
        WHERE user_id = ${member.id}
          AND archived_by_member_at IS NULL
        ORDER BY created_at DESC
      `;
      return jsonResponse(200, { items: rows.map(formatFeedback) });
    }

    if (method === 'PATCH') {
      const payload = parseBody(event);
      const id = String(payload.id || '').trim();
      const action = String(payload.action || '').trim().toLowerCase();
      if (!id) return jsonResponse(400, { error: 'id is required' });
      if (action !== 'archive') return jsonResponse(400, { error: 'action must be archive' });

      const rows = await sql`
        UPDATE chatbot_search_feedback
        SET archived_by_member_at = NOW(), updated_at = NOW()
        WHERE id = ${id}
          AND user_id = ${member.id}
        RETURNING id
      `;

      if (!rows.length) return jsonResponse(404, { error: 'Feedback not found' });
      return jsonResponse(200, { item: { id: rows[0].id } });
    }

    if (method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const payload = parseBody(event);
    const query = String(payload?.query || '').trim().slice(0, 400);
    const cleanedQuery = String(payload?.cleanedQuery || '').trim().slice(0, 400) || null;
    const answerText = String(payload?.answerText || '').trim().slice(0, 2000) || null;
    const feedbackText = String(payload?.feedbackText || '').trim().slice(0, 1500) || null;
    const wasExpectedRaw = payload?.wasExpected;
    const wasExpected = typeof wasExpectedRaw === 'boolean' ? wasExpectedRaw : null;
    const sources = sanitizeSources(payload?.sources);

    if (!query) return jsonResponse(400, { error: 'query is required' });
    if (wasExpected === false && !feedbackText) {
      return jsonResponse(400, { error: 'feedbackText is required when wasExpected is false' });
    }

    const rows = await sql`
      INSERT INTO chatbot_search_feedback (
        id, user_id, query, cleaned_query, answer_text, sources_json, was_expected, feedback_text, status
      )
      VALUES (
        ${crypto.randomUUID()},
        ${member.id},
        ${query},
        ${cleanedQuery},
        ${answerText},
        ${JSON.stringify(sources)}::jsonb,
        ${wasExpected},
        ${feedbackText},
        ${wasExpected === true ? 'reviewed' : 'new'}
      )
      RETURNING *
    `;

    return jsonResponse(201, { item: formatFeedback(rows[0]) });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process chatbot feedback' }, error.headers || {});
  }
}
