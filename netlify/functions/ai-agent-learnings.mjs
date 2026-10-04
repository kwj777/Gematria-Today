import { ensureAdminSchema, jsonResponse } from './_admin.mjs';
import { getAuthenticatedMember, parseBody } from './_member.mjs';
import { applyRateLimit, logRequestAudit } from './_security.mjs';
import { assertSiteModuleEnabled } from './_site-modules.mjs';

const SETTINGS_KEY = 'ai_agent_global_learnings_v1';
const MAX_ENTRIES = 200;
const MAX_PROMPT_LENGTH = 240;
const MAX_EXPLANATION_LENGTH = 600;

export function normalizeText(value, maxLength) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizeEntry(entry = {}) {
  const prompt = normalizeText(entry.prompt, MAX_PROMPT_LENGTH).toLowerCase();
  const explanation = normalizeText(entry.explanation, MAX_EXPLANATION_LENGTH);
  return { prompt, explanation };
}

export function normalizeEntries(entries = []) {
  const deduped = new Map();
  entries.forEach((entry) => {
    const normalized = normalizeEntry(entry);
    if (!normalized.prompt || !normalized.explanation || deduped.has(normalized.prompt)) {
      return;
    }
    deduped.set(normalized.prompt, normalized);
  });
  return [...deduped.values()].slice(0, MAX_ENTRIES);
}

async function readGlobalLearnings(sql) {
  const rows = await sql`
    SELECT setting_value
    FROM admin_settings
    WHERE setting_key = ${SETTINGS_KEY}
    LIMIT 1
  `;

  const raw = rows[0]?.setting_value;
  if (!raw) {
    return [];
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeEntries(Array.isArray(parsed?.entries) ? parsed.entries : []);
  } catch {
    return [];
  }
}

async function writeGlobalLearnings(sql, userId, entries) {
  await sql`
    INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES (${SETTINGS_KEY}, ${JSON.stringify({ entries })}, ${userId || 'system'}, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `;
}

export async function handler(event) {
  try {
    const auth = await getAuthenticatedMember(event, { requireAuth: false });
    const sql = auth.sql;
    await ensureAdminSchema(sql);
    await assertSiteModuleEnabled(sql, 'gemabot');

    if (event.httpMethod === 'GET') {
      const entries = await readGlobalLearnings(sql);
      return jsonResponse(200, { entries });
    }

    if (event.httpMethod === 'POST') {
      if (!auth.member) {
        return jsonResponse(401, { error: 'Authentication required' });
      }

      const membershipLevel = String(auth.member.membershipLevel || '').toLowerCase();
      if (membershipLevel !== 'premium' && membershipLevel !== 'lifetime') {
        return jsonResponse(403, { error: 'Premium membership required' });
      }

      const authorId = auth.user?.id || auth.member?.id;

      // This row is a single site-wide record served unauthenticated to every
      // visitor, and new entries push old ones off the end of a 200-entry list.
      // Without a quota one premium account could overwrite the whole shared
      // knowledge base in a single loop. Contributions are throttled per member
      // and logged so an abusive run is both slow and attributable.
      await applyRateLimit(sql, event, {
        scope: 'ai-agent-learnings-member',
        key: String(authorId || 'unknown'),
        limit: 10,
        windowMs: 60 * 60_000,
        blockMs: 60 * 60_000,
        message: 'You have added a lot of GemaBot learnings recently. Try again later.',
      });

      const body = parseBody(event);
      const nextEntry = normalizeEntry(body);
      if (!nextEntry.prompt || !nextEntry.explanation) {
        return jsonResponse(400, { error: 'prompt and explanation are required' });
      }

      const existing = await readGlobalLearnings(sql);
      const entries = normalizeEntries([nextEntry, ...existing]);
      await writeGlobalLearnings(sql, authorId, entries);
      await logRequestAudit(sql, event, {
        route: 'ai-agent-learnings',
        action: 'save_learning',
        outcome: 'success',
        metadata: { memberId: authorId, prompt: nextEntry.prompt },
      });
      return jsonResponse(200, { saved: true, entries });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(
      error.statusCode || 500,
      { error: error.message || 'Unable to process AI GemaBot learnings' },
      error.headers || {},
    );
  }
}
