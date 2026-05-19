import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  consumeAccountRecoveryRequest,
  createAccountRecoveryRequest,
  hashToken,
} from '../netlify/functions/_auth.mjs';

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Build a minimal SQL tagged-template mock that routes by query content so the
// recovery helpers can complete an end-to-end token issue / consume cycle
// without a real database. The neon() client is itself a tagged-template
// function, so passing this mock directly into the helpers exercises the same
// code path as production.
function createMockSql({
  rateLimitRow = { count: 1, blocked_until: null },
  consumeRows = [],
} = {}) {
  const calls = [];

  function sql(strings, ...values) {
    const query = strings.join('?');
    calls.push({ query, values });

    // CREATE TABLE / CREATE INDEX statements just return [].
    if (/CREATE TABLE|CREATE INDEX/i.test(query)) {
      return Promise.resolve([]);
    }

    // applyRateLimit issues an INSERT INTO request_rate_limits ... RETURNING.
    if (/INSERT INTO request_rate_limits/i.test(query)) {
      return Promise.resolve([rateLimitRow]);
    }

    // consumeAccountRecoveryRequest issues an UPDATE account_recovery_requests
    // ... RETURNING * — return the configured rows.
    if (/UPDATE account_recovery_requests/i.test(query)) {
      return Promise.resolve(consumeRows);
    }

    // DELETE / INSERT INTO account_recovery_requests, log inserts, etc.
    return Promise.resolve([]);
  }

  return { sql, calls };
}

function findCall(calls, pattern) {
  return calls.find(({ query }) => pattern.test(query));
}

// ---------- createAccountRecoveryRequest ----------

test('createAccountRecoveryRequest throws when userId is missing', async () => {
  const { sql } = createMockSql();
  await assert.rejects(
    createAccountRecoveryRequest(sql, { role: 'member', recoveryType: 'forgot-password' }),
    /Missing recovery request details/,
  );
});

test('createAccountRecoveryRequest throws when role is missing', async () => {
  const { sql } = createMockSql();
  await assert.rejects(
    createAccountRecoveryRequest(sql, { userId: 'u1', recoveryType: 'forgot-password' }),
    /Missing recovery request details/,
  );
});

test('createAccountRecoveryRequest throws when recoveryType is missing', async () => {
  const { sql } = createMockSql();
  await assert.rejects(
    createAccountRecoveryRequest(sql, { userId: 'u1', role: 'member' }),
    /Missing recovery request details/,
  );
});

test('createAccountRecoveryRequest throws when called without arguments', async () => {
  const { sql } = createMockSql();
  await assert.rejects(
    createAccountRecoveryRequest(sql),
    /Missing recovery request details/,
  );
});

test('createAccountRecoveryRequest returns a 48-char hex token and a future expiresAt', async () => {
  const { sql } = createMockSql();
  const before = Date.now();
  const result = await createAccountRecoveryRequest(sql, {
    userId: 'u-1',
    role: 'member',
    recoveryType: 'forgot-password',
  });
  const after = Date.now();

  assert.match(result.token, /^[0-9a-f]{48}$/);
  assert.ok(result.expiresAt instanceof Date);
  // Default TTL is positive — expiry must lie strictly after the call window.
  assert.ok(result.expiresAt.getTime() > before);
  assert.ok(result.expiresAt.getTime() >= after);
});

test('createAccountRecoveryRequest respects a custom ttlMs', async () => {
  const { sql } = createMockSql();
  const ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  const before = Date.now();
  const result = await createAccountRecoveryRequest(sql, {
    userId: 'u-1',
    role: 'member',
    recoveryType: 'forgot-password',
    ttlMs,
  });
  const elapsedSinceBefore = result.expiresAt.getTime() - before;
  // Should be within ~1s of the requested TTL.
  assert.ok(elapsedSinceBefore >= ttlMs);
  assert.ok(elapsedSinceBefore <= ttlMs + 1000);
});

test('createAccountRecoveryRequest stores the token by sha256 hash, never as plaintext', async () => {
  const { sql, calls } = createMockSql();
  const result = await createAccountRecoveryRequest(sql, {
    userId: 'user-77',
    role: 'admin',
    recoveryType: 'forgot-password',
  });

  const insert = findCall(calls, /INSERT INTO account_recovery_requests/i);
  assert.ok(insert, 'expected an INSERT into account_recovery_requests');
  // Verify the bound parameter list contains the hashed token, not the raw one.
  assert.ok(insert.values.includes(hashToken(result.token)));
  assert.ok(insert.values.includes(sha256Hex(result.token)));
  assert.ok(!insert.values.includes(result.token));
});

test('createAccountRecoveryRequest issues a DELETE for prior unconsumed requests before INSERT', async () => {
  const { sql, calls } = createMockSql();
  await createAccountRecoveryRequest(sql, {
    userId: 'user-1',
    role: 'member',
    recoveryType: 'forgot-password',
    lookupKey: 'user@example.com',
  });

  const deleteIdx = calls.findIndex(({ query }) => /DELETE FROM account_recovery_requests/i.test(query));
  const insertIdx = calls.findIndex(({ query }) => /INSERT INTO account_recovery_requests/i.test(query));
  assert.notEqual(deleteIdx, -1, 'expected a DELETE call for prior pending requests');
  assert.notEqual(insertIdx, -1, 'expected an INSERT call for the new request');
  assert.ok(deleteIdx < insertIdx, 'DELETE must run before INSERT');
});

test('createAccountRecoveryRequest binds the lookupKey on insert (or NULL when omitted)', async () => {
  const { sql, calls } = createMockSql();
  await createAccountRecoveryRequest(sql, {
    userId: 'user-1',
    role: 'member',
    recoveryType: 'forgot-password',
    lookupKey: 'user@example.com',
  });

  const insert = findCall(calls, /INSERT INTO account_recovery_requests/i);
  assert.ok(insert.values.includes('user@example.com'));
});

test('createAccountRecoveryRequest propagates a rate-limit block as a 429 with retry-after header', async () => {
  const blockedUntil = new Date(Date.now() + 60_000).toISOString();
  const { sql } = createMockSql({
    rateLimitRow: { count: 999, blocked_until: blockedUntil },
  });

  await assert.rejects(
    createAccountRecoveryRequest(sql, {
      userId: 'user-1',
      role: 'member',
      recoveryType: 'forgot-password',
    }),
    (err) => {
      assert.equal(err.statusCode, 429);
      assert.ok(err.headers && err.headers['retry-after']);
      assert.ok(Number(err.headers['retry-after']) >= 1);
      return true;
    },
  );
});

// ---------- consumeAccountRecoveryRequest ----------

test('consumeAccountRecoveryRequest returns null when token is missing or empty', async () => {
  const { sql } = createMockSql();
  assert.equal(
    await consumeAccountRecoveryRequest(sql, { role: 'member', recoveryType: 'forgot-password', token: '' }),
    null,
  );
  assert.equal(
    await consumeAccountRecoveryRequest(sql, { role: 'member', recoveryType: 'forgot-password' }),
    null,
  );
  assert.equal(
    await consumeAccountRecoveryRequest(sql, { role: 'member', recoveryType: 'forgot-password', token: '   ' }),
    null,
  );
});

test('consumeAccountRecoveryRequest returns null when role or recoveryType is missing', async () => {
  const { sql } = createMockSql({ consumeRows: [{ id: 'r1', user_id: 'u1' }] });
  assert.equal(
    await consumeAccountRecoveryRequest(sql, { recoveryType: 'forgot-password', token: 'abc' }),
    null,
  );
  assert.equal(
    await consumeAccountRecoveryRequest(sql, { role: 'member', token: 'abc' }),
    null,
  );
});

test('consumeAccountRecoveryRequest looks up tokens by sha256 hash, never plaintext', async () => {
  const { sql, calls } = createMockSql({ consumeRows: [{ id: 'r1', user_id: 'u1', role: 'member' }] });
  await consumeAccountRecoveryRequest(sql, {
    role: 'member',
    recoveryType: 'forgot-password',
    token: 'plaintext-token-value',
  });

  const update = findCall(calls, /UPDATE account_recovery_requests/i);
  assert.ok(update, 'expected an UPDATE against account_recovery_requests');
  assert.ok(update.values.includes(hashToken('plaintext-token-value')));
  assert.ok(!update.values.includes('plaintext-token-value'));
});

test('consumeAccountRecoveryRequest returns the first row when a match is found', async () => {
  const matched = { id: 'r1', user_id: 'u-99', role: 'admin', recovery_type: 'forgot-password' };
  const { sql } = createMockSql({ consumeRows: [matched] });

  const result = await consumeAccountRecoveryRequest(sql, {
    role: 'admin',
    recoveryType: 'forgot-password',
    token: 'some-token',
  });
  assert.deepEqual(result, matched);
});

test('consumeAccountRecoveryRequest returns null when the UPDATE produces no rows (expired or wrong role)', async () => {
  const { sql } = createMockSql({ consumeRows: [] });
  const result = await consumeAccountRecoveryRequest(sql, {
    role: 'member',
    recoveryType: 'forgot-password',
    token: 'expired-or-wrong',
  });
  assert.equal(result, null);
});

test('consumeAccountRecoveryRequest trims whitespace from the token before hashing', async () => {
  const { sql, calls } = createMockSql({ consumeRows: [{ id: 'r1', user_id: 'u1' }] });
  await consumeAccountRecoveryRequest(sql, {
    role: 'member',
    recoveryType: 'forgot-password',
    token: '   space-padded-token   ',
  });

  const update = findCall(calls, /UPDATE account_recovery_requests/i);
  assert.ok(update.values.includes(hashToken('space-padded-token')));
});
