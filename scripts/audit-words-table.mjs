#!/usr/bin/env node
// Reports rows in the words table that should never have been stored -- bare
// numbers, punctuation, fragments, raw Wordnik markup -- using the same rule
// the sitemap and word pages apply.
//
//   node scripts/audit-words-table.mjs             # report only (default)
//   node scripts/audit-words-table.mjs --limit 50  # show more examples
//   node scripts/audit-words-table.mjs --delete    # actually remove them
//
// Reporting is the default on purpose: this deletes production rows, and the
// count should be eyeballed before anything is removed.
import { neon } from '@neondatabase/serverless';
import { isIndexableWord } from '../netlify/functions/_words.mjs';

const args = process.argv.slice(2);
const shouldDelete = args.includes('--delete');
const limitIndex = args.indexOf('--limit');
const exampleLimit = limitIndex === -1 ? 25 : Math.max(1, Number.parseInt(args[limitIndex + 1], 10) || 25);

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable.');
  console.error('Run with: DATABASE_URL="postgres://..." node scripts/audit-words-table.mjs');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT word, gematria_value, search_count FROM words`;
const junk = rows.filter((row) => !isIndexableWord(row.word));

console.log(`words table: ${rows.length} row(s)`);
console.log(`unstorable:  ${junk.length} row(s) (${rows.length ? ((junk.length / rows.length) * 100).toFixed(2) : '0'}%)`);

if (junk.length === 0) {
  console.log('Nothing to clean.');
  process.exit(0);
}

console.log(`\nExamples (up to ${exampleLimit}):`);
for (const row of junk.slice(0, exampleLimit)) {
  console.log(`  ${JSON.stringify(row.word)}  value=${row.gematria_value}  searches=${row.search_count}`);
}

// Anything searched repeatedly is worth a look before deleting: it may point at
// a real word the rule is rejecting rather than genuine junk.
const searched = junk.filter((row) => Number(row.search_count) > 1);
if (searched.length > 0) {
  console.log(`\n${searched.length} of these have been searched more than once:`);
  for (const row of searched.slice(0, exampleLimit)) {
    console.log(`  ${JSON.stringify(row.word)}  searches=${row.search_count}`);
  }
  console.log('Check these before deleting -- a repeatedly searched entry may be a real word the rule rejects.');
}

if (!shouldDelete) {
  console.log('\nReport only. Re-run with --delete to remove these rows.');
  process.exit(0);
}

const words = junk.map((row) => row.word);
const deleted = await sql`DELETE FROM words WHERE word = ANY(${words}) RETURNING word`;
console.log(`\nDeleted ${deleted.length} row(s).`);
