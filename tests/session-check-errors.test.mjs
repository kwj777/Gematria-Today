import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { neonConfig } from '@neondatabase/serverless';

import { handler as memberSessionHandler } from '../netlify/functions/member-session.mjs';
import { handler as adminSessionHandler } from '../netlify/functions/admin-session.mjs';

// member-session and admin-session used to answer every thrown error with
// 200 { authenticated: false } and a Set-Cookie expiring the session -- a Neon
// timeout or a cold-start DDL failure signed members out site-wide, and pages
// such as premium research read it as "not a member".

const PRIOR_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  CSRF_SECRET: process.env.CSRF_SECRET,
};
const PRIOR_FETCH_FUNCTION = neonConfig.fetchFunction;

test.after(() => {
  neonConfig.fetchFunction = PRIOR_FETCH_FUNCTION;
  for (const [key, value] of Object.entries(PRIOR_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function emptyNeonResult() {
  return { command: 'SELECT', rowCount: 0, fields: [], rows: [] };
}

// failWhen decides, per statement, whether the database is "down" for it.
function installDatabase({ failWhen = () => false } = {}) {
  const state = { queries: [] };
  process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
  process.env.CSRF_SECRET = 'test-csrf-secret';
  neonConfig.fetchFunction = async (_url, init) => {
    const { query } = JSON.parse(init.body);
    state.queries.push(query);
    if (failWhen(query, state)) {
      throw new TypeError('fetch failed');
    }
    return new Response(JSON.stringify(emptyNeonResult()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return state;
}

function setCookies(response) {
  return [
    ...(response.multiValueHeaders?.['set-cookie'] || []),
    ...[response.headers?.['set-cookie']].flat().filter(Boolean),
  ];
}

function sessionLookupFails(query) {
  return /FROM sessions\s+JOIN users/.test(query);
}

const memberCookie = { cookie: 'gematria_member_session=abc123; gematria_member_tier=lifetime' };
const adminCookie = { cookie: 'gematria_admin_session=def456' };

test('member-session answers a database failure with a 503 and leaves the cookies alone', async () => {
  installDatabase({ failWhen: sessionLookupFails });

  const response = await memberSessionHandler({ httpMethod: 'GET', headers: memberCookie });

  assert.equal(response.statusCode, 503);
  assert.match(JSON.parse(response.body).error, /try again/i);
  assert.deepEqual(setCookies(response), [], 'no Set-Cookie: the session stays valid');
});

test('member-session still signs out a session the database does not know', async () => {
  installDatabase();

  const response = await memberSessionHandler({ httpMethod: 'GET', headers: memberCookie });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { authenticated: false });
  const cookies = setCookies(response).join('\n');
  assert.match(cookies, /gematria_member_session=;[^\n]*Expires=Thu, 01 Jan 1970/);
  assert.match(cookies, /gematria_member_tier=;[^\n]*Expires=Thu, 01 Jan 1970/);
});

test('member-session answers a visitor with no session cookie without a database round trip', async () => {
  const state = installDatabase({ failWhen: () => true });

  const response = await memberSessionHandler({ httpMethod: 'GET', headers: {} });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { authenticated: false });
  assert.equal(state.queries.length, 0);
});

test('admin-session answers a database failure with a 503 and leaves the admin cookie alone', async () => {
  installDatabase({ failWhen: sessionLookupFails });

  const response = await adminSessionHandler({ httpMethod: 'GET', headers: adminCookie });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(setCookies(response), []);
});

test('admin-session does not sign the admin out when its member-cookie fallback hits a database failure', async () => {
  // The admin cookie is unknown (a real 401), so the handler falls back to
  // getOptionalAuthenticatedSession -- and the database fails under it.
  let lookups = 0;
  installDatabase({
    failWhen: (query) => sessionLookupFails(query) && ++lookups > 1,
  });

  const response = await adminSessionHandler({
    httpMethod: 'GET',
    headers: { cookie: 'gematria_admin_session=stale; gematria_member_session=abc123' },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(setCookies(response), []);
});

test('admin-session still signs out an admin session the database does not know', async () => {
  installDatabase();

  const response = await adminSessionHandler({ httpMethod: 'GET', headers: adminCookie });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { authenticated: false });
  assert.match(setCookies(response).join('\n'), /gematria_admin_session=;[^\n]*Expires=Thu, 01 Jan 1970/);
});

// ---------- premium research tells the three outcomes apart ----------

// Runs page-scripts/premium-research-1.js against a minimal DOM and a stubbed
// /api/member-session, then reports which panel the page revealed.
async function loadPremiumResearchWith(sessionResponse) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      const classes = new Set(['d-none']);
      elements.set(id, {
        id,
        textContent: '',
        innerHTML: '',
        className: '',
        value: '',
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          toggle: (name, force) => {
            const on = force === undefined ? !classes.has(name) : Boolean(force);
            if (on) classes.add(name);
            else classes.delete(name);
            return on;
          },
          contains: (name) => classes.has(name),
        },
        addEventListener() {},
        focus() {},
      });
    }
    return elements.get(id);
  };
  const windowListeners = {};
  const requests = [];
  const sandbox = {
    document: {
      getElementById: element,
      querySelectorAll: () => [],
    },
    window: {
      addEventListener: (type, listener) => { windowListeners[type] = listener; },
      setTimeout: () => 0,
      clearTimeout: () => {},
      location: { reload() {}, assign() {} },
    },
    fetch: async (url) => {
      requests.push(url);
      if (url === '/api/member-session') {
        return new Response(JSON.stringify(sessionResponse.body), { status: sessionResponse.status });
      }
      return new Response(JSON.stringify({ payload: { totals: {} } }), { status: 200 });
    },
    Response,
    Date,
    String,
    Array,
    Boolean,
    Object,
    encodeURIComponent,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../page-scripts/premium-research-1.js', import.meta.url), 'utf8'), sandbox);
  await windowListeners.DOMContentLoaded();

  const visible = (id) => !element(id).classList.contains('d-none');
  return {
    locked: visible('premiumLockedPanel'),
    signInPrompt: visible('premiumSignInPrompt'),
    error: visible('premiumErrorPanel'),
    errorMessage: element('premiumErrorMessage').textContent,
    requests,
  };
}

test('premium research shows the error panel, not the upsell, when the session check fails', async () => {
  const page = await loadPremiumResearchWith({ status: 503, body: { error: 'We could not check your sign-in right now. Please try again.' } });

  assert.equal(page.error, true);
  assert.equal(page.locked, false, 'a paying member is not shown the membership upsell');
  assert.match(page.errorMessage, /try again/i);
});

test('premium research asks a signed-out visitor to sign in', async () => {
  const page = await loadPremiumResearchWith({ status: 200, body: { authenticated: false } });

  assert.equal(page.locked, true);
  assert.equal(page.signInPrompt, true);
  assert.equal(page.error, false);
});

test('premium research shows the upsell alone to a signed-in free member', async () => {
  const page = await loadPremiumResearchWith({ status: 200, body: { authenticated: true, member: { membershipLevel: 'free' } } });

  assert.equal(page.locked, true);
  assert.equal(page.signInPrompt, false);
  assert.equal(page.error, false);
});

test('premium research opens the tools for a premium member', async () => {
  const page = await loadPremiumResearchWith({ status: 200, body: { authenticated: true, member: { membershipLevel: 'lifetime' } } });

  assert.equal(page.locked, false);
  assert.equal(page.error, false);
  assert.ok(page.requests.some((url) => url.startsWith('/api/member-premium-research?action=stats')));
});

test('the premium research page has the sign-in prompt the script reveals', () => {
  const page = readFileSync(new URL('../src/premium-research.html', import.meta.url), 'utf8');
  const lockedPanel = page.slice(page.indexOf('id="premiumLockedPanel"'), page.indexOf('id="premiumErrorPanel"'));
  assert.match(lockedPanel, /id="premiumSignInPrompt" class="[^"]*\bd-none\b/);
  assert.match(lockedPanel, /href="\/member\.html\?auth=login#authSection"/);
});
