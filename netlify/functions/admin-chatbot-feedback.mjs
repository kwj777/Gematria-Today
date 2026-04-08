import crypto from 'node:crypto';
import { getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';

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
    userId: row.user_id,
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
    archivedByMemberAt: row.archived_by_member_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event, { requireAuth: true });
    if (!user) return jsonResponse(401, { error: 'Unauthorized' });

    const method = String(event?.httpMethod || '').toUpperCase();

    if (method === 'GET') {
      const url = new URL(event.rawUrl || `http://localhost${event.path || '/.netlify/functions/admin-chatbot-feedback'}`);
      const status = String(url.searchParams.get('status') || '').trim().toLowerCase();
      const rows = status && status !== 'all'
        ? await sql`SELECT * FROM chatbot_search_feedback WHERE status = ${status} ORDER BY created_at DESC LIMIT 300`
        : await sql`SELECT * FROM chatbot_search_feedback ORDER BY created_at DESC LIMIT 300`;
      return jsonResponse(200, { items: rows.map(formatFeedback) });
    }

    if (method === 'POST') {
      const payload = parseBody(event);
      const query = String(payload?.query || '').trim().slice(0, 400);
      const cleanedQuery = String(payload?.cleanedQuery || '').trim().slice(0, 400) || null;
      const answerText = String(payload?.answerText || '').trim().slice(0, 2000) || null;
      const feedbackText = String(payload?.feedbackText || '').trim().slice(0, 1500) || null;
      const wasExpectedRaw = payload?.wasExpected;
      const wasExpected = typeof wasExpectedRaw === 'boolean' ? wasExpectedRaw : null;
      const sources = sanitizeSources(payload?.sources);

      if (!query) {
        return jsonResponse(400, { error: 'query is required' });
      }

      const rows = await sql`
        INSERT INTO chatbot_search_feedback (
          id, user_id, query, cleaned_query, answer_text, sources_json, was_expected, feedback_text, status
        )
        VALUES (
          ${crypto.randomUUID()},
          ${user.id || null},
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
    }

    if (method === 'PATCH') {
      const payload = parseBody(event);
      const id = String(payload?.id || '').trim();
      const status = String(payload?.status || '').trim().toLowerCase();
      const adminReplyRaw = payload?.adminReply;
      const adminReply = adminReplyRaw == null ? null : String(adminReplyRaw).trim().slice(0, 2000);

      if (!id) return jsonResponse(400, { error: 'id is required' });
      if (status && !['new', 'reviewed', 'replied', 'closed'].includes(status)) {
        return jsonResponse(400, { error: 'status must be one of new, reviewed, replied, closed' });
      }

      const nextStatus = adminReply ? 'replied' : (status || null);
      const hasReplyUpdate = adminReplyRaw != null;
      const hasNonEmptyReply = typeof adminReply === 'string' && adminReply.trim().length > 0;

      const rows = await sql`
        UPDATE chatbot_search_feedback
        SET
          status = COALESCE(${nextStatus}, status),
          admin_reply = CASE
            WHEN ${!hasReplyUpdate} THEN admin_reply
            ELSE ${adminReply}
          END,
          replied_by = CASE
            WHEN ${!hasNonEmptyReply} THEN replied_by
            ELSE ${user.id}
          END,
          replied_at = CASE
            WHEN ${!hasNonEmptyReply} THEN replied_at
            ELSE NOW()
          END,
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!rows.length) return jsonResponse(404, { error: 'Feedback not found' });
      return jsonResponse(200, { item: formatFeedback(rows[0]) });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process chatbot feedback' }, error.headers || {});
  }
}
