import test from 'node:test';
import assert from 'node:assert/strict';
import { neonConfig } from '@neondatabase/serverless';

import { hashPassword } from '../netlify/functions/_auth.mjs';
import { handler as adminLoginHandler } from '../netlify/functions/admin-login.mjs';
import { handler as memberLoginHandler } from '../netlify/functions/member-login.mjs';
import { handler as memberRegisterHandler } from '../netlify/functions/member-register.mjs';
import { handler as accountRecoveryHandler } from '../netlify/functions/member-account-recovery.mjs';

// The handlers build their own Neon client from DATABASE_URL, so the fake sits
// at Neon's HTTP boundary. It keeps request_rate_limits the way the upsert in
// applyRateLimit does, and knows one staff account; everything else (schema,
// audit, seeding) gets no rows back.
const PRIOR_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  CSRF_SECRET: process.env.CSRF_SECRET,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
};
const PRIOR_FETCH_FUNCTION = neonConfig.fetchFunction;

test.after(() => {
  neonConfig.fetchFunction = PRIOR_FETCH_FUNCTION;
  for (const [key, value] of Object.entries(PRIOR_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function encodeValue(value) {
  if (value === null || value === undefined) return { oid: 25, text: null };
  if (typeof value === 'boolean') return { oid: 16, text: value ? 't' : 'f' };
  return { oid: 25, text: String(value) };
}

function neonResult(rows) {
  const names = rows.length ? Object.keys(rows[0]) : [];
  return {
    command: 'SELECT',
    rowCount: rows.length,
    fields: names.map((name) => ({ name, dataTypeID: encodeValue(rows[0][name]).oid })),
    rows: rows.map((row) => names.map((name) => encodeValue(row[name]).text)),
  };
}

const OWNER_PASSWORD = 'owner-correct-password';
const OWNER_IP = '203.0.113.10';
const ATTACKER_IP = '198.51.100.66';

async function installFakeDatabase({ latencyMs = 0 } = {}) {
  const db = {
    owner: {
      id: 'KevAdmin',
      username: 'KevAdmin',
      email: null,
      display_name: null,
      membership_level: 'free',
      status: 'active',
      email_verified: true,
      password_hash: await hashPassword(OWNER_PASSWORD),
      role: 'super_admin',
      is_admin: true,
    },
    rateLimits: new Map(),
    knownSources: new Set(),
    sessions: 0,
    queries: 0,
    passwordLookups: 0,
  };

  process.env.DATABASE_URL = 'postgresql://tester:secret@fake-db.invalid/neondb';
  process.env.CSRF_SECRET = 'test-csrf-secret';
  delete process.env.ADMIN_USERNAME;

  neonConfig.fetchFunction = async (_url, init) => {
    const { query, params } = JSON.parse(init.body);
    db.queries += 1;
    // Real round trips take time; with it, concurrent requests interleave
    // between a read and the write that follows it.
    if (latencyMs) await new Promise((resolve) => setTimeout(resolve, latencyMs * (0.2 + Math.random())));
    return new Response(JSON.stringify(neonResult(answer(db, query, params))), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return db;
}

function answer(db, query, params) {
  if (/INSERT INTO request_rate_limits/.test(query)) {
    // VALUES (scope, key, 1, now, NULL, now, now, now), then the CASE
    // expressions: window, window, window, limit, block duration.
    const [scope, key] = params;
    const limit = Number(params[9]);
    const blockMs = Number(params[10]);
    const now = Date.now();
    const id = `${scope}\u0000${key}`;
    const row = db.rateLimits.get(id) || { count: 0, blockedUntil: null };
    if (!(row.blockedUntil && row.blockedUntil > now)) {
      row.count += 1;
      row.blockedUntil = row.count > limit ? now + blockMs : null;
    }
    db.rateLimits.set(id, row);
    return [{
      count: row.count,
      window_started_at: new Date(now).toISOString(),
      blocked_until: row.blockedUntil ? new Date(row.blockedUntil).toISOString() : null,
    }];
  }
  if (/UPDATE request_rate_limits\s+SET count = GREATEST\(count - 1, 0\)/.test(query)) {
    const row = db.rateLimits.get(`${params[0]}\u0000${params[1]}`);
    if (row && !(row.blockedUntil && row.blockedUntil > Date.now())) {
      row.count = Math.max(row.count - 1, 0);
    }
    return [];
  }
  if (/INSERT INTO login_known_sources/.test(query)) {
    db.knownSources.add(`${params[0]}\u0000${params[1]}`);
    return [];
  }
  if (/FROM login_known_sources/.test(query)) {
    return db.knownSources.has(`${params[0]}\u0000${params[1]}`) ? [{ known: 1 }] : [];
  }
  if (/FROM users\s+WHERE username = /.test(query)) {
    db.passwordLookups += 1;
    return params[0] === db.owner.username ? [db.owner] : [];
  }
  if (/INSERT INTO sessions/.test(query)) {
    db.sessions += 1;
    return [];
  }
  return [];
}

let spoofedHop = 0;

function loginEvent(handlerName, { ip, password, contentType = 'application/json', extraHeaders = {} }) {
  const body = handlerName === 'admin-login'
    ? { username: 'KevAdmin', password }
    : { identifier: 'KevAdmin', password };
  spoofedHop += 1;
  return {
    httpMethod: 'POST',
    headers: {
      'content-type': contentType,
      'x-nf-client-connection-ip': ip,
      // A client-written X-Forwarded-For used to be the rate-limit key; every
      // request here claims a different one.
      'x-forwarded-for': `10.0.${spoofedHop}.1, ${ip}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function setCookies(response) {
  return [
    ...(response.multiValueHeaders?.['set-cookie'] || []),
    ...[response.headers?.['set-cookie']].flat().filter(Boolean),
  ].join('\n');
}

// ---------- M3: guessing at an account no longer locks its owner out ----------

for (const { name, handler, attemptsUntilBlocked } of [
  { name: 'admin-login', handler: adminLoginHandler, attemptsUntilBlocked: 5 },
  { name: 'member-login', handler: memberLoginHandler, attemptsUntilBlocked: 6 },
]) {
  test(`${name}: an attacker's bad guesses block the attacker, not the owner signing in from elsewhere`, async () => {
    const db = await installFakeDatabase();

    let lastAttackerResponse;
    for (let attempt = 1; attempt <= attemptsUntilBlocked; attempt += 1) {
      lastAttackerResponse = await handler(loginEvent(name, { ip: ATTACKER_IP, password: `guess-${attempt}` }));
    }
    assert.equal(lastAttackerResponse.statusCode, 429, 'the guesser is throttled');

    // A fresh X-Forwarded-For per request no longer buys a fresh limit.
    const retry = await handler(loginEvent(name, { ip: ATTACKER_IP, password: OWNER_PASSWORD }));
    assert.equal(retry.statusCode, 429, 'the block holds even with the right password from the attacker');

    const owner = await handler(loginEvent(name, { ip: OWNER_IP, password: OWNER_PASSWORD, contentType: 'application/json; charset=utf-8' }));
    assert.equal(owner.statusCode, 200, `the owner signs in: ${owner.body}`);
    assert.equal(JSON.parse(owner.body).authenticated, true);
    assert.match(setCookies(owner), /gematria_admin_session=[0-9a-f]{64}/);
    assert.equal(db.sessions, 1);
  });
}

// ---------- ...but guessing at one account from many addresses is capped ----------

// Keyed by account and caller alone, each new address -- every one of a VPS's
// IPv6 /64 included -- got a fresh allowance, so nothing capped guessing at
// one account. Password checks from addresses that have never signed in to
// the account now also count per account from everywhere, shared by both
// sign-in forms, and past the cap only addresses that have signed in to the
// account before are still let through.
test('failed passwords from many addresses close the account to strangers, not to the owner', async () => {
  const db = await installFakeDatabase();

  const ownerFirst = await adminLoginHandler(loginEvent('admin-login', { ip: OWNER_IP, password: OWNER_PASSWORD }));
  assert.equal(ownerFirst.statusCode, 200, ownerFirst.body);

  // Twenty failures are allowed in the hour; the next guess is not checked.
  for (let attempt = 1; attempt <= 21; attempt += 1) {
    const handler = attempt % 2 ? adminLoginHandler : memberLoginHandler;
    const name = attempt % 2 ? 'admin-login' : 'member-login';
    const response = await handler(loginEvent(name, { ip: `198.51.100.${attempt}`, password: `guess-${attempt}` }));
    if (attempt <= 20) {
      assert.equal(response.statusCode, 401, `guess ${attempt} from a fresh address is checked and refused`);
    } else {
      assert.equal(response.statusCode, 429, 'guess 21 is refused before the password is checked');
    }
  }

  for (const [name, handler] of [['admin-login', adminLoginHandler], ['member-login', memberLoginHandler]]) {
    const stranger = await handler(loginEvent(name, { ip: '192.0.2.200', password: OWNER_PASSWORD }));
    assert.equal(stranger.statusCode, 429, `${name}: a new address is refused once the account is capped`);
    assert.match(JSON.parse(stranger.body).error, /reset your password/);

    const owner = await handler(loginEvent(name, { ip: OWNER_IP, password: OWNER_PASSWORD }));
    assert.equal(owner.statusCode, 200, `${name}: the owner's address still signs in: ${owner.body}`);
  }
});

// The cap used to be read before the password check and counted after it, so
// every request that read it before the twenty-first failure was written --
// a concurrent burst from as many fresh addresses as the attacker has -- got a
// real password check. The slot is now claimed atomically up front.
test('a concurrent burst from many addresses gets at most twenty password checks', async () => {
  const db = await installFakeDatabase({ latencyMs: 15 });

  const burst = 80;
  const responses = await Promise.all(Array.from({ length: burst }, (_, index) => adminLoginHandler(
    loginEvent('admin-login', { ip: `2001:db8:${(index + 1).toString(16)}::1`, password: `guess-${index}` }),
  )));

  const checked = responses.filter((response) => response.statusCode === 401).length;
  const refused = responses.filter((response) => response.statusCode === 429).length;
  assert.equal(checked + refused, burst, 'every request is either checked and refused or refused up front');
  assert.ok(checked <= 20, `at most 20 passwords are checked, got ${checked}`);
  assert.ok(db.passwordLookups <= 20, `at most 20 password lookups, got ${db.passwordLookups}`);
});

test('a right password from a new address hands its slot back', async () => {
  const db = await installFakeDatabase();

  for (let attempt = 1; attempt <= 19; attempt += 1) {
    const response = await adminLoginHandler(loginEvent('admin-login', { ip: `198.51.100.${attempt}`, password: `guess-${attempt}` }));
    assert.equal(response.statusCode, 401);
  }
  const ownerNewDevice = await adminLoginHandler(loginEvent('admin-login', { ip: '192.0.2.50', password: OWNER_PASSWORD }));
  assert.equal(ownerNewDevice.statusCode, 200, ownerNewDevice.body);

  // Only the nineteen failures are counted, so one more guess is still checked.
  const twentieth = await adminLoginHandler(loginEvent('admin-login', { ip: '198.51.100.20', password: 'guess-20' }));
  assert.equal(twentieth.statusCode, 401);
  const twentyFirst = await adminLoginHandler(loginEvent('admin-login', { ip: '198.51.100.21', password: OWNER_PASSWORD }));
  assert.equal(twentyFirst.statusCode, 429);
  assert.equal(db.sessions, 1);
});

test('rotating through one IPv6 /64 does not buy fresh guesses', async () => {
  await installFakeDatabase();

  let last;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    last = await adminLoginHandler(loginEvent('admin-login', { ip: `2001:db8:66:1::${attempt.toString(16)}`, password: `guess-${attempt}` }));
  }
  assert.equal(last.statusCode, 429, 'every address in the /64 shares one allowance');

  const elsewhere = await adminLoginHandler(loginEvent('admin-login', { ip: '2001:db8:66:2::1', password: OWNER_PASSWORD }));
  assert.equal(elsewhere.statusCode, 200, 'another /64 is another caller');
});

// ---------- L1: login CSRF ----------

// A cross-site page can auto-submit <form enctype="text/plain"> whose body
// reads as JSON. parseBody parsed it, and the response signed the visitor into
// the attacker's account.
const crossSiteFormBody = '{"identifier":"KevAdmin","password":"owner-correct-password","x":"="}';

for (const { name, handler } of [
  { name: 'member-login', handler: memberLoginHandler },
  { name: 'admin-login', handler: adminLoginHandler },
  { name: 'member-register', handler: memberRegisterHandler },
  { name: 'member-account-recovery', handler: accountRecoveryHandler },
]) {
  test(`${name} refuses a body that is not sent as JSON, before touching the database`, async () => {
    const db = await installFakeDatabase();

    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', undefined]) {
      const headers = { 'x-nf-client-connection-ip': ATTACKER_IP };
      if (contentType) headers['content-type'] = contentType;
      const response = await handler({ httpMethod: 'POST', headers, body: crossSiteFormBody });

      assert.equal(response.statusCode, 415, `${contentType} is refused`);
      assert.match(JSON.parse(response.body).error, /JSON/);
      assert.doesNotMatch(setCookies(response), /_session=[0-9a-f]/, 'no session cookie is issued');
    }
    assert.equal(db.queries, 0);
    assert.equal(db.sessions, 0);
  });

  test(`${name} refuses a request the browser marks as cross-site`, async () => {
    const db = await installFakeDatabase();
    const response = await handler({
      httpMethod: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site', 'x-nf-client-connection-ip': ATTACKER_IP },
      body: crossSiteFormBody,
    });

    assert.equal(response.statusCode, 403);
    assert.equal(db.queries, 0);
  });
}

test('member-login still signs in a same-origin JSON request', async () => {
  const db = await installFakeDatabase();
  const response = await memberLoginHandler(loginEvent('member-login', {
    ip: OWNER_IP,
    password: OWNER_PASSWORD,
    extraHeaders: { 'sec-fetch-site': 'same-origin', origin: 'https://gematria.today', host: 'gematria.today' },
  }));

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(db.sessions, 1);
});
