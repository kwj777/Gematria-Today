import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONTENT_CORRECTION_MARKER_PREFIX,
  SEEDED_CONTENT_CORRECTIONS,
  applySeededContentCorrectionsOnce,
} from '../netlify/functions/_seeded-content-corrections.mjs';

// The Cipher Atlas posts and the SiteSeeker FAQs reach production through the
// psql seed files in sql/, so fixing the seed files alone never corrects a live
// row. _seeded-content-corrections.mjs carries each fix as a passage-level edit
// that runs once per database. These tests pin both halves: that the edits turn
// a database seeded from the old files into exactly what the corrected files
// seed now, and that they leave an admin's own edits alone.

const ATLAS_SEED = readFileSync(new URL('../sql/seed_english_gematria_cipher_atlas_series.sql', import.meta.url), 'utf8');
const ADMIN_SCHEMA = readFileSync(new URL('../sql/admin_schema.sql', import.meta.url), 'utf8');
const FAQ_SEED = readFileSync(new URL('../sql/seed_faqs.sql', import.meta.url), 'utf8');

const unescapeSql = (literal) => literal.replaceAll("''", "'");
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

// Each posts seed block is `INSERT INTO posts (...) VALUES ('id', 'title',
// 'slug', 'tag', 'summary', 'body', ...)`; the quoted literals come in column
// order, so the first, fifth and sixth are the id, summary and body.
function seededPosts(sqlText) {
  const posts = new Map();
  for (const block of sqlText.split('INSERT INTO posts (').slice(1)) {
    const values = block.slice(block.indexOf('VALUES ('), block.indexOf('ON CONFLICT'));
    const literals = [...values.matchAll(/'((?:[^']|'')*)'/g)].map((match) => unescapeSql(match[1]));
    posts.set(literals[0], { summary: literals[4], body: literals[5] });
  }
  return posts;
}

function seededFaqs(sqlText) {
  const faqs = new Map();
  for (const match of sqlText.matchAll(/\(\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',/g)) {
    faqs.set(unescapeSql(match[1]), { question: unescapeSql(match[2]), answer: unescapeSql(match[3]) });
  }
  return faqs;
}

const CORRECTED_ROWS = { posts: seededPosts(ATLAS_SEED), faqs: seededFaqs(FAQ_SEED) };

// What the seed files produced before the corrections: undo each edit, last
// first. Every corrected passage must appear exactly once for this to be exact.
function originalRows() {
  const rows = {
    posts: new Map([...CORRECTED_ROWS.posts].map(([id, row]) => [id, { ...row }])),
    faqs: new Map([...CORRECTED_ROWS.faqs].map(([id, row]) => [id, { ...row }])),
  };
  for (const correction of SEEDED_CONTENT_CORRECTIONS) {
    const row = rows[correction.table].get(correction.rowId);
    for (const edit of [...correction.edits].reverse()) {
      assert.equal(occurrences(row[edit.column], edit.to), 1, `${correction.id}: corrected text should appear once`);
      row[edit.column] = row[edit.column].replace(edit.to, edit.from);
    }
  }
  return rows;
}

function cloneRows(rows) {
  return {
    posts: new Map([...rows.posts].map(([id, row]) => [id, { ...row }])),
    faqs: new Map([...rows.faqs].map(([id, row]) => [id, { ...row }])),
  };
}

// An in-memory posts/faqs/admin_settings stand-in that applies the UPDATE the
// way Postgres would: REPLACE every occurrence, but only while STRPOS finds the
// seeded passage and does not find the corrected one.
function createFakeDatabase({ rows = originalRows(), settings = {}, updateError = null } = {}) {
  const db = { rows, settings: new Map(Object.entries(settings)), calls: [], updateError };

  db.sql = function sql(strings, ...values) {
    const query = strings.join('?');
    db.calls.push({ query, values });

    if (/SELECT setting_key\s+FROM admin_settings/i.test(query)) {
      const [keys] = values;
      return Promise.resolve(keys.filter((key) => db.settings.has(key)).map((key) => ({ setting_key: key })));
    }

    if (/INSERT INTO admin_settings/i.test(query)) {
      const [key, value] = values;
      if (!db.settings.has(key)) {
        db.settings.set(key, value);
      }
      return Promise.resolve([]);
    }

    const update = query.match(/UPDATE (posts|faqs)\s+SET (\w+) = REPLACE\(\2, \?::text, \?::text\)/i);
    if (update) {
      if (db.updateError) {
        return Promise.reject(db.updateError);
      }
      const [, table, column] = update;
      assert.match(query, new RegExp(`STRPOS\\(${column}, \\?::text\\) > 0`), 'the edit must require the seeded passage');
      assert.match(query, new RegExp(`STRPOS\\(${column}, \\?::text\\) = 0`), 'the edit must skip a row that already has the correction');
      const [from, to, rowId] = values;
      const row = db.rows[table].get(rowId);
      if (!row || !row[column].includes(from) || row[column].includes(to)) {
        return Promise.resolve([]);
      }
      row[column] = row[column].split(from).join(to);
      return Promise.resolve([{ id: rowId }]);
    }

    // The bootstrap admin upsert, the super_admin UPDATE, and the seeded-post
    // inserts when this runs through syncBootstrapAdminUser.
    return Promise.resolve([]);
  };

  return db;
}

function updateCalls(db) {
  return db.calls.filter(({ query }) => /UPDATE (posts|faqs)\s+SET/i.test(query));
}

function correctionFor(rowId) {
  const correction = SEEDED_CONTENT_CORRECTIONS.find((entry) => entry.rowId === rowId);
  assert.ok(correction, `no correction for ${rowId}`);
  return correction;
}

// ---------- the corrections and the seed files agree ----------

test('every correction targets a seeded row, with unique ids and a passage that is gone from the seed files', () => {
  const ids = SEEDED_CONTENT_CORRECTIONS.map((correction) => correction.id);
  assert.equal(new Set(ids).size, ids.length, 'correction ids must be unique; they key the markers');

  for (const correction of SEEDED_CONTENT_CORRECTIONS) {
    const row = CORRECTED_ROWS[correction.table].get(correction.rowId);
    assert.ok(row, `${correction.id} targets ${correction.table}.${correction.rowId}, which no seed file creates`);
    for (const edit of correction.edits) {
      assert.ok(Object.hasOwn(row, edit.column), `${correction.id}: ${correction.table} has no ${edit.column} column here`);
      assert.equal(occurrences(row[edit.column], edit.to), 1, `${correction.id}: the seed file is missing the corrected text`);
      if (edit.note) {
        assert.ok(edit.to.includes(edit.from), `${correction.id}: a note is inserted next to its anchor`);
      } else {
        assert.ok(!edit.to.includes(edit.from), `${correction.id}: a passage edit must remove the seeded passage`);
        assert.equal(occurrences(row[edit.column], edit.from), 0, `${correction.id}: the seed file still has the seeded passage`);
      }
    }
    const notes = correction.edits.filter((edit) => edit.note);
    assert.ok(notes.length <= 1);
    if (notes.length) {
      assert.equal(correction.edits.at(-1), notes[0], `${correction.id}: the note must come after the passages it reports`);
    }
  }
});

test('admin_schema.sql seeds the same corrected atlas posts as the standalone seed file', () => {
  const fromAdminSchema = seededPosts(ADMIN_SCHEMA);
  for (const correction of SEEDED_CONTENT_CORRECTIONS.filter((entry) => entry.table === 'posts')) {
    assert.deepEqual(fromAdminSchema.get(correction.rowId), CORRECTED_ROWS.posts.get(correction.rowId), correction.rowId);
  }
});

test('a database seeded before the fix ends up with exactly what the corrected seed files produce', async () => {
  const db = createFakeDatabase();

  await applySeededContentCorrectionsOnce(db.sql);

  for (const correction of SEEDED_CONTENT_CORRECTIONS) {
    assert.deepEqual(db.rows[correction.table].get(correction.rowId), CORRECTED_ROWS[correction.table].get(correction.rowId), correction.id);
    assert.equal(db.settings.get(`${CONTENT_CORRECTION_MARKER_PREFIX}${correction.id}`), 'corrected');
  }
});

// ---------- an admin's edits survive ----------

test('a passage the admin already rewrote is left alone, and the rest of the post is still corrected', async () => {
  const correction = correctionFor('post-english-gematria-cipher-atlas-reverse-full-reduction');
  const [rewritten, ...others] = correction.edits.filter((edit) => !edit.note);
  const rows = originalRows();
  const post = rows.posts.get(correction.rowId);
  post.body = post.body.replace(rewritten.from, 'The admin fixed this sentence by hand.');
  const db = createFakeDatabase({ rows });

  await applySeededContentCorrectionsOnce(db.sql);

  const body = db.rows.posts.get(correction.rowId).body;
  assert.ok(body.includes('The admin fixed this sentence by hand.'));
  assert.ok(!body.includes(rewritten.to));
  for (const edit of others) {
    assert.ok(body.includes(edit.to));
  }
  assert.ok(body.includes('<em>Correction (October 2026):</em>'));
});

test('an edit elsewhere in the row is kept while the seeded passage is corrected', async () => {
  const correction = correctionFor('seed-faq-data-retention-after-cancellation');
  const rows = originalRows();
  const faq = rows.faqs.get(correction.rowId);
  faq.answer = `Updated by the admin. ${faq.answer}`;
  faq.question = 'What happens to my data after I cancel?';
  const db = createFakeDatabase({ rows });

  await applySeededContentCorrectionsOnce(db.sql);

  const corrected = db.rows.faqs.get(correction.rowId);
  assert.equal(corrected.question, 'What happens to my data after I cancel?');
  assert.ok(corrected.answer.startsWith('Updated by the admin. '));
  assert.ok(corrected.answer.includes('There is no self-serve account deletion yet'));
  assert.ok(!corrected.answer.includes('If you fully delete your account'));
});

test('a post the admin rewrote throughout gets no edits and no correction note', async () => {
  const correction = correctionFor('post-english-gematria-cipher-atlas-baconian');
  const rows = originalRows();
  const rewritten = {
    summary: 'Admin summary.',
    body: '<p>The admin rewrote this post.</p><hr><p class="post-series-nav"><strong>Series — English Gematria Cipher Atlas (Post 7 of 8):</strong></p>',
  };
  rows.posts.set(correction.rowId, { ...rewritten });
  const db = createFakeDatabase({ rows });

  await applySeededContentCorrectionsOnce(db.sql);

  assert.deepEqual(db.rows.posts.get(correction.rowId), rewritten, 'the series nav is still there, but no passage was corrected, so no note');
  assert.equal(db.settings.get(`${CONTENT_CORRECTION_MARKER_PREFIX}${correction.id}`), 'no_match');
});

test('a seeded row the admin deleted is not brought back', async () => {
  const correction = correctionFor('seed-faq-guest-forum-access');
  const rows = originalRows();
  rows.faqs.delete(correction.rowId);
  const db = createFakeDatabase({ rows });

  await assert.doesNotReject(applySeededContentCorrectionsOnce(db.sql));

  assert.equal(db.rows.faqs.has(correction.rowId), false);
  assert.equal(db.settings.get(`${CONTENT_CORRECTION_MARKER_PREFIX}${correction.id}`), 'no_match');
});

test('a correction runs once: a passage the admin later puts back is not corrected again', async () => {
  const db = createFakeDatabase();
  await applySeededContentCorrectionsOnce(db.sql);

  const correction = correctionFor('seed-faq-premium-vs-free');
  const [edit] = correction.edits;
  db.rows.faqs.get(correction.rowId).answer = edit.from;
  db.calls.length = 0;
  await applySeededContentCorrectionsOnce(db.sql);

  assert.equal(updateCalls(db).length, 0, 'every correction is already marked');
  assert.equal(db.rows.faqs.get(correction.rowId).answer, edit.from);
});

test('two cold starts racing past the markers do not insert the correction note twice', async () => {
  const db = createFakeDatabase();
  await applySeededContentCorrectionsOnce(db.sql);
  db.settings.clear();

  await applySeededContentCorrectionsOnce(db.sql);

  for (const correction of SEEDED_CONTENT_CORRECTIONS) {
    assert.deepEqual(db.rows[correction.table].get(correction.rowId), CORRECTED_ROWS[correction.table].get(correction.rowId), correction.id);
  }
});

// ---------- wiring into the cold-start sync ----------

let coldStartCount = 0;
async function coldStart(sql) {
  coldStartCount += 1;
  const { syncBootstrapAdminUser } = await import(`../netlify/functions/_admin.mjs?content-corrections=${coldStartCount}`);
  return syncBootstrapAdminUser(sql);
}

test('the bootstrap sync applies the corrections on cold start', async () => {
  const db = createFakeDatabase();

  await coldStart(db.sql);

  const correction = correctionFor('post-english-gematria-cipher-atlas-choosing-and-combining');
  assert.deepEqual(db.rows.posts.get(correction.rowId), CORRECTED_ROWS.posts.get(correction.rowId));
});

test('a failed correction is logged, does not fail the sync, and is retried on the next cold start', async (t) => {
  const consoleError = t.mock.method(console, 'error', () => {});
  const connectionError = new Error('Connection terminated unexpectedly');
  const db = createFakeDatabase({ updateError: connectionError });

  await assert.doesNotReject(coldStart(db.sql));

  assert.ok(db.calls.some(({ query }) => /INSERT INTO users/i.test(query)), 'the seeded admin user is still synced');
  assert.equal(consoleError.mock.callCount(), 1);
  assert.equal(consoleError.mock.calls[0].arguments[1], connectionError);
  assert.equal([...db.settings.keys()].some((key) => key.startsWith(CONTENT_CORRECTION_MARKER_PREFIX)), false);

  db.updateError = null;
  await coldStart(db.sql);

  for (const correction of SEEDED_CONTENT_CORRECTIONS) {
    assert.deepEqual(db.rows[correction.table].get(correction.rowId), CORRECTED_ROWS[correction.table].get(correction.rowId), correction.id);
  }
});
