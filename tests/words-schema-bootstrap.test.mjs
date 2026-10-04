import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// No runtime ensure*Schema creates the words table, so the SQL bootstrap is
// the only thing that does. A database built from the README's list without
// it answered the calculator, value search, word pages and the words sitemap
// with `relation "words" does not exist`.
const ROOT = new URL('../', import.meta.url);
const SCHEMA = readFileSync(new URL('sql/words_schema.sql', ROOT), 'utf8');
const README = readFileSync(new URL('README.md', ROOT), 'utf8');

test('words_schema.sql creates the words table with every column the functions read', () => {
  const table = /CREATE TABLE IF NOT EXISTS words \(([\s\S]*?)\n\);/.exec(SCHEMA);
  assert.ok(table, 'words_schema.sql should create the words table idempotently');
  for (const column of ['word', 'gematria_value', 'digital_root', 'is_base_root', 'search_count', 'created_at', 'updated_at']) {
    assert.match(table[1], new RegExp(`^\\s*${column}\\s`, 'm'), `words.${column} is missing`);
  }
  // search_count is incremented with `search_count + 1`; a NULL would stay NULL.
  assert.match(table[1], /search_count INTEGER NOT NULL DEFAULT 0/);
});

test('words_schema.sql indexes the hot lookups and can be rerun', () => {
  assert.match(SCHEMA, /CREATE UNIQUE INDEX IF NOT EXISTS \w+ ON words \(LOWER\(word\)\)/);
  assert.match(SCHEMA, /CREATE INDEX IF NOT EXISTS \w+ ON words \(gematria_value\)/);
  for (const statement of SCHEMA.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX)[^;]*/g)) {
    assert.match(statement, /IF NOT EXISTS/, `not idempotent: ${statement.split('\n')[0]}`);
  }
});

test('the README bootstrap list names every schema file in sql/', () => {
  const schemaFiles = readdirSync(new URL('sql/', ROOT)).filter((name) => name.endsWith('_schema.sql'));
  assert.ok(schemaFiles.includes('words_schema.sql'));
  for (const file of schemaFiles) {
    assert.ok(README.includes(`sql/${file}`), `README should list sql/${file}`);
  }
});
