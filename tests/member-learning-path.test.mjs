import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordLearningPathCompletion,
} from '../netlify/functions/member-learning-path-complete.mjs';
import {
  consumeLearningPathStep1Intent,
} from '../netlify/functions/member-learning-path-consume.mjs';

// Minimal SQL tagged-template mock. The neon() client is itself a
// tagged-template function, so the helpers can be exercised directly with this
// stub. Tests pass a `respondWith` function to capture each query and return a
// canned row set.
function createMockSql(respondWith) {
  const calls = [];
  function sql(strings, ...values) {
    const query = strings.join('?');
    calls.push({ query, values });
    return Promise.resolve(respondWith({ query, values }) ?? []);
  }
  return { sql, calls };
}

// ---------- recordLearningPathCompletion ----------

test('recordLearningPathCompletion issues an UPDATE keyed on user_id and returns the new preferences', async () => {
  const completedAt = '2026-05-21T12:00:00';
  const { sql, calls } = createMockSql(() => [
    { preferences: { learningPathCompletedAt: completedAt } },
  ]);

  const preferences = await recordLearningPathCompletion(sql, 'user-42');

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /UPDATE member_profiles/);
  assert.match(calls[0].query, /WHERE user_id =/);
  assert.deepEqual(calls[0].values, ['user-42']);
  assert.deepEqual(preferences, { learningPathCompletedAt: completedAt });
});

test('recordLearningPathCompletion guards against overwriting an existing completion timestamp (idempotency)', async () => {
  const { sql, calls } = createMockSql(() => [{ preferences: {} }]);
  await recordLearningPathCompletion(sql, 'user-1');
  // The CASE WHEN guard is what makes the endpoint safe to call repeatedly:
  // a second click on the Level 4 banner must not reset the recorded date.
  assert.match(calls[0].query, /CASE/);
  assert.match(calls[0].query, /preferences \? 'learningPathCompletedAt'/);
});

test('recordLearningPathCompletion writes into the learningPathCompletedAt key (not a typo of the consume key)', async () => {
  const { sql, calls } = createMockSql(() => [{ preferences: {} }]);
  await recordLearningPathCompletion(sql, 'user-1');
  assert.match(calls[0].query, /\{learningPathCompletedAt\}/);
  assert.doesNotMatch(calls[0].query, /learningPathStep1Intent/);
});

test('recordLearningPathCompletion returns {} when the UPDATE matches no rows (user has no profile yet)', async () => {
  const { sql } = createMockSql(() => []);
  const preferences = await recordLearningPathCompletion(sql, 'orphan-user');
  assert.deepEqual(preferences, {});
});

// ---------- consumeLearningPathStep1Intent ----------

test('consumeLearningPathStep1Intent issues an UPDATE that strips the learningPathStep1Intent key and returns the new preferences', async () => {
  const { sql, calls } = createMockSql(() => [
    { preferences: { favoriteCipher: 'english-base-6' } },
  ]);

  const preferences = await consumeLearningPathStep1Intent(sql, 'user-7');

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /UPDATE member_profiles/);
  assert.match(calls[0].query, /preferences - 'learningPathStep1Intent'/);
  assert.match(calls[0].query, /WHERE user_id =/);
  assert.deepEqual(calls[0].values, ['user-7']);
  assert.deepEqual(preferences, { favoriteCipher: 'english-base-6' });
});

test('consumeLearningPathStep1Intent does NOT touch the learningPathCompletedAt key (only clears the intent flag)', async () => {
  const { sql, calls } = createMockSql(() => [{ preferences: {} }]);
  await consumeLearningPathStep1Intent(sql, 'user-1');
  // The consume endpoint must not regress completion state — guard against a
  // future refactor accidentally widening the delete.
  assert.doesNotMatch(calls[0].query, /learningPathCompletedAt/);
});

test('consumeLearningPathStep1Intent returns {} when the UPDATE matches no rows', async () => {
  const { sql } = createMockSql(() => []);
  const preferences = await consumeLearningPathStep1Intent(sql, 'orphan-user');
  assert.deepEqual(preferences, {});
});

test('consumeLearningPathStep1Intent surfaces an empty object when the UPDATE row carries a null preferences column', async () => {
  const { sql } = createMockSql(() => [{ preferences: null }]);
  const preferences = await consumeLearningPathStep1Intent(sql, 'user-1');
  assert.deepEqual(preferences, {});
});
