#!/usr/bin/env node
// Counts how many generated /w/ and /v/ URLs the site is actually offering to
// search engines, under the current gate and under the one it replaced.
//
//   DATABASE_URL="postgres://..." node scripts/audit-index-coverage.mjs
//
// Why this exists: the size of the generated page set is invisible from the
// repository. `words` is written to at runtime, so the only way to know how
// many thin pages are in the index is to ask the database. Search Console for
// the quarter to 2026-08-06 showed the top eight queries by impressions were
// archaic dictionary words with zero clicks between them -- pages nobody wrote,
// published because one lookup was enough to qualify a word.
//
// Run it before and after a deploy that changes the thresholds in _words.mjs.
import { neon } from '@neondatabase/serverless';
import {
  isPublishableWord,
  MIN_SEARCHES_FOR_INDEX,
  MIN_SHARED_VALUE_WORDS,
} from '../netlify/functions/_words.mjs';
import { FEATURED_WORDS, getFeaturedWord } from '../netlify/functions/_featured-words.mjs';

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable.');
  console.error('Run with: DATABASE_URL="postgres://..." node scripts/audit-index-coverage.mjs');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const rows = await sql`SELECT word, gematria_value, search_count FROM words`;
const publishable = rows.filter((row) => isPublishableWord(row.word));

// Group size decides whether a page is a list of related words or a lone
// letter sum. Both /w/ and /v/ gate on it, so both read it from here.
const groupSize = new Map();
for (const row of publishable) {
  const value = Number(row.gematria_value);
  groupSize.set(value, (groupSize.get(value) || 0) + 1);
}

const searchedAtAll = publishable.filter((row) => Number(row.search_count || 0) > 0);
// Featured words (_featured-words.mjs) are indexed whatever the gate says, and
// the sitemap lists them even when the table has no row for them, so they are
// counted from the list rather than the table.
const passesGate = (row) => Number(row.search_count || 0) >= MIN_SEARCHES_FOR_INDEX
  && (groupSize.get(Number(row.gematria_value)) || 0) >= MIN_SHARED_VALUE_WORDS;
const wordPagesNow = publishable.filter((row) => passesGate(row) && !getFeaturedWord(row.word));
const featuredPages = FEATURED_WORDS.length;

const valuesWithAnySearchedWord = new Set(searchedAtAll.map((row) => Number(row.gematria_value)));
const valuePagesNow = [...groupSize.entries()].filter(([, size]) => size >= MIN_SHARED_VALUE_WORDS);

const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%');

console.log(`words table:            ${rows.length} row(s)`);
console.log(`  survive the junk filter: ${publishable.length}`);
console.log('');
console.log(`Gate in force: search_count >= ${MIN_SEARCHES_FOR_INDEX} AND value group >= ${MIN_SHARED_VALUE_WORDS} words`);
console.log('');
console.log('/w/ word pages');
console.log(`  was  (search_count > 0):  ${searchedAtAll.length}`);
console.log(`  now:                      ${wordPagesNow.length}  (${pct(wordPagesNow.length, searchedAtAll.length)} of the old set)`);
console.log(`  plus featured words:      ${featuredPages}  (indexed regardless of the gate)`);
console.log('');
console.log('/v/ value pages');
console.log(`  was  (any searched word): ${valuesWithAnySearchedWord.size}`);
console.log(`  now:                      ${valuePagesNow.length}  (${pct(valuePagesNow.length, valuesWithAnySearchedWord.size)} of the old set)`);
console.log('');
console.log(`Total indexable generated URLs: ${wordPagesNow.length + featuredPages + valuePagesNow.length} (was ${searchedAtAll.length + valuesWithAnySearchedWord.size})`);

// The words that lose their page are the interesting part of the report: if
// real search terms are in here, the thresholds are set too high.
const dropped = searchedAtAll
  .filter((row) => !passesGate(row) && !getFeaturedWord(row.word))
  .sort((a, b) => Number(b.search_count) - Number(a.search_count));

if (dropped.length > 0) {
  console.log('');
  console.log(`Dropping out of the index, most-searched first (${dropped.length} total, showing up to 25):`);
  for (const row of dropped.slice(0, 25)) {
    const size = groupSize.get(Number(row.gematria_value)) || 0;
    const reason = Number(row.search_count || 0) < MIN_SEARCHES_FOR_INDEX
      ? `only ${row.search_count} search(es)`
      : `only ${size} word(s) share value ${row.gematria_value}`;
    console.log(`  ${JSON.stringify(row.word).padEnd(28)} ${reason}`);
  }
  console.log('');
  console.log('Anything here that reads like a term a person would search is a');
  console.log('signal the thresholds in netlify/functions/_words.mjs are too high.');
}
