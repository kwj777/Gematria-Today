import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEntries,
  normalizeEntry,
  normalizeText,
} from '../netlify/functions/ai-agent-learnings.mjs';

// ---------- normalizeText ----------

test('normalizeText collapses internal whitespace runs to a single space', () => {
  assert.equal(normalizeText('one    two\nthree', 100), 'one two three');
});

test('normalizeText trims surrounding whitespace', () => {
  assert.equal(normalizeText('  hello world  ', 100), 'hello world');
});

test('normalizeText slices to the requested max length', () => {
  assert.equal(normalizeText('a'.repeat(50), 10), 'a'.repeat(10));
});

test('normalizeText coerces nullish input to ""', () => {
  assert.equal(normalizeText(null, 100), '');
  assert.equal(normalizeText(undefined, 100), '');
});

// ---------- normalizeEntry ----------

test('normalizeEntry lowercases the prompt but preserves explanation case', () => {
  const result = normalizeEntry({ prompt: 'HELLO World', explanation: 'A Greeting' });
  assert.equal(result.prompt, 'hello world');
  assert.equal(result.explanation, 'A Greeting');
});

test('normalizeEntry caps prompt at 240 chars and explanation at 600 chars', () => {
  const result = normalizeEntry({
    prompt: 'x'.repeat(500),
    explanation: 'y'.repeat(1000),
  });
  assert.equal(result.prompt.length, 240);
  assert.equal(result.explanation.length, 600);
});

test('normalizeEntry returns empty strings for missing fields', () => {
  const result = normalizeEntry({});
  assert.equal(result.prompt, '');
  assert.equal(result.explanation, '');
});

test('normalizeEntry tolerates an undefined argument via the default parameter', () => {
  const result = normalizeEntry();
  assert.equal(result.prompt, '');
  assert.equal(result.explanation, '');
});

// ---------- normalizeEntries ----------

test('normalizeEntries drops entries that have no prompt or no explanation', () => {
  const result = normalizeEntries([
    { prompt: 'kept', explanation: 'fine' },
    { prompt: '', explanation: 'missing prompt' },
    { prompt: 'missing explanation', explanation: '' },
    { prompt: 'kept too', explanation: 'fine' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].prompt, 'kept');
  assert.equal(result[1].prompt, 'kept too');
});

test('normalizeEntries deduplicates by case-insensitive prompt (first occurrence wins)', () => {
  const result = normalizeEntries([
    { prompt: 'Hello', explanation: 'first' },
    { prompt: 'HELLO', explanation: 'second' },
    { prompt: '  hello  ', explanation: 'third' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].prompt, 'hello');
  assert.equal(result[0].explanation, 'first');
});

test('normalizeEntries caps the result list at MAX_ENTRIES (200)', () => {
  const inputs = Array.from({ length: 250 }, (_, i) => ({
    prompt: `prompt-${i}`,
    explanation: `explanation-${i}`,
  }));
  const result = normalizeEntries(inputs);
  assert.equal(result.length, 200);
  // The first 200 unique prompts are kept.
  assert.equal(result[0].prompt, 'prompt-0');
  assert.equal(result[199].prompt, 'prompt-199');
});

test('normalizeEntries returns [] for an empty array or missing argument', () => {
  assert.deepEqual(normalizeEntries([]), []);
  assert.deepEqual(normalizeEntries(), []);
});

test('normalizeEntries normalizes whitespace inside prompts before deduping', () => {
  // After collapsing whitespace, both entries reduce to the same prompt.
  const result = normalizeEntries([
    { prompt: 'multi   space prompt', explanation: 'first' },
    { prompt: '  multi space prompt  ', explanation: 'second' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].explanation, 'first');
});
