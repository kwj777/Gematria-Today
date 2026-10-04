import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SITE_MODULES,
  assertSiteModuleEnabled,
  loadSiteModules,
  resetSiteModulesCache,
} from '../netlify/functions/_site-modules.mjs';
import { handler as memberForumHandler } from '../netlify/functions/member-forum.mjs';
import { handler as publicPostsHandler } from '../netlify/functions/public-posts.mjs';
import { handler as blogRssHandler } from '../netlify/functions/blog-rss.mjs';
import { handler as blogPostShareHandler } from '../netlify/functions/blog-post-share.mjs';
import { handler as publicSiteChatbotHandler } from '../netlify/functions/public-site-chatbot.mjs';
import { handler as aiAgentLearningsHandler } from '../netlify/functions/ai-agent-learnings.mjs';
import { handler as memberChatSessionsHandler } from '../netlify/functions/member-chat-sessions.mjs';
import { handler as memberRegisterHandler } from '../netlify/functions/member-register.mjs';
import { handler as memberPaymentCheckoutHandler } from '../netlify/functions/member-payment-checkout.mjs';

// The module switches used to be cosmetic: every API behind a switched-off
// module kept working. These tests run the real handlers against a stand-in
// for Neon's HTTP endpoint whose admin_settings row says which modules are off.

function settingsSql(settingValue, { fails = false } = {}) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    if (fails) return Promise.reject(new Error('connection reset'));
    return Promise.resolve(settingValue === undefined ? [] : [{ setting_value: settingValue }]);
  };
  return { sql, calls };
}

test('every module is on when no switch was ever saved', async () => {
  resetSiteModulesCache();
  const { sql } = settingsSql(undefined);
  assert.deepEqual(await loadSiteModules(sql), { ...DEFAULT_SITE_MODULES });
  for (const moduleName of ['forum', 'knowbot', 'gemabot', 'blog', 'membership']) {
    assert.equal(DEFAULT_SITE_MODULES[moduleName], true, `${moduleName} must default on`);
  }
});

test('a switch saved off is off, and keys it does not mention stay on', async () => {
  resetSiteModulesCache();
  const { sql } = settingsSql(JSON.stringify({ forum: false }));
  const modules = await loadSiteModules(sql);
  assert.equal(modules.forum, false);
  assert.equal(modules.blog, true);
  assert.equal(modules.membership, true);
});

test('assertSiteModuleEnabled answers 404 for a switched-off module', async () => {
  resetSiteModulesCache();
  const { sql } = settingsSql(JSON.stringify({ forum: false }));
  await assert.rejects(assertSiteModuleEnabled(sql, 'forum'), (error) => (
    error.statusCode === 404 && error.code === 'module_disabled' && /forum/i.test(error.message)
  ));
  await assertSiteModuleEnabled(sql, 'blog');
});

test('the switches are read once per short window, not on every request', async () => {
  resetSiteModulesCache();
  const { sql, calls } = settingsSql(JSON.stringify({ blog: false }));
  await loadSiteModules(sql, { now: 1_000 });
  await loadSiteModules(sql, { now: 10_000 });
  assert.equal(calls.length, 1);
  await loadSiteModules(sql, { now: 40_000 });
  assert.equal(calls.length, 2);
});

test('a failed read keeps the last switches seen, and falls back to on when there are none', async () => {
  resetSiteModulesCache();
  const { sql: failing } = settingsSql(undefined, { fails: true });
  assert.equal((await loadSiteModules(failing, { now: 0 })).forum, true);

  const { sql: working } = settingsSql(JSON.stringify({ forum: false }));
  await loadSiteModules(working, { now: 100_000 });
  assert.equal((await loadSiteModules(failing, { now: 200_000 })).forum, false);
});

test('an unreadable saved value falls back to every module on', async () => {
  resetSiteModulesCache();
  const { sql } = settingsSql('{not json');
  assert.deepEqual(await loadSiteModules(sql), { ...DEFAULT_SITE_MODULES });
});

// ---------- handlers ----------

// Every statement gets an empty result except the site_modules lookup.
async function withSiteModules(siteModules, run) {
  resetSiteModulesCache();
  const priorFetch = globalThis.fetch;
  const priorUrl = process.env.DATABASE_URL;
  const answer = ({ query }) => {
    if (/FROM admin_settings\s+WHERE setting_key = 'site_modules'/.test(query) && siteModules) {
      return { fields: [{ name: 'setting_value', dataTypeID: 25 }], rows: [[JSON.stringify(siteModules)]] };
    }
    return { fields: [], rows: [] };
  };
  process.env.DATABASE_URL = 'postgres://user:pass@db.example.test/neondb';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const payload = Array.isArray(body.queries) ? { results: body.queries.map(answer) } : answer(body);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const priorWarn = console.warn;
  console.warn = () => {};
  try {
    return await run();
  } finally {
    console.warn = priorWarn;
    globalThis.fetch = priorFetch;
    resetSiteModulesCache();
    if (priorUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = priorUrl;
    }
  }
}

const jsonEvent = (httpMethod, path, body = undefined) => ({
  httpMethod,
  path,
  rawUrl: `https://gematria.today${path}`,
  headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
  queryStringParameters: {},
  body: body === undefined ? undefined : JSON.stringify(body),
});

const cases = [
  { module: 'forum', name: 'member-forum', handler: memberForumHandler, event: () => jsonEvent('GET', '/api/member-forum') },
  { module: 'blog', name: 'public-posts', handler: publicPostsHandler, event: () => jsonEvent('GET', '/api/public-posts') },
  { module: 'blog', name: 'blog-rss', handler: blogRssHandler, event: () => jsonEvent('GET', '/blog.xml') },
  {
    module: 'blog',
    name: 'blog-post-share',
    handler: blogPostShareHandler,
    event: () => ({ ...jsonEvent('GET', '/blog/digital-roots-in-gematria'), rawUrl: 'https://gematria.today/blog/digital-roots-in-gematria' }),
  },
  { module: 'knowbot', name: 'public-site-chatbot', handler: publicSiteChatbotHandler, event: () => jsonEvent('POST', '/api/public-site-chatbot', { query: 'what is gematria' }) },
  { module: 'gemabot', name: 'ai-agent-learnings', handler: aiAgentLearningsHandler, event: () => jsonEvent('GET', '/api/ai-agent-learnings') },
  { module: 'gemabot', name: 'member-chat-sessions (save)', handler: memberChatSessionsHandler, event: () => jsonEvent('POST', '/api/member-chat-sessions', { transcript: [] }) },
  { module: 'membership', name: 'member-register', handler: memberRegisterHandler, event: () => jsonEvent('POST', '/api/member-register', { username: 'someone', email: 'someone@example.com', password: 'x' }) },
  { module: 'membership', name: 'member-payment-checkout', handler: memberPaymentCheckoutHandler, event: () => jsonEvent('POST', '/api/member-payment-checkout', {}) },
];

const isModuleDisabledResponse = (response) => response.statusCode === 404
  && /currently (unavailable|closed)/i.test(String(response.body || ''));

for (const endpoint of cases) {
  test(`${endpoint.name} answers 404 while ${endpoint.module} is switched off`, async () => {
    const response = await withSiteModules({ [endpoint.module]: false }, () => endpoint.handler(endpoint.event()));
    assert.ok(isModuleDisabledResponse(response), `expected the module-disabled 404, got ${response.statusCode}: ${response.body}`);
  });

  test(`${endpoint.name} is not blocked while ${endpoint.module} is on`, async () => {
    const response = await withSiteModules(null, () => endpoint.handler(endpoint.event()));
    assert.equal(isModuleDisabledResponse(response), false, `${response.statusCode}: ${response.body}`);
  });

  test(`${endpoint.name} ignores switches for other modules`, async () => {
    const others = Object.fromEntries(['forum', 'knowbot', 'gemabot', 'blog', 'membership']
      .filter((name) => name !== endpoint.module)
      .map((name) => [name, false]));
    const response = await withSiteModules(others, () => endpoint.handler(endpoint.event()));
    assert.equal(isModuleDisabledResponse(response), false, `${response.statusCode}: ${response.body}`);
  });
}

test('membership switched off closes sign-ups and checkout with their own messages', async () => {
  const register = await withSiteModules({ membership: false }, () => memberRegisterHandler(cases[7].event()));
  assert.equal(JSON.parse(register.body).error, 'Membership sign-ups are currently closed.');
  const checkout = await withSiteModules({ membership: false }, () => memberPaymentCheckoutHandler(cases[8].event()));
  assert.equal(JSON.parse(checkout.body).error, 'Membership upgrades are currently unavailable.');
});

test('saved GemaBot sessions stay readable while GemaBot is off', async () => {
  const response = await withSiteModules({ gemabot: false }, () => memberChatSessionsHandler(jsonEvent('GET', '/api/member-chat-sessions')));
  // No session cookie, so the member check answers -- not the module switch.
  assert.equal(response.statusCode, 401);
});
