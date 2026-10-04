import crypto from 'node:crypto';
import { getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';
// GemaBot's own matching rules, so a trained note is one GemaBot can show
// (netlify.toml ships this file with the function).
import { isContextDependentPrompt, isLearnablePrompt } from '../../page-scripts/ai-agent-helpers.mjs';

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
    adminNote: row.admin_reply,
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
        ? await sql`
          SELECT * FROM chatbot_search_feedback
          WHERE status = ${status}
            AND COALESCE(was_expected, false) = false
          ORDER BY created_at DESC
          LIMIT 300
        `
        : await sql`
          SELECT * FROM chatbot_search_feedback
          WHERE COALESCE(was_expected, false) = false
          ORDER BY created_at DESC
          LIMIT 300
        `;
      const [stats] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE was_expected = true) AS expected_count,
          COUNT(*) FILTER (WHERE COALESCE(was_expected, false) = false) AS unexpected_count
        FROM chatbot_search_feedback
      `;
      return jsonResponse(200, {
        items: rows.map(formatFeedback),
        stats: {
          expected: Number(stats?.expected_count || 0),
          unexpected: Number(stats?.unexpected_count || 0),
        },
      });
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
      const action = String(payload?.action || '').trim().toLowerCase();

      if (!id) return jsonResponse(400, { error: 'id is required' });

      if (action === 'train') {
        const [item] = await sql`SELECT * FROM chatbot_search_feedback WHERE id = ${id}`;
        if (!item) return jsonResponse(404, { error: 'Feedback not found' });

        const prompt = String(item.cleaned_query || item.query || '')
          .replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 240);
        const explanation = String(item.feedback_text || '')
          .replace(/\s+/g, ' ').trim().slice(0, 600);

        if (!prompt || !explanation) {
          return jsonResponse(400, { error: 'Feedback must have a query and feedback text to use as training data' });
        }
        // GemaBot never shows a note saved under these keys (findLearnedEntry),
        // so training would close the feedback without changing any answer.
        // Leave it open for a reply instead.
        if (isContextDependentPrompt(prompt)) {
          return jsonResponse(400, {
            error: `Cannot train from "${prompt}": it only makes sense after an earlier GemaBot answer, so GemaBot would never show this note. Reply to the member or close the feedback instead.`,
          });
        }
        if (!isLearnablePrompt(prompt)) {
          return jsonResponse(400, {
            error: `Cannot train from "${prompt}": it has no English letters or digits for GemaBot to match a note to. Reply to the member or close the feedback instead.`,
          });
        }

        const SETTINGS_KEY = 'ai_agent_global_learnings_v1';
        const settingRows = await sql`
          SELECT setting_value FROM admin_settings WHERE setting_key = ${SETTINGS_KEY} LIMIT 1
        `;
        let entries = [];
        try {
          const raw = settingRows[0]?.setting_value;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
        } catch {}

        const deduped = entries.filter((e) => String(e?.prompt || '').toLowerCase() !== prompt);
        deduped.unshift({ prompt, explanation });
        const trimmed = deduped.slice(0, 200);

        await sql`
          INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
          VALUES (${SETTINGS_KEY}, ${JSON.stringify({ entries: trimmed })}, ${user.id}, NOW())
          ON CONFLICT (setting_key) DO UPDATE SET
            setting_value = EXCLUDED.setting_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `;
        await sql`
          UPDATE chatbot_search_feedback SET status = 'closed', updated_at = NOW() WHERE id = ${id}
        `;

        return jsonResponse(200, { trained: true, entriesCount: trimmed.length });
      }

      const status = String(payload?.status || '').trim().toLowerCase();
      const adminReplyRaw = payload?.adminReply ?? payload?.adminNote ?? payload?.note;
      const adminReply = adminReplyRaw == null ? null : String(adminReplyRaw).trim().slice(0, 2000);

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
