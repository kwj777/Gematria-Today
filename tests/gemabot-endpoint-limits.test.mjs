import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { handler as chatSessionsHandler } from '../netlify/functions/member-chat-sessions.mjs';
import { handler as siteChatbotHandler } from '../netlify/functions/public-site-chatbot.mjs';
import { handler as publicFeedbackHandler } from '../netlify/functions/public-chatbot-feedback.mjs';
import { handler as memberFeedbackHandler } from '../netlify/functions/member-chatbot-feedback.mjs';
import { handler as blogProposalsHandler } from '../netlify/functions/member-blog-proposals.mjs';
import { AUTH_COOKIES } from '../netlify/functions/_auth.mjs';
import { resetSiteModulesCache } from '../netlify/functions/_site-modules.mjs';

// Runs the real handlers end to end. getSqlClient() builds a real neon()
// client, and the neon HTTP driver posts each query through the global fetch,
// so stubbing fetch stands in for the database (see member-register-response).
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
const PRIOR_FETCH = globalThis.fetch;
process.env.DATABASE_URL = 'postgres://user:pass@neon.invalid/neondb';

test.after(() => {
  globalThis.fetch = PRIOR_FETCH;
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

const MEMBER_ID = 'member-1';
const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2999-01-01T00:00:00.000Z';

function toNeonResult(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const typeOf = (value) => {
    if (typeof value === 'boolean') return 16;
    if (typeof value === 'number') return 23;
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

function installBackend({
  membershipLevel = 'premium',
  siteModules = null,
  rateLimited = false,
  chatSessionCapReached = false,
} = {}) {
  const queries = [];
  const route = (query, params) => {
    queries.push({ query, params });
    if (/FROM sessions\s+JOIN users/i.test(query)) {
      return [{ id: MEMBER_ID, username: 'alice', role: 'member', is_admin: false, expires_at: LATER }];
    }
    if (/SELECT id, username, email, display_name, membership_level/i.test(query)) {
      return [{
        id: MEMBER_ID,
        username: 'alice',
        email: 'alice@example.com',
        display_name: 'Alice',
        membership_level: membershipLevel,
        membership_started_at: null,
        membership_expires_at: null,
        stripe_customer_id: null,
        stripe_last_checkout_session_id: null,
        stripe_subscription_status: null,
        status: 'active',
        email_verified: true,
        created_at: NOW,
        updated_at: NOW,
      }];
    }
    if (/FROM member_profiles/i.test(query)) {
      return [{ user_id: MEMBER_ID, preferences: {}, created_at: NOW, updated_at: NOW }];
    }
    if (/INSERT INTO request_rate_limits/i.test(query)) {
      return [{ count: 1, window_started_at: NOW, blocked_until: rateLimited ? LATER : null }];
    }
    if (/FROM admin_settings/i.test(query) && siteModules) {
      return [{ setting_key: 'site_modules', setting_value: JSON.stringify(siteModules) }];
    }
    if (/INSERT INTO member_chat_sessions/i.test(query)) {
      if (chatSessionCapReached) return [];
      return [{
        id: params[0],
        user_id: params[1],
        title: params[2],
        topic: params[3],
        transcript: JSON.parse(params[4]),
        metadata: JSON.parse(params[5]),
        created_at: NOW,
        updated_at: NOW,
      }];
    }
    if (/FROM member_chat_sessions/i.test(query)) {
      return [];
    }
    if (/INSERT INTO blog_post_proposals/i.test(query)) {
      return [{ id: params[0], title: params[2], status: 'pending', created_at: NOW }];
    }
    if (/INSERT INTO chatbot_search_feedback/i.test(query)) {
      return [{ id: params[0], user_id: params[1], query: params[2], status: 'new', created_at: NOW, updated_at: NOW }];
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
    rateLimitScopes: () => queries
      .filter(({ query }) => /INSERT INTO request_rate_limits/i.test(query))
      .map(({ params }) => ({ scope: params[0], key: params[1] })),
    inserts: (table) => queries.filter(({ query }) => new RegExp(`INSERT INTO ${table}\\b`, 'i').test(query)),
  };
}

function memberEvent(httpMethod, body, path = '/api/test') {
  return {
    httpMethod,
    path,
    rawUrl: `https://gematria.today${path}`,
    headers: {
      cookie: `${AUTH_COOKIES.member}=member-session-token`,
      'x-forwarded-for': '203.0.113.7',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

const parse = (response) => JSON.parse(response.body || '{}');

const transcript = [
  { role: 'user', text: 'calculate love' },
  { role: 'assistant', text: 'love = 324' },
];

// ---------- member-chat-sessions (M40) ----------

test('a free member cannot save GemaBot chat sessions', async () => {
  const backend = installBackend({ membershipLevel: 'free' });
  const response = await chatSessionsHandler(memberEvent('POST', { transcript }));
  assert.equal(response.statusCode, 403);
  assert.equal(backend.inserts('member_chat_sessions').length, 0);
});

test('a free member can still list the chat sessions they saved earlier', async () => {
  installBackend({ membershipLevel: 'free' });
  const response = await chatSessionsHandler(memberEvent('GET'));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parse(response).sessions, []);
});

test('chat sessions cannot be saved while the GemaBot module is switched off', async () => {
  // The module switch is cached per instance; earlier tests saw it on.
  resetSiteModulesCache();
  const backend = installBackend({ siteModules: { gemabot: false } });
  const response = await chatSessionsHandler(memberEvent('POST', { transcript }));
  resetSiteModulesCache();
  assert.equal(response.statusCode, 404);
  assert.match(parse(response).error, /currently unavailable/i);
  assert.equal(backend.inserts('member_chat_sessions').length, 0);
});

test('chat session saves are rate limited per member', async () => {
  const backend = installBackend({ rateLimited: true });
  const response = await chatSessionsHandler(memberEvent('POST', { transcript }));
  assert.equal(response.statusCode, 429);
  assert.ok(response.headers['retry-after']);
  assert.deepEqual(backend.rateLimitScopes(), [{ scope: 'member-chat-sessions-save', key: MEMBER_ID }]);
  assert.equal(backend.inserts('member_chat_sessions').length, 0);
});

test('a premium member saves a session, and the insert is bounded by a per-member count', async () => {
  const backend = installBackend();
  const response = await chatSessionsHandler(memberEvent('POST', { transcript, title: 'Love' }));
  assert.equal(response.statusCode, 201);
  assert.equal(parse(response).session.title, 'Love');
  const [insert] = backend.inserts('member_chat_sessions');
  assert.match(insert.query, /SELECT COUNT\(\*\)\s+FROM member_chat_sessions\s+WHERE user_id = \$\d+\s*\)\s*<\s*\$\d+/);
  assert.ok(insert.params.map(String).includes('100'));
});

test('a member at the saved-session cap gets a clear 409 instead of another row', async () => {
  installBackend({ chatSessionCapReached: true });
  const response = await chatSessionsHandler(memberEvent('POST', { transcript }));
  assert.equal(response.statusCode, 409);
  assert.match(parse(response).error, /Delete some/);
});

test('a saved transcript is capped in total size, not only per message', async () => {
  const backend = installBackend();
  const huge = Array.from({ length: 80 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    text: 'x'.repeat(2000),
  }));
  const response = await chatSessionsHandler(memberEvent('POST', { transcript: huge }));
  assert.equal(response.statusCode, 201);
  const stored = JSON.parse(backend.inserts('member_chat_sessions')[0].params[4]);
  const totalLength = stored.reduce((sum, message) => sum + message.text.length, 0);
  assert.ok(totalLength <= 100_000, `stored ${totalLength} characters`);
  assert.equal(stored.length, 50);
});

// ---------- signed-in callers are throttled too (L7) ----------

test('SiteSeeker search rate limits signed-in callers per account', async () => {
  const backend = installBackend();
  const response = await siteChatbotHandler(memberEvent('POST', { query: 'base root numbers' }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(backend.rateLimitScopes(), [{ scope: 'public-site-chatbot-user', key: MEMBER_ID }]);
});

test('SiteSeeker search blocks a signed-in caller who is over the limit', async () => {
  installBackend({ rateLimited: true });
  const response = await siteChatbotHandler(memberEvent('POST', { query: 'base root numbers' }));
  assert.equal(response.statusCode, 429);
});

test('SiteSeeker search still rate limits anonymous callers per IP', async () => {
  const backend = installBackend();
  const event = memberEvent('POST', { query: 'base root numbers' });
  delete event.headers.cookie;
  const response = await siteChatbotHandler(event);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(backend.rateLimitScopes(), [{ scope: 'public-site-chatbot-ip', key: '203.0.113.7' }]);
});

test('public chatbot feedback rate limits signed-in callers per account', async () => {
  const backend = installBackend({ rateLimited: true });
  const response = await publicFeedbackHandler(memberEvent('POST', { query: 'love', wasExpected: true }));
  assert.equal(response.statusCode, 429);
  assert.deepEqual(backend.rateLimitScopes(), [{ scope: 'public-chatbot-feedback-user', key: MEMBER_ID }]);
  assert.equal(backend.inserts('chatbot_search_feedback').length, 0);
});

test('member chatbot feedback submissions are rate limited per member', async () => {
  const blocked = installBackend({ rateLimited: true });
  const blockedResponse = await memberFeedbackHandler(memberEvent('POST', { query: 'love', wasExpected: true }));
  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blocked.inserts('chatbot_search_feedback').length, 0);

  const allowed = installBackend();
  const response = await memberFeedbackHandler(memberEvent('POST', { query: 'love', wasExpected: true }));
  assert.equal(response.statusCode, 201);
  assert.deepEqual(allowed.rateLimitScopes(), [{ scope: 'member-chatbot-feedback-member', key: MEMBER_ID }]);
});

// ---------- blog proposals (L7) ----------

const proposal = {
  title: 'Gematria of the seven seals',
  summary: 'A walk through the totals behind each seal and why the base roots line up.',
  body: 'Draft body '.repeat(20),
  suggestedTags: 'gematria, revelation',
  proposedImageUrl: 'https://example.com/cover.jpg',
};

test('blog proposal fields are length-capped on the server', async () => {
  for (const [field, length] of [['title', 141], ['summary', 501], ['body', 100_001], ['suggestedTags', 501], ['proposedImageUrl', 2049]]) {
    const backend = installBackend();
    const response = await blogProposalsHandler(memberEvent('POST', { ...proposal, [field]: 'a'.repeat(length) }));
    assert.equal(response.statusCode, 400, `${field} of ${length} characters was accepted`);
    assert.match(parse(response).error, /characters or fewer/);
    assert.equal(backend.inserts('blog_post_proposals').length, 0);
  }
});

test('blog proposal submissions are rate limited per member', async () => {
  const blocked = installBackend({ rateLimited: true });
  const blockedResponse = await blogProposalsHandler(memberEvent('POST', proposal));
  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blocked.inserts('blog_post_proposals').length, 0);

  const allowed = installBackend();
  const response = await blogProposalsHandler(memberEvent('POST', proposal));
  assert.equal(response.statusCode, 201);
  assert.deepEqual(allowed.rateLimitScopes(), [{ scope: 'member-blog-proposals-member', key: MEMBER_ID }]);
});

// ---------- GemaBot page script (M42, L20) ----------

const AGENT_SCRIPT = readFileSync(new URL('../page-scripts/ai-agent-1.mjs', import.meta.url), 'utf8');

test('GemaBot shows a matched learned response instead of hiding it', () => {
  assert.doesNotMatch(AGENT_SCRIPT, /class="d-none" data-applied-learning/);
});

test('GemaBot renders the learned note once, for every kind of reply', () => {
  // Only the general-chat and calculation builders used to render it, so a
  // note saved on a reverse lookup, word count, follow-up or related-words
  // reply (all of which offer "Save learning") never appeared.
  assert.equal(AGENT_SCRIPT.match(/buildLearnedNoteHtml\(/g)?.length, 1, 'the note should be built in one place');
  assert.equal(AGENT_SCRIPT.match(/findLearnedResponse\(/g)?.length, 2, 'findLearnedResponse should be defined once and called once');
  assert.doesNotMatch(AGENT_SCRIPT, /learnedResponse\b/);

  const render = AGENT_SCRIPT.match(/async function renderAgentReply\([\s\S]*?\n {6}\}\n/);
  assert.ok(render, 'renderAgentReply is missing');
  // Looked up before the reply is built (building it moves the pronoun context
  // on) and put in front of both plain and streaming replies.
  assert.match(render[0], /learningPrompt = resolveLearningPrompt\(prompt\),/);
  assert.match(render[0], /const learnedNoteHtml = buildLearnedNoteHtml\(findLearnedResponse\(learningPrompt\)\);\s+const reply = await buildReply\(prompt\);/);
  assert.match(render[0], /const initialHtml = `\$\{learnedNoteHtml\}\$\{isStreaming \? reply\.initialHtml : reply\}`;/);
  // "Save learning" saves under the key the note is looked up by.
  assert.match(render[0], /attachResultFeedbackUi\(assistantMessage, prompt, finalAnswerHtml, learningPrompt\);/);
  assert.match(AGENT_SCRIPT, /await saveLearnedResponse\(learningPrompt, explanation\);/);
  // A follow-up or "yes" is keyed with the subject it follows (helpers test
  // buildLearningPrompt); without one there is no key and nothing is saved.
  assert.match(AGENT_SCRIPT, /return buildLearningPrompt\(prompt, \{\s+resolvedPrompt: resolveAgentPrompt\(prompt\),\s+context: lastCalculationContext,\s+pendingTopic: pendingRelatedWordsSuggestionTopic,\s+\}\);/);
  // A key findLearnedEntry can never match ("אהבה", "???") is not empty, so
  // "Save learning" checks the same rule the lookup (and the admin train
  // action) uses before promising a community note.
  assert.match(AGENT_SCRIPT, /const notesShared = isLearnablePrompt\(learningPrompt\);/);
  assert.doesNotMatch(AGENT_SCRIPT, /notesShared = Boolean\(/);
  assert.match(AGENT_SCRIPT, /if \(!notesShared\) \{[\s\S]*?\} else \{\s+const savedGlobally = await saveLearnedResponse\(learningPrompt, explanation\);/);
  assert.equal(AGENT_SCRIPT.match(/attachResultFeedbackUi\(/g)?.length, 2, 'every reply with feedback should go through renderAgentReply');

  // The reply builders read the prompt the same way the note lookup does.
  assert.match(AGENT_SCRIPT, /const normalizedPrompt = resolveAgentPrompt\(rawNormalized\);/);
});

test('every GemaBot reply goes through the one in-flight guard', () => {
  // The word, reverse-lookup and JSON preview links used to build their reply
  // directly, so their replies could interleave with a typed question's.
  assert.equal(AGENT_SCRIPT.match(/renderAgentReply\(/g)?.length, 2, 'renderAgentReply should be defined once and called only from runAgentRequest');
  const runner = AGENT_SCRIPT.match(/async function runAgentRequest\([^)]*\) \{[\s\S]*?\n {6}\}/);
  assert.ok(runner, 'runAgentRequest is missing');
  assert.match(runner[0], /if \(isAgentRequestInFlight\) return false;\s+isAgentRequestInFlight = true;/);
  assert.match(runner[0], /await renderAgentReply\(prompt, replyOptions\);/);
  assert.match(runner[0], /finally \{[\s\S]*isAgentRequestInFlight = false;/);
  assert.match(AGENT_SCRIPT, /await runAgentRequest\(`reverse gematria \$\{gematriaValue\}`\);/);
  assert.match(AGENT_SCRIPT, /await runAgentRequest\(`"\$\{selectedWord\}"`, selectedWord\);/);
  assert.match(AGENT_SCRIPT, /await runAgentRequest\(href, jsonPreviewLink\.textContent \|\| 'Preview JSON link', \{/);
});
