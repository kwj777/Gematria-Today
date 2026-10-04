import crypto from 'node:crypto';
import { getAuthenticatedMember, getSqlClient, jsonResponse, parseBody, parseBoundedIntegerParam } from './_member.mjs';
import { assertSiteModuleEnabled } from './_site-modules.mjs';

const DEFAULT_SESSION_PAGE_SIZE = 20;
const MAX_SESSIONS = 100;
const MAX_TITLE_LENGTH = 120;
const MAX_TOPIC_LENGTH = 120;
const MAX_MESSAGES = 80;
const MAX_MESSAGE_LENGTH = 2000;

function normalizeText(value, maxLength) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeMessage(entry = {}) {
  const role = String(entry.role || '').trim().toLowerCase();
  const text = normalizeText(entry.text, MAX_MESSAGE_LENGTH);
  if (!text || (role !== 'user' && role !== 'assistant')) {
    return null;
  }

  return { role, text };
}

function normalizeTranscript(transcript) {
  if (!Array.isArray(transcript)) {
    return [];
  }

  return transcript
    .map((entry) => normalizeMessage(entry))
    .filter(Boolean)
    .slice(0, MAX_MESSAGES);
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return {
    source: normalizeText(metadata.source, 60) || 'ai_agent',
    rounds: Number.isFinite(Number(metadata.rounds)) ? Number(metadata.rounds) : null,
  };
}

function formatSession(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    topic: row.topic,
    transcript: Array.isArray(row.transcript) ? row.transcript : [],
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function handler(event) {
  try {
    // Saved sessions stay readable and deletable, but a switched-off GemaBot
    // takes no new ones.
    if (event.httpMethod === 'POST') {
      await assertSiteModuleEnabled(getSqlClient(), 'gemabot');
    }
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });

    if (event.httpMethod === 'GET') {
      const url = new URL(event.rawUrl || `http://localhost${event.path || '/.netlify/functions/member-chat-sessions'}`);
      const limit = parseBoundedIntegerParam(url.searchParams.get('limit'), {
        fallback: DEFAULT_SESSION_PAGE_SIZE,
        min: 1,
        max: MAX_SESSIONS,
      });
      const rows = await sql`
        SELECT *
        FROM member_chat_sessions
        WHERE user_id = ${member.id}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return jsonResponse(200, { sessions: rows.map(formatSession) });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const transcript = normalizeTranscript(body.transcript);
      if (!transcript.length) {
        return jsonResponse(400, { error: 'A non-empty transcript is required' });
      }

      const topic = normalizeText(body.topic, MAX_TOPIC_LENGTH);
      const title = normalizeText(body.title, MAX_TITLE_LENGTH) || topic || `AI chat session (${new Date().toISOString().slice(0, 10)})`;
      const metadata = normalizeMetadata(body.metadata);

      const rows = await sql`
        INSERT INTO member_chat_sessions (id, user_id, title, topic, transcript, metadata)
        VALUES (
          ${crypto.randomUUID()},
          ${member.id},
          ${title},
          ${topic || null},
          ${JSON.stringify(transcript)}::jsonb,
          ${JSON.stringify(metadata)}::jsonb
        )
        RETURNING *
      `;

      return jsonResponse(201, { session: formatSession(rows[0]) });
    }

    if (event.httpMethod === 'DELETE') {
      const body = parseBody(event);
      const id = normalizeText(body.id, 80);
      if (!id) {
        return jsonResponse(400, { error: 'id is required' });
      }

      const rows = await sql`
        DELETE FROM member_chat_sessions
        WHERE id = ${id}
          AND user_id = ${member.id}
        RETURNING *
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'Chat session not found' });
      }

      return jsonResponse(200, { deleted: true, session: formatSession(rows[0]) });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    // A database error's text is Postgres's; only expected 4xx messages are
    // written for the member.
    if (error.statusCode && error.statusCode < 500) {
      return jsonResponse(error.statusCode, { error: error.message || 'Chat session request failed' }, error.headers || {});
    }
    console.error('[member-chat-sessions] request failed:', error);
    return jsonResponse(error.statusCode || 500, { error: 'Chat session request failed' });
  }
}
