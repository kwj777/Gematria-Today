import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { baseRows, installFakeNeon, MEMBER_COOKIE } from './helpers/fake-neon.mjs';
import englishGematriaRoute, { englishGematria, extractKindFromEvent, isNameLookup, storesLookup } from '../netlify/functions/englishGematria.mjs';
import wordPageRoute, { renderValuePage, renderWordPage } from '../netlify/functions/word-page.mjs';
import { pageLocs } from '../netlify/functions/sitemap-words-xml.mjs';
import wordnikDefinitionRoute from '../netlify/functions/wordnikDefinition.mjs';
import wordnikRelatedWordsRoute from '../netlify/functions/wordnikRelatedWords.mjs';
import {
  isIndexableWord,
  isPublishableWord,
  isStorableWord,
  MAX_STORED_WORD_LENGTH,
  STORABLE_WORD_PATTERN,
} from '../netlify/functions/_words.mjs';

// Every calculator lookup that passed the old storage rule -- any 64-character
// string starting with a letter -- was written to the words table for good and
// then listed, linked, on public /v/ and /w/ pages. That included names typed
// into the name calculator and attacker-chosen phrases.

const PRIOR_FETCH = globalThis.fetch;
const ENV_KEYS = ['DATABASE_URL', 'WORDNIK_BASE_URL', 'WORDNIK_API_KEY'];
const PRIOR_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

test.afterEach(() => {
  globalThis.fetch = PRIOR_FETCH;
});

test.after(() => {
  for (const [key, value] of Object.entries(PRIOR_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function lookup(word, { intent = null, kind = null, cookie = null } = {}) {
  const url = new URL('https://gematria.today/api/englishGematria');
  url.searchParams.set('word', word);
  if (intent) url.searchParams.set('intent', intent);
  if (kind) url.searchParams.set('kind', kind);
  const headers = { 'x-forwarded-for': '203.0.113.7' };
  if (cookie) headers.cookie = cookie;
  return englishGematriaRoute(new Request(url, { headers }));
}

const SPAM = [
  'Buy cheap pills at rxshop dot com',
  'Call 555 0100 for loans',
  'a 2 5 0 62 4',
  'my ex john smith',
  'rxshop.com',
  'Catch-22',
  'hello world, this is me',
];

// ---------------------------------------------------------------------------
// the gate
// ---------------------------------------------------------------------------

test('dictionary-shaped words and short phrases are still stored', () => {
  for (const word of ['light', 'A per se', 'A-one', 'Abyssinian cat', 'Academy Award', 'ALGOL', "O'Brien", 'O’Brien', 'dull-pated', 'café']) {
    assert.equal(isStorableWord(word), true, `${JSON.stringify(word)} should be storable`);
  }
});

test('free text, digits and long phrases are not stored', () => {
  for (const word of [...SPAM, 'a b c d', 'x'.repeat(MAX_STORED_WORD_LENGTH + 1), 'light  house', '-ol', '*', '', '   ']) {
    assert.equal(isStorableWord(word), false, `${JSON.stringify(word)} must not be storable`);
  }
});

test('the SQL pattern is the same rule the JavaScript applies', () => {
  // sitemap-words-xml.mjs runs STORABLE_WORD_PATTERN inside Postgres. It is
  // built only from literal characters, bracket ranges, groups and bounds,
  // which both regex engines read the same way.
  assert.ok(!/\\/.test(STORABLE_WORD_PATTERN), 'no escapes, which the two engines read differently');
  const sqlRule = new RegExp(STORABLE_WORD_PATTERN);
  for (const word of ['light', 'A per se', "O'Brien", 'café', ...SPAM]) {
    assert.equal(sqlRule.test(word) && word.length <= MAX_STORED_WORD_LENGTH, isStorableWord(word), word);
  }
});

test('a free-text phrase is calculated and returned but never stored', async () => {
  const { queries } = installFakeNeon((query) => baseRows(query));
  const response = await lookup('Buy cheap pills at rxshop dot com');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.gematria.total, englishGematria('Buy cheap pills at rxshop dot com'));
  assert.ok(!queries.some(({ query }) => /INSERT INTO words/.test(query)), 'the phrase must not be inserted');
});

test('a dictionary word looked up in the calculator is still stored', async () => {
  const { queries } = installFakeNeon((query) => baseRows(query) ?? (/INSERT INTO words/.test(query)
    ? [{ word: 'light', gematria_value: 336, digital_root: 3, is_base_root: false, search_count: 1, source: 'calculated' }]
    : []));
  const response = await lookup('light');
  assert.equal(response.status, 200);
  const insert = queries.find(({ query }) => /INSERT INTO words/.test(query));
  assert.ok(insert, 'a real word still joins the table');
  assert.ok(insert.params.includes('light'));
});

// ---------------------------------------------------------------------------
// the name calculator
// ---------------------------------------------------------------------------

test('kind=name is never recorded against the words table, whatever the intent', () => {
  assert.equal(isNameLookup('name'), true);
  assert.equal(isNameLookup(' NAME '), true);
  assert.equal(isNameLookup(null), false);
  assert.equal(storesLookup(null, 'name'), false, 'a typed name is not stored');
  assert.equal(storesLookup('view', 'name'), false);
  assert.equal(storesLookup('view', null), false);
  assert.equal(storesLookup(null, null), true, 'an ordinary calculator lookup still stores');
  assert.equal(storesLookup('search', null), true);
  assert.equal(extractKindFromEvent({ queryStringParameters: { kind: 'name' } }), 'name');
  assert.equal(extractKindFromEvent({ rawUrl: 'https://gematria.today/api/englishGematria?word=x&kind=name' }), 'name');
  assert.equal(extractKindFromEvent(null), null);
});

test('a name lookup neither adds a row, moves search_count, nor is kept in the cache or audit log', async () => {
  const { queries } = installFakeNeon((query) => baseRows(query));
  const response = await lookup('Maria Lopez', { kind: 'name' });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.gematria.total, englishGematria('Maria Lopez'));

  assert.ok(!queries.some(({ query }) => /INSERT INTO words/.test(query)), 'no row for the name');
  assert.ok(!queries.some(({ query }) => /UPDATE words/.test(query)), 'no demand recorded for the name');
  assert.ok(!queries.some(({ query }) => /INSERT INTO function_response_cache/.test(query)), 'not even in the shared response cache');
  const audit = queries.find(({ query }) => /INSERT INTO request_audit_log/.test(query));
  assert.ok(audit, 'the request itself is still logged');
  assert.ok(!JSON.stringify(audit.params).toLowerCase().includes('maria'), 'the name must not be logged');
});

test('a signed-in member still gets lookup credit for a name, but no contribution', async () => {
  const { queries } = installFakeNeon((query) => baseRows(query) ?? (/INSERT INTO member_search_stats/.test(query)
    ? [{ searches_total: 1, gematria_searches_total: 0, words_contributed: 0, base_root_finds: 0 }]
    : []));
  const response = await lookup('Maria Lopez', { kind: 'name', cookie: MEMBER_COOKIE });
  assert.equal(response.status, 200);
  const stats = queries.find(({ query }) => /INSERT INTO member_search_stats/.test(query));
  assert.ok(stats, 'the lookup is credited');
  const [, searches, , contributed] = stats.params.map(String);
  assert.equal(searches, '1');
  assert.equal(contributed, '0');
});

test('a name filled in from a shared link is not credited and not recorded either', async () => {
  const { queries } = installFakeNeon((query) => baseRows(query) ?? (/INSERT INTO member_search_stats/.test(query)
    ? [{ searches_total: 1, gematria_searches_total: 0, words_contributed: 0, base_root_finds: 0 }]
    : []));
  const response = await lookup('Maria Lopez', { kind: 'name', intent: 'view', cookie: MEMBER_COOKIE });
  assert.equal(response.status, 200);
  assert.ok(!queries.some(({ query }) => /INSERT INTO member_search_stats|INSERT INTO words|UPDATE words|INSERT INTO function_response_cache/.test(query)));
  const writes = queries.filter(({ query }) => /^\s*(?:INSERT|UPDATE|WITH)\b/i.test(query));
  assert.ok(!JSON.stringify(writes.map(({ params }) => params)).toLowerCase().includes('maria'), 'the name is not written anywhere');
});

test('the name calculator marks every lookup as a name', () => {
  const source = read('../page-scripts/name-calculator-1.js');
  assert.match(source, /new URLSearchParams\(\{ word, kind: 'name' \}\)/);
  // Names filled in from the URL still go as intent=view (no credit either).
  assert.match(source, /if \(!countAsSearch\) searchParams\.set\('intent', 'view'\)/);
  // The definition probe runs for every visitor, signed in or not; the
  // definition link and the members' related-word lookup carry the name too.
  assert.match(source, /wordnikDefinition\?word=\$\{encodeURIComponent\(normalizedWord\)\}&kind=name/);
  assert.match(source, /new URLSearchParams\(\{ word, kind: 'name', returnTo \}\)/);
  assert.match(source, /new URLSearchParams\(\{ word, limit: String\(limit\), kind: 'name' \}\)/);
});

// ---------------------------------------------------------------------------
// the name calculator's definition and related-word requests
// ---------------------------------------------------------------------------

// Each result card asks wordnikDefinition whether the name has a definition,
// and a signed-in member's card asks wordnikRelatedWords for its related
// words. Both used to keep the name in the shared response cache and write it
// to the audit log whenever Wordnik knew it -- which it does for Maria, John,
// Rose and most common first names.

function installWordnik(respond, wordnikBody) {
  process.env.WORDNIK_BASE_URL = 'https://api.wordnik.test/v4/word.json/';
  process.env.WORDNIK_API_KEY = 'test-key';
  return installFakeNeon(respond, { otherFetch: async () => Response.json(wordnikBody) });
}

const MARIA_DEFINITIONS = [{ word: 'maria', text: 'A dark sea on the Moon.', partOfSpeech: 'noun' }];

function requestDefinition(query, { html = false } = {}) {
  return wordnikDefinitionRoute(new Request(`https://gematria.today/definition?${query}`, {
    headers: { accept: html ? 'text/html' : 'application/json', 'x-forwarded-for': '203.0.113.21' },
  }));
}

function assertNameNotKept(queries, name) {
  assert.ok(!queries.some(({ query }) => /INSERT INTO function_response_cache/.test(query)), 'not kept in the shared response cache');
  const audit = queries.find(({ query }) => /INSERT INTO request_audit_log/.test(query));
  assert.ok(audit, 'the request itself is still logged');
  assert.ok(!JSON.stringify(audit.params).toLowerCase().includes(name), 'the name must not be logged');
}

test('a name\'s definition, probed or opened, is neither cached nor logged by name', async () => {
  for (const html of [false, true]) {
    const { queries } = installWordnik((query) => baseRows(query), MARIA_DEFINITIONS);
    const response = await requestDefinition('word=Maria&kind=name&returnTo=%2Fname-calculator.html', { html });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /A dark sea on the Moon/, 'the definition is still shown');
    if (html) assert.match(body, /data-canonical-path="\/definition\?word=Maria&amp;kind=name"/, 'a reload stays a name lookup');
    assertNameNotKept(queries, 'maria');
  }
});

test('an ordinary definition lookup is still cached and logged with its word', async () => {
  const { queries } = installWordnik((query) => baseRows(query), [{ word: 'light', text: 'Illumination.' }]);
  const response = await requestDefinition('word=light');
  assert.equal(response.status, 200);
  assert.ok(queries.some(({ query }) => /INSERT INTO function_response_cache/.test(query)));
  const audit = queries.find(({ query }) => /INSERT INTO request_audit_log/.test(query));
  assert.ok(JSON.stringify(audit.params).includes('light'));
});

function memberRows(query) {
  if (/FROM users\s+WHERE id/.test(query)) {
    return [{ id: 'member-1', username: 'member', email: 'member@example.test', membership_level: 'free', status: 'active', email_verified: true }];
  }
  if (/FROM member_profiles/.test(query)) return [{ user_id: 'member-1' }];
  return baseRows(query);
}

function requestRelated(query) {
  return wordnikRelatedWordsRoute(new Request(`https://gematria.today/api/wordnikRelatedWords?${query}`, {
    headers: { cookie: MEMBER_COOKIE, 'x-forwarded-for': '203.0.113.22' },
  }));
}

test('a name\'s related words are neither cached nor logged by name', async () => {
  const { queries } = installWordnik(memberRows, [{ relationshipType: 'synonym', words: ['mary'] }]);
  const response = await requestRelated('word=maria&limit=9&kind=name');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, [{ relationshipType: 'synonym', words: ['mary'] }]);
  assertNameNotKept(queries, 'maria');
});

test('an ordinary related-words lookup is still cached and logged with its word', async () => {
  const { queries } = installWordnik(memberRows, [{ relationshipType: 'synonym', words: ['lamp'] }]);
  const response = await requestRelated('word=light&limit=9');
  assert.equal(response.status, 200);
  assert.ok(queries.some(({ query }) => /INSERT INTO function_response_cache/.test(query)));
  const audit = queries.find(({ query }) => /INSERT INTO request_audit_log/.test(query));
  assert.ok(JSON.stringify(audit.params).includes('light'));
});

// ---------------------------------------------------------------------------
// rows stored under the old rule
// ---------------------------------------------------------------------------

const LEGIT_336 = ['light', 'foot', 'belly', 'iron', 'paper'].map((word) => ({ word, search_count: 4 }));

test('legacy rows that fail the gate stay in the table but are not published', () => {
  for (const word of SPAM) {
    assert.equal(isPublishableWord(word), false, `${JSON.stringify(word)} must not be published`);
  }
  // Still renderable, so an old link lands on a page rather than an error.
  assert.equal(isIndexableWord('my ex john smith'), true);

  const html = renderValuePage(336, [...LEGIT_336, { word: 'my ex john smith', search_count: 9 }]);
  assert.ok(!html.includes('my ex john smith'), 'a value page must not list it');
  assert.match(html, /5 words share this value/);
  assert.ok(!renderWordPage('light', 336, [{ word: 'Call 555 0100 for loans', search_count: 9 }]).includes('555'));
  assert.deepEqual(pageLocs({ page: 2, values: [], words: ['light', ...SPAM] }), ['/w/light']);
});

function wordPageRows(rows, selfCount) {
  return (query) => baseRows(query) ?? (/SELECT word, search_count\s+FROM words/.test(query)
    ? rows
    : /SELECT search_count FROM words/.test(query) ? [{ search_count: selfCount }] : []);
}

test('the /w/ page of a legacy row that fails the gate is noindex', async () => {
  const phrase = 'my ex john smith';
  installFakeNeon(wordPageRows([...LEGIT_336, { word: phrase, search_count: 9 }], 9));
  const response = await wordPageRoute(new Request(`https://gematria.today/w/${encodeURIComponent(phrase)}`, {
    headers: { 'x-forwarded-for': '203.0.113.8' },
  }));
  assert.equal(response.status, 200, 'old links still resolve');
  assert.match(await response.text(), /<meta name="robots" content="noindex,follow" \/>/);
});

test('a value page lists only words that pass the gate and stays indexable on them', async () => {
  installFakeNeon(wordPageRows([...LEGIT_336, { word: 'Buy cheap pills at rxshop dot com', search_count: 9 }], 0));
  const response = await wordPageRoute(new Request('https://gematria.today/v/336', {
    headers: { 'x-forwarded-for': '203.0.113.9' },
  }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(!html.includes('rxshop'), 'spam must not be listed');
  assert.match(html, /<meta name="robots" content="index,follow" \/>/);
});

test('the sitemap counts and lists only rows that pass the gate', () => {
  const sitemap = read('../netlify/functions/sitemap-words-xml.mjs');
  assert.match(sitemap, /const LOOKS_LIKE_A_WORD = STORABLE_WORD_PATTERN;/);
  assert.equal((sitemap.match(/BTRIM\(word\) ~ \$\{LOOKS_LIKE_A_WORD\}/g) || []).length, 3, 'every query applies the rule');
  assert.equal((sitemap.match(/char_length\(BTRIM\(word\)\) <= \$\{MAX_STORED_WORD_LENGTH\}/g) || []).length, 3);
  const version = Number(sitemap.match(/const CACHE_VERSION = (\d+)/)[1]);
  assert.ok(version >= 5, 'the cache version must move with the filter');
});

test('the privacy policy and FAQ say what the word list publishes', () => {
  const privacy = read('../src/privacy.html');
  assert.match(privacy, /public word list/);
  assert.match(privacy, /Names you enter in the Name Calculator/);
  const faqs = read('../sql/seed_faqs.sql');
  assert.match(faqs, /names you enter in the Name Calculator are never added/);
  // The request-log sentence must not suggest that only main Calculator words
  // can be logged: a click logged on a shared Name Calculator link carries the
  // names in its page address.
  assert.ok(!/for main Calculator lookups, the word looked up/.test(faqs));
  assert.match(faqs, /Names you enter in the Name Calculator are not, although a logged click records the page address and the link clicked, which can contain a name/);
});
