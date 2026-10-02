import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Neon sends every query parameter as untyped text, so Postgres has to infer
// each $N's type from where it appears. A parameter whose only use is a bare
// `$N IS NULL` / `$N IS NOT NULL` gives it nothing to infer from, and the whole
// query fails with "could not determine data type of parameter $N" whatever
// the value. That broke every Stripe webhook delivery. Cast such a parameter
// (`${value}::text IS NOT NULL`) so the type is explicit.
const FUNCTIONS_DIR = new URL('../netlify/functions/', import.meta.url);
const UNTYPED_NULL_CHECK = /\$\{[^}]+\}\s+IS\s+(?:NOT\s+)?(?:NULL|TRUE|FALSE|UNKNOWN)\b/gi;

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

test('no SQL parameter is used only in an untyped IS [NOT] NULL check', () => {
  const offenders = [];
  for (const name of readdirSync(FUNCTIONS_DIR)) {
    if (!name.endsWith('.mjs')) {
      continue;
    }
    const source = readFileSync(join(FUNCTIONS_DIR.pathname, name), 'utf8');
    for (const match of source.matchAll(UNTYPED_NULL_CHECK)) {
      offenders.push(`netlify/functions/${name}:${lineOf(source, match.index)} ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `Cast these parameters, e.g. \${value}::text IS NOT NULL:\n${offenders.join('\n')}`);
});

test('the Stripe subscription sync casts its optional identifiers', () => {
  const source = readFileSync(join(FUNCTIONS_DIR.pathname, '_member.mjs'), 'utf8');
  const start = source.indexOf('export async function syncMembershipFromStripeSubscription');
  assert.notEqual(start, -1);
  const body = source.slice(start, source.indexOf('\n}\n', start));
  for (const identifier of ['normalizedMemberId', 'normalizedSubscriptionId', 'normalizedCustomerId']) {
    assert.match(body, new RegExp(`\\$\\{${identifier}\\}::text IS NOT NULL`));
  }
});
