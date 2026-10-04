import test from 'node:test';
import assert from 'node:assert/strict';

// syncBootstrapAdminUser seeds the starter blog posts on the cold start of
// every function that calls it (public-posts, blog-rss, sitemap-xml, admin and
// member login, ...). It is memoized per module instance, so each test loads a
// fresh copy of _admin.mjs to stand in for a new lambda instance.
let coldStartCount = 0;
async function coldStart(sql) {
  coldStartCount += 1;
  const { syncBootstrapAdminUser } = await import(`../netlify/functions/_admin.mjs?cold-start=${coldStartCount}`);
  return syncBootstrapAdminUser(sql);
}

const SEEDED_ID = 'post-digital-roots-in-gematria';
const SEEDED_SLUG = 'digital-roots-in-gematria';

function uniqueViolation(constraint) {
  const error = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  error.code = '23505';
  return error;
}

// A small in-memory stand-in for the posts and admin_settings tables. It
// applies Postgres' conflict rules for the two ways a seed insert can be
// written -- ON CONFLICT (id) DO UPDATE and ON CONFLICT DO NOTHING -- so the
// tests check what the seed does to existing rows, not just its SQL text.
// posts.id is the primary key and posts.slug is UNIQUE, as in ensureAdminSchema.
function createFakeDatabase({ posts = [], settings = {}, postInsertError = null } = {}) {
  const db = {
    posts: new Map(posts.map((post) => [post.id, { ...post }])),
    settings: new Map(Object.entries(settings)),
    postInsertError,
    calls: [],
  };

  db.sql = function sql(strings, ...values) {
    const query = strings.join('?');
    db.calls.push({ query, values });

    if (/INSERT INTO posts/i.test(query)) {
      if (db.postInsertError) {
        return Promise.reject(db.postInsertError);
      }
      const [id, title, slug] = values;
      const status = values[10];
      const existing = db.posts.get(id);
      const slugOwner = [...db.posts.values()].find((post) => post.slug === slug && post.id !== id);

      if (/ON CONFLICT \(id\)\s+DO UPDATE/i.test(query)) {
        if (slugOwner) {
          return Promise.reject(uniqueViolation('posts_slug_key'));
        }
        db.posts.set(id, { ...existing, id, title, slug, status });
        return Promise.resolve([]);
      }

      if (/ON CONFLICT DO NOTHING/i.test(query)) {
        if (existing || slugOwner) {
          return Promise.resolve([]);
        }
        db.posts.set(id, { id, title, slug, status });
        return Promise.resolve(/RETURNING id/i.test(query) ? [{ id }] : []);
      }

      return Promise.reject(new Error(`Unexpected posts insert: ${query}`));
    }

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

    // The super_admin UPDATE (and the owner insert, when it is configured).
    return Promise.resolve([]);
  };

  return db;
}

function postInsertCalls(db) {
  return db.calls.filter(({ query }) => /INSERT INTO posts/i.test(query));
}

test('the first cold start inserts each seeded post once and records that it did', async () => {
  const db = createFakeDatabase();

  await coldStart(db.sql);

  assert.ok(db.posts.size > 0);
  assert.deepEqual(db.posts.get(SEEDED_ID), {
    id: SEEDED_ID,
    title: 'Digital Roots and Their Significance in Gematria',
    slug: SEEDED_SLUG,
    status: 'published',
  });
  for (const id of db.posts.keys()) {
    assert.equal(db.settings.get(`seeded_post:${id}`), 'inserted');
  }

  db.calls.length = 0;
  await coldStart(db.sql);

  assert.equal(postInsertCalls(db).length, 0, 'an already-seeded post is not written again');
});

test('a later cold start keeps an admin edit or unpublish of a seeded post', async () => {
  const db = createFakeDatabase();
  await coldStart(db.sql);

  db.posts.set(SEEDED_ID, { id: SEEDED_ID, title: 'Admin edited', slug: 'digital-roots-v2', status: 'archived' });
  await coldStart(db.sql);

  assert.deepEqual(db.posts.get(SEEDED_ID), {
    id: SEEDED_ID,
    title: 'Admin edited',
    slug: 'digital-roots-v2',
    status: 'archived',
  });
});

test('a later cold start does not bring back a seeded post the admin deleted', async () => {
  const db = createFakeDatabase();
  await coldStart(db.sql);

  db.posts.delete(SEEDED_ID);
  await coldStart(db.sql);

  assert.equal(db.posts.has(SEEDED_ID), false);
});

test('an existing seeded post is left as the admin had it when its marker is first recorded', async () => {
  // The state of a database seeded by the old always-upsert code: the posts
  // exist but no markers do yet.
  const db = createFakeDatabase({
    posts: [{ id: SEEDED_ID, title: 'Admin edited', slug: SEEDED_SLUG, status: 'draft' }],
  });

  await coldStart(db.sql);

  assert.deepEqual(db.posts.get(SEEDED_ID), { id: SEEDED_ID, title: 'Admin edited', slug: SEEDED_SLUG, status: 'draft' });
  assert.equal(db.settings.get(`seeded_post:${SEEDED_ID}`), 'skipped_existing');
});

test('a seeded slug the admin gave to another post does not break the bootstrap sync', async () => {
  const renamed = { id: SEEDED_ID, title: 'Admin edited', slug: 'digital-roots-v2', status: 'published' };
  const reusesSlug = { id: 'post-new', title: 'Digital Roots, Revisited', slug: SEEDED_SLUG, status: 'published' };
  const db = createFakeDatabase({ posts: [renamed, reusesSlug] });

  await assert.doesNotReject(coldStart(db.sql));

  assert.deepEqual(db.posts.get(SEEDED_ID), renamed);
  assert.deepEqual(db.posts.get('post-new'), reusesSlug);
});

test('a deleted seeded post whose slug was reused does not break the bootstrap sync', async () => {
  const reusesSlug = { id: 'post-new', title: 'Digital Roots and Their Significance in Gematria', slug: SEEDED_SLUG, status: 'published' };
  const db = createFakeDatabase({ posts: [reusesSlug] });

  await assert.doesNotReject(coldStart(db.sql));

  assert.equal(db.posts.has(SEEDED_ID), false);
  assert.deepEqual(db.posts.get('post-new'), reusesSlug);
  assert.equal(db.settings.get(`seeded_post:${SEEDED_ID}`), 'skipped_existing');
});

test('a failed post seed is logged, does not fail the admin sync, and is retried on the next cold start', async (t) => {
  const consoleError = t.mock.method(console, 'error', () => {});
  const foreignKeyError = new Error('insert or update on table "posts" violates foreign key constraint "posts_created_by_fkey"');
  const db = createFakeDatabase({ postInsertError: foreignKeyError });

  await assert.doesNotReject(coldStart(db.sql));

  assert.ok(db.calls.some(({ query }) => /SET role = 'super_admin'/i.test(query)), 'the super admin sync still runs');
  assert.equal(consoleError.mock.callCount(), 1);
  assert.equal(consoleError.mock.calls[0].arguments[1], foreignKeyError);
  assert.equal([...db.settings.keys()].some((key) => key.startsWith('seeded_post:')), false);

  db.postInsertError = null;
  await coldStart(db.sql);

  assert.equal(db.posts.get(SEEDED_ID)?.status, 'published');
  assert.equal(db.settings.get(`seeded_post:${SEEDED_ID}`), 'inserted');
});
