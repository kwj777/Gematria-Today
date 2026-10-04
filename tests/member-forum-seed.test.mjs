import test from 'node:test';
import assert from 'node:assert/strict';

// ensureForumSchema runs for every member-forum and admin-forum request. It is
// memoized per module instance, so each cold start loads a fresh copy of
// member-forum.mjs to stand in for a new lambda instance.
let coldStartCount = 0;
async function coldStart(sql) {
  coldStartCount += 1;
  const { ensureForumSchema } = await import(`../netlify/functions/member-forum.mjs?cold-start=${coldStartCount}`);
  await ensureForumSchema(sql);
  return ensureForumSchema;
}

// forum_categories.slug is UNIQUE, as in ensureForumSchema. The fake applies
// the two ways a seed insert can be written -- ON CONFLICT (slug) DO UPDATE and
// ON CONFLICT DO NOTHING -- so the tests check what the seed does to rows the
// admin has edited, not only its SQL text.
function createFakeDatabase({ categories = [], settings = {} } = {}) {
  const db = {
    categories: new Map(categories.map((category) => [category.slug, { ...category }])),
    settings: new Map(Object.entries(settings)),
    calls: [],
  };

  db.sql = function sql(strings, ...values) {
    const query = strings.join('?');
    db.calls.push({ query, values });

    if (/INSERT INTO forum_categories/i.test(query)) {
      const [id, slug, name, description, accessTier, sortOrder] = values;
      const existing = db.categories.get(slug);
      if (/ON CONFLICT \(slug\)\s+DO UPDATE/i.test(query)) {
        db.categories.set(slug, { ...existing, id: existing?.id || id, slug, name, description, access_tier: accessTier, sort_order: sortOrder });
        return Promise.resolve([]);
      }
      if (/ON CONFLICT DO NOTHING/i.test(query)) {
        if (existing) return Promise.resolve([]);
        db.categories.set(slug, { id, slug, name, description, access_tier: accessTier, sort_order: sortOrder });
        return Promise.resolve(/RETURNING id/i.test(query) ? [{ id }] : []);
      }
      return Promise.reject(new Error(`Unexpected category insert: ${query}`));
    }

    if (/SELECT setting_key\s+FROM admin_settings/i.test(query)) {
      const [keys] = values;
      return Promise.resolve(keys.filter((key) => db.settings.has(key)).map((key) => ({ setting_key: key })));
    }

    if (/INSERT INTO admin_settings/i.test(query)) {
      const [key, value] = values;
      if (!db.settings.has(key)) db.settings.set(key, value);
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  };

  return db;
}

const categoryInserts = (db) => db.calls.filter((call) => /INSERT INTO forum_categories/i.test(call.query));

test('a fresh database gets the five default categories and a marker for each', async () => {
  const db = createFakeDatabase();
  await coldStart(db.sql);

  assert.deepEqual([...db.categories.keys()], ['member-lounge', 'member-questions', 'interpretations', 'premium-questions', 'show-and-tell']);
  assert.equal(db.categories.get('interpretations').access_tier, 'premium');
  for (const slug of db.categories.keys()) {
    assert.equal(db.settings.get(`seeded_forum_category:${slug}`), 'inserted');
  }
});

test('an admin edit to a default category survives the next cold start', async () => {
  // The production state before this change: all five defaults exist, the
  // admin has opened the premium Interpretations area to free members and
  // renamed the lounge, and no markers have been written yet.
  const db = createFakeDatabase({
    categories: [
      { id: 'c1', slug: 'member-lounge', name: 'The Lounge', access_tier: 'free', sort_order: 9 },
      { id: 'c2', slug: 'member-questions', name: 'Member Questions', access_tier: 'free', sort_order: 2 },
      { id: 'c3', slug: 'interpretations', name: 'Interpretations', access_tier: 'free', sort_order: 101 },
      { id: 'c4', slug: 'premium-questions', name: 'Premium Questions', access_tier: 'premium', sort_order: 102 },
      { id: 'c5', slug: 'show-and-tell', name: 'Show & Tell', access_tier: 'premium', sort_order: 103 },
    ],
  });
  await coldStart(db.sql);

  assert.equal(db.categories.get('interpretations').access_tier, 'free');
  assert.equal(db.categories.get('member-lounge').name, 'The Lounge');
  assert.equal(db.categories.get('member-lounge').sort_order, 9);
  assert.equal(db.settings.get('seeded_forum_category:interpretations'), 'skipped_existing');
  for (const call of categoryInserts(db)) {
    assert.doesNotMatch(call.query, /DO UPDATE/i, 'the seed must never overwrite a category');
  }

  // Once every marker is written, later cold starts do not touch the table.
  const later = createFakeDatabase({ categories: [...db.categories.values()], settings: Object.fromEntries(db.settings) });
  await coldStart(later.sql);
  assert.equal(categoryInserts(later).length, 0);
});

test('a default category the admin deleted is not brought back', async () => {
  const db = createFakeDatabase();
  await coldStart(db.sql);
  db.categories.delete('show-and-tell');

  const next = createFakeDatabase({ categories: [...db.categories.values()], settings: Object.fromEntries(db.settings) });
  await coldStart(next.sql);
  assert.equal(next.categories.has('show-and-tell'), false);
});

test('the schema and seed run once per instance, not on every forum request', async () => {
  const db = createFakeDatabase();
  const ensureForumSchema = await coldStart(db.sql);
  const callsAfterFirstRequest = db.calls.length;

  await ensureForumSchema(db.sql);
  await ensureForumSchema(db.sql);
  assert.equal(db.calls.length, callsAfterFirstRequest);
});

test('a failed schema run is retried by the next request', async () => {
  const db = createFakeDatabase();
  let failNext = true;
  const flaky = (strings, ...values) => {
    if (failNext) {
      failNext = false;
      return Promise.reject(new Error('connection reset'));
    }
    return db.sql(strings, ...values);
  };

  coldStartCount += 1;
  const { ensureForumSchema } = await import(`../netlify/functions/member-forum.mjs?cold-start=${coldStartCount}`);
  await assert.rejects(ensureForumSchema(flaky), /connection reset/);
  await ensureForumSchema(flaky);
  assert.equal(db.categories.size, 5);
});
