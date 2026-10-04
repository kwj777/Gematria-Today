import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { handler } from '../netlify/functions/admin-chatbot-feedback.mjs';
import { AUTH_COOKIES } from '../netlify/functions/_auth.mjs';
import { findLearnedEntry } from '../page-scripts/ai-agent-helpers.mjs';

// Runs the real handler end to end. The neon HTTP driver posts each query
// through the global fetch, so stubbing fetch stands in for the database (see
// gemabot-endpoint-limits).
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
const PRIOR_FETCH = globalThis.fetch;
process.env.DATABASE_URL = 'postgres://user:pass@neon.invalid/neondb';

test.after(() => {
  globalThis.fetch = PRIOR_FETCH;
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2999-01-01T00:00:00.000Z';
const FEEDBACK_ID = 'feedback-1';

function toNeonResult(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const typeOf = (value) => {
    if (typeof value === 'boolean') return 16;
    if (value && typeof value === 'object') return 3802;
    return 25;
  };
  const encode = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? 't' : 'f';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  return {
    fields: columns.map((name) => ({ name, dataTypeID: typeOf(rows[0][name]) })),
    rows: rows.map((row) => columns.map((name) => encode(row[name]))),
  };
}

function installBackend({ query, cleanedQuery = null, feedbackText = 'Start with the total, then the digital root.' }) {
  const queries = [];
  const route = (text, params) => {
    queries.push({ query: text, params });
    if (/FROM sessions\s+JOIN users/i.test(text)) {
      return [{ id: 'admin-1', username: 'editor', role: 'admin', is_admin: true, expires_at: LATER }];
    }
    if (/SELECT \* FROM chatbot_search_feedback WHERE id =/i.test(text)) {
      return [{
        id: FEEDBACK_ID,
        user_id: null,
        query,
        cleaned_query: cleanedQuery,
        answer_text: 'love = 324',
        was_expected: false,
        feedback_text: feedbackText,
        status: 'new',
        created_at: NOW,
        updated_at: NOW,
      }];
    }
    return [];
  };

  globalThis.fetch = async (_url, init = {}) => {
    const body = JSON.parse(init.body);
    if (Array.isArray(body.queries)) {
      return Response.json({ results: body.queries.map((q) => toNeonResult(route(q.query, q.params))) });
    }
    return Response.json(toNeonResult(route(body.query, body.params)));
  };

  return {
    learningsWrites: () => queries.filter(({ query: text, params }) => /INSERT INTO admin_settings/i.test(text)
      && params.includes('ai_agent_global_learnings_v1')),
    // Only updates of this item: schema setup runs its own backfill UPDATE once.
    feedbackUpdates: () => queries.filter(({ query: text, params }) => /UPDATE chatbot_search_feedback/i.test(text)
      && params.includes(FEEDBACK_ID)),
  };
}

function trainEvent() {
  return {
    httpMethod: 'PATCH',
    path: '/api/admin-chatbot-feedback',
    rawUrl: 'https://gematria.today/api/admin-chatbot-feedback',
    headers: { cookie: `${AUTH_COOKIES.admin}=admin-session-token` },
    body: JSON.stringify({ id: FEEDBACK_ID, action: 'train' }),
  };
}

const parse = (response) => JSON.parse(response.body || '{}');

// GemaBot never shows a note saved under "why" or a bare "yes"
// (findLearnedEntry), so "Train from this" used to store an entry that changed
// nothing and still report "Trained" and close the feedback.
test('Train from this refuses a context-dependent prompt and leaves the feedback open', async () => {
  for (const [query, cleanedQuery] of [['why', null], ['What does that mean?', null], ['Yes please!', null], ['ok', '']]) {
    const backend = installBackend({ query, cleanedQuery });
    const response = await handler(trainEvent());
    assert.equal(response.statusCode, 400, `"${query}" was trained`);
    assert.match(parse(response).error, /only makes sense after an earlier GemaBot answer/);
    assert.equal(parse(response).trained, undefined);
    assert.equal(backend.learningsWrites().length, 0, `"${query}" was stored as a learned response`);
    assert.equal(backend.feedbackUpdates().length, 0, `"${query}" feedback was closed`);
  }
});

test('Train from this refuses a prompt with nothing GemaBot can match a note to', async () => {
  const backend = installBackend({ query: 'אהבה' });
  const response = await handler(trainEvent());
  assert.equal(response.statusCode, 400);
  assert.match(parse(response).error, /no English letters or digits/);
  assert.equal(backend.learningsWrites().length, 0);
  assert.equal(backend.feedbackUpdates().length, 0);
});

test('Train from this stores a question that only starts with "ok" and closes the feedback', async () => {
  const backend = installBackend({ query: 'OK what is the gematria of love', cleanedQuery: 'ok what is the gematria of love' });
  const response = await handler(trainEvent());
  assert.equal(response.statusCode, 200);
  assert.equal(parse(response).trained, true);

  const [write] = backend.learningsWrites();
  assert.ok(write, 'the learned response was not stored');
  const stored = JSON.parse(write.params[1]);
  assert.deepEqual(stored.entries[0], {
    prompt: 'ok what is the gematria of love',
    explanation: 'Start with the total, then the digital root.',
  });
  // ...and GemaBot shows it on that question.
  assert.equal(findLearnedEntry('ok what is the gematria of love', stored.entries), stored.entries[0]);

  const [update] = backend.feedbackUpdates();
  assert.match(update.query, /SET status = 'closed'/);
});

test('the admin page shows a refused training next to the item and keeps it listed', () => {
  const script = readFileSync(new URL('../page-scripts/admin-chatbot-feedback-1.js', import.meta.url), 'utf8');
  assert.match(script, /error\.status = response\.status;/);
  assert.match(script, /if \(trainBtn && error\.status === 400\) \{[\s\S]*?reason\.textContent = error\.message;\s+trainBtn\.replaceWith\(reason\);/);
  assert.match(script, /setStatusMessage\(error\.message \|\| 'Unable to update feedback right now\.', 'danger'\);/);
  // Only a successful train removes the item from the list.
  const train = script.match(/if \(trainFromFeedback\) \{[\s\S]*?\} else if \(submitFeedbackReply\)/);
  assert.ok(train);
  assert.match(train[0], /const result = await request\([\s\S]*?\);\s+setStatusMessage\(`Trained\.[\s\S]*?removeFeedbackFromCurrentScreen\(trainFromFeedback\);/);
});

test('netlify.toml ships the GemaBot helpers the train action imports', () => {
  const source = readFileSync(new URL('../netlify/functions/admin-chatbot-feedback.mjs', import.meta.url), 'utf8');
  assert.match(source, /from '\.\.\/\.\.\/page-scripts\/ai-agent-helpers\.mjs';/);
  const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(toml, /\[functions\."admin-chatbot-feedback"\]\s+included_files = \["page-scripts\/ai-agent-helpers\.mjs"\]/);
});
