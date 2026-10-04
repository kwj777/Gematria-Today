import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DEFAULT_FAQ_PAGE_SIZE,
  MAX_FAQ_PAGE_SIZE,
  loadPublishedFaqPage,
} from '../netlify/functions/public-faqs.mjs';

// A stand-in for the faqs table that honours the LIMIT and OFFSET the query
// sends, so the tests see exactly the rows Postgres would return.
function createFaqSql(count) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `faq-${index + 1}`,
    question: `Question ${index + 1}?`,
    answer: `Answer ${index + 1}.`,
    sort_order: index,
    is_published: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }));
  const calls = [];
  const sql = (strings, ...values) => {
    const query = strings.join('?');
    calls.push({ query, values });
    assert.match(query, /FROM faqs/);
    const [limit, offset] = values;
    return Promise.resolve(rows.slice(offset, offset + limit));
  };
  return { sql, calls };
}

test('a page says whether more published FAQs follow', async () => {
  const { sql } = createFaqSql(DEFAULT_FAQ_PAGE_SIZE + 5);
  const first = await loadPublishedFaqPage(sql, {});
  assert.equal(first.items.length, DEFAULT_FAQ_PAGE_SIZE);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextOffset, DEFAULT_FAQ_PAGE_SIZE);

  const second = await loadPublishedFaqPage(sql, { offset: String(first.nextOffset) });
  assert.equal(second.items.length, 5);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextOffset, null);
  assert.equal(second.items.at(-1).id, `faq-${DEFAULT_FAQ_PAGE_SIZE + 5}`);
});

test('an exact multiple of the page size does not report a phantom next page', async () => {
  const { sql } = createFaqSql(MAX_FAQ_PAGE_SIZE);
  const page = await loadPublishedFaqPage(sql, { limit: String(MAX_FAQ_PAGE_SIZE) });
  assert.equal(page.items.length, MAX_FAQ_PAGE_SIZE);
  assert.equal(page.hasMore, false);
});

test('the requested page size is clamped to the maximum', async () => {
  const { sql, calls } = createFaqSql(3);
  const page = await loadPublishedFaqPage(sql, { limit: '5000', offset: '-4' });
  assert.equal(page.limit, MAX_FAQ_PAGE_SIZE);
  assert.equal(page.offset, 0);
  // One extra row is read to learn whether another page exists.
  assert.deepEqual(calls[0].values, [MAX_FAQ_PAGE_SIZE + 1, 0]);
});

test('walking nextOffset reaches every published FAQ', async () => {
  const total = 237;
  const { sql } = createFaqSql(total);
  const seen = [];
  let offset = 0;
  for (let guard = 0; guard < 10; guard += 1) {
    const page = await loadPublishedFaqPage(sql, { limit: String(MAX_FAQ_PAGE_SIZE), offset: String(offset) });
    seen.push(...page.items.map((item) => item.id));
    if (!page.hasMore) break;
    offset = page.nextOffset;
  }
  assert.equal(seen.length, total);
  assert.equal(new Set(seen).size, total);
});

test('the FAQ page follows nextOffset instead of reading a single page', () => {
  const source = readFileSync(new URL('../page-scripts/faq-1.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\('\/api\/public-faqs'\)/, 'a bare fetch only ever returns the first page');
  assert.match(source, /\/api\/public-faqs\?limit=\$\{FAQ_PAGE_SIZE\}&offset=\$\{offset\}/);
  assert.match(source, /payload\.hasMore/);
  assert.match(source, /payload\.nextOffset/);
});
