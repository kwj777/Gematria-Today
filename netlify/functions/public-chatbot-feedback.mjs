import crypto from 'node:crypto';
import {
  ensureAdminSchema,
  getSqlClient,
  jsonResponse,
  parseBody,
  syncBootstrapAdminUser,
} from './_admin.mjs';
import { getOptionalAuthenticatedSession } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp, logRequestAudit } from './_security.mjs';

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

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-chatbot-feedback' });
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);

    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'public-chatbot-feedback-ip',
        key: getClientIp(event),
        limit: 20,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many KnowBot feedback submissions. Please try again soon.',
      });
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

    await sql`
      INSERT INTO chatbot_search_feedback (
        id, user_id, query, cleaned_query, answer_text, sources_json, was_expected, feedback_text, status
      ) VALUES (
        ${crypto.randomUUID()},
        ${user?.id || null},
        ${query},
        ${cleanedQuery},
        ${answerText},
        ${JSON.stringify(sources)}::jsonb,
        ${wasExpected},
        ${feedbackText},
        ${wasExpected === true ? 'reviewed' : 'new'}
      )
    `;

    await logRequestAudit(sql, event, {
      route: 'public-chatbot-feedback',
      action: 'create',
      outcome: 'success',
      metadata: {
        hasSession: Boolean(user),
        wasExpected,
      },
    });

    return jsonResponse(201, {
      success: true,
      message: 'Feedback received and queued for admin review.',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to submit chatbot feedback' }, error.headers || {});
  }
}
