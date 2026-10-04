import crypto from 'node:crypto';
import {
  formatCalculationHistory,
  getAuthenticatedMember,
  jsonResponse,
  parseBody,
  parseBoundedIntegerParam,
} from './_member.mjs';
import { applyRateLimit } from './_security.mjs';

const DEFAULT_HISTORY_PAGE_SIZE = 25;
const MAX_HISTORY_ITEMS = 100;
export const FREE_MEMBERSHIP_SAVE_LIMIT = 7;

// Nothing bounded a save, so one request near Netlify's 6 MB body limit wrote
// 6 MB to the shared database, and premium saves have no row cap. Every page
// that saves sends one of these types and sources, and the largest real result
// -- a 500-word reverse lookup -- serializes to roughly 50 KB.
export const HISTORY_QUERY_TYPES = new Set(['word', 'gematria', 'names']);
export const HISTORY_CALCULATOR_SOURCES = new Set(['calculator', 'name-calculator', 'ai_agent', 'multi-cipher-calculator']);
export const MAX_QUERY_TEXT_LENGTH = 500;
export const MAX_RESULT_PAYLOAD_BYTES = 128 * 1024;
export const MAX_NOTE_LENGTH = 10_000;
// Far past what anyone saves by hand in a day; it bounds what a script can
// write through a premium account.
const SAVE_RATE_LIMIT = { limit: 500, windowMs: 24 * 60 * 60_000, blockMs: 60 * 60_000 };

function requestError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export function normalizeHistoryNote(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const note = String(value).trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw requestError(400, `Notes can be at most ${MAX_NOTE_LENGTH.toLocaleString('en-US')} characters.`);
  }
  return note || null;
}

export function parseHistorySaveBody(body = {}) {
  const queryText = String(body.queryText ?? '').trim();
  const queryType = String(body.queryType ?? 'word').trim() || 'word';
  const calculatorSource = String(body.calculatorSource ?? 'calculator').trim() || 'calculator';
  const resultPayload = body.resultPayload && typeof body.resultPayload === 'object' ? body.resultPayload : null;

  if (!queryText || !resultPayload) {
    throw requestError(400, 'queryText and resultPayload are required');
  }
  if (queryText.length > MAX_QUERY_TEXT_LENGTH) {
    throw requestError(400, `Saved searches can be at most ${MAX_QUERY_TEXT_LENGTH} characters.`);
  }
  if (!HISTORY_QUERY_TYPES.has(queryType)) {
    throw requestError(400, 'Unsupported queryType');
  }
  if (!HISTORY_CALCULATOR_SOURCES.has(calculatorSource)) {
    throw requestError(400, 'Unsupported calculatorSource');
  }

  const serializedPayload = JSON.stringify(resultPayload);
  if (Buffer.byteLength(serializedPayload, 'utf8') > MAX_RESULT_PAYLOAD_BYTES) {
    throw requestError(413, 'This result is too large to save.');
  }

  return {
    queryText,
    queryType,
    calculatorSource,
    gematriaTotal: body.gematriaTotal ?? null,
    digitalRoot: body.digitalRoot ?? null,
    isBaseRoot: typeof body.isBaseRoot === 'boolean' ? body.isBaseRoot : null,
    serializedPayload,
    note: normalizeHistoryNote(body.note),
  };
}

// The dashboard only ever asked for the newest 25, so a premium member's older
// saves -- the "unlimited" ones they paid for -- had no way back into view.
export async function listCalculationHistory(sql, memberId, { limit, offset }) {
  const [rows, countRows] = await Promise.all([
    sql`
      SELECT *
      FROM calculation_history
      WHERE user_id = ${memberId}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM calculation_history
      WHERE user_id = ${memberId}
    `,
  ]);

  return {
    history: rows.slice(0, limit).map(formatCalculationHistory),
    total: Number(countRows[0]?.count ?? 0),
    hasMore: rows.length > limit,
  };
}

function freeSaveLimitResponse() {
  return jsonResponse(403, {
    error: `Free memberships can save up to ${FREE_MEMBERSHIP_SAVE_LIMIT} calculations. Delete an older saved search to add a new one.`,
    code: 'FREE_SAVE_LIMIT_REACHED',
    limit: FREE_MEMBERSHIP_SAVE_LIMIT,
  });
}

// The free cap used to be a COUNT run before, and apart from, the INSERT.
// Saving something already saved was refused at the cap before the duplicate
// check could match it, and saves sent together all read the same count and
// all got in. The count now gates the INSERT itself, and free saves take a
// per-member lock so a second save waits for the first to commit.
export async function saveCalculationHistory(sql, member, entry) {
  const saveCap = member.membershipLevel === 'free' ? FREE_MEMBERSHIP_SAVE_LIMIT : null;
  const insert = sql`
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
    SELECT
      ${crypto.randomUUID()}::text,
      ${member.id}::text,
      ${entry.queryText}::text,
      ${entry.queryType}::text,
      ${entry.calculatorSource}::text,
      ${entry.gematriaTotal}::integer,
      ${entry.digitalRoot}::integer,
      ${entry.isBaseRoot}::boolean,
      ${entry.serializedPayload}::jsonb,
      ${entry.note}::text
    WHERE ${saveCap}::integer IS NULL
      OR (SELECT COUNT(*) FROM calculation_history WHERE user_id = ${member.id}) < ${saveCap}::integer
    ON CONFLICT (user_id, LOWER(query_text), query_type, calculator_source) DO NOTHING
    RETURNING *
  `;
  // READ COMMITTED gives the INSERT a fresh snapshot after the lock is granted,
  // so it counts the row the previous lock holder committed.
  const rows = saveCap === null
    ? await insert
    : (await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext(${`calculation_history:${member.id}`}::text))`,
      insert,
    ], { isolationLevel: 'ReadCommitted' }))[1];

  if (rows.length) {
    return jsonResponse(201, { item: formatCalculationHistory(rows[0]) });
  }

  const normalizedQueryText = entry.queryText.toLowerCase();
  let existing;
  if (entry.note !== null) {
    [existing] = await sql`
      UPDATE calculation_history
      SET note = ${entry.note}, updated_at = NOW()
      WHERE user_id = ${member.id}
        AND LOWER(query_text) = ${normalizedQueryText}
        AND query_type = ${entry.queryType}
        AND calculator_source = ${entry.calculatorSource}
      RETURNING *
    `;
  } else {
    [existing] = await sql`
      SELECT *
      FROM calculation_history
      WHERE user_id = ${member.id}
        AND LOWER(query_text) = ${normalizedQueryText}
        AND query_type = ${entry.queryType}
        AND calculator_source = ${entry.calculatorSource}
      ORDER BY created_at DESC
      LIMIT 1
    `;
  }

  if (existing) {
    return jsonResponse(200, { duplicate: true, item: formatCalculationHistory(existing) });
  }
  if (saveCap !== null) {
    return freeSaveLimitResponse();
  }
  // Only reachable when the matching row was deleted between the two queries.
  return jsonResponse(409, { error: 'Unable to save this calculation right now. Please try again.' });
}

export async function handler(event) {
  try {
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });

    if (event.httpMethod === 'GET') {
      const url = new URL(event.rawUrl || `http://localhost${event.path || '/.netlify/functions/member-history'}`);
      const limit = parseBoundedIntegerParam(url.searchParams.get('limit'), {
        fallback: DEFAULT_HISTORY_PAGE_SIZE,
        min: 1,
        max: MAX_HISTORY_ITEMS,
      });
      const offset = parseBoundedIntegerParam(url.searchParams.get('offset'), {
        fallback: 0,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
      });
      return jsonResponse(200, await listCalculationHistory(sql, member.id, { limit, offset }));
    }

    if (event.httpMethod === 'POST') {
      const entry = parseHistorySaveBody(parseBody(event));
      await applyRateLimit(sql, event, {
        scope: 'member-history-save',
        key: member.id,
        ...SAVE_RATE_LIMIT,
        message: 'You have saved a lot of calculations today. Please try again later.',
      });
      return await saveCalculationHistory(sql, member, entry);
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

      const noteValue = normalizeHistoryNote(body.note);

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
    // Expected failures carry a 4xx and a message written for the member. A
    // database error has neither, and its text is Postgres's, not ours.
    if (error.statusCode && error.statusCode < 500) {
      return jsonResponse(error.statusCode, { error: error.message || 'History request failed' }, error.headers || {});
    }
    console.error('[member-history] request failed:', error);
    return jsonResponse(error.statusCode || 500, { error: 'History request failed' });
  }
}
