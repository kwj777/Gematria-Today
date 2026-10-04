import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { baseRows, installFakeNeon } from './helpers/fake-neon.mjs';
import englishGematriaRoute, { englishGematria, gematriaLetters } from '../netlify/functions/englishGematria.mjs';
import wordPageRoute, { letterBreakdown } from '../netlify/functions/word-page.mjs';
import searchByGematriaRoute from '../netlify/functions/searchByGematria.mjs';
import { getPerLetterValues } from '../netlify/functions/name-chart-image.mjs';
import { calculateCipher } from '../page-scripts/multi-cipher-engine.mjs';
import { englishGematria as agentGematria, gematriaLetterBreakdown } from '../page-scripts/ai-agent-helpers.mjs';

// Every calculator upper-cased the raw input and counted A-Z. Text that looks
// identical then added up differently: a decomposed "José" (e + U+0301, common
// in macOS and PDF copy-paste) counted the E that a precomposed é skips, ß
// upper-cased to SS while ẞ was dropped, and the Kelvin sign in "Kevin" scored
// nothing on the page while matching the stored "kevin" row on the server.

const PRIOR_FETCH = globalThis.fetch;
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;

test.afterEach(() => {
  globalThis.fetch = PRIOR_FETCH;
});

test.after(() => {
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
});

const LOOKALIKES = [
  ['José', 'José'],
  ['Straße', 'STRAẞE'],
  ['finance', 'ﬁnance'],
  ['Kevin', 'Kevin'],
  ['GEMATRIA', 'ＧＥＭＡＴＲＩＡ'],
];

test('text that looks the same adds up the same', () => {
  for (const [plain, lookalike] of LOOKALIKES) {
    assert.equal(englishGematria(lookalike), englishGematria(plain), `${plain} vs ${JSON.stringify(lookalike)}`);
  }
  assert.equal(englishGematria('Kevin'), '366');
});

test('accented letters are skipped, as the calculators document', () => {
  assert.equal(englishGematria('José'), englishGematria('Jos'));
  assert.equal(englishGematria('José'), englishGematria('Jos'));
  assert.equal(englishGematria('Straße'), englishGematria('Strae'), 'ß is not SS');
  const docs = readFileSync(new URL('../src/name-calculator.html', import.meta.url), 'utf8');
  assert.match(docs, /Accented letters and digits are skipped entirely/);
});

test('every letter-sum copy applies the same rule', () => {
  for (const [plain, lookalike] of LOOKALIKES) {
    const expected = Number(englishGematria(plain));
    const sum = (letters) => letters.reduce((total, { value }) => total + value, 0);
    assert.equal(sum(letterBreakdown(lookalike)), expected, `word page: ${plain}`);
    assert.equal(sum(getPerLetterValues(lookalike)), expected, `name chart: ${plain}`);
    assert.equal(calculateCipher(lookalike, 'sumerian').total, expected, `multi-cipher: ${plain}`);
    assert.equal(agentGematria(lookalike), expected, `ai agent: ${plain}`);
    assert.equal(sum(gematriaLetterBreakdown(lookalike)), expected, `ai agent breakdown: ${plain}`);
  }
  assert.equal(gematriaLetters('ﬁne Straße'), 'FINESTRAE');
});

test('the browser calculators normalize before counting', () => {
  for (const path of ['../page-scripts/calculator-1.js', '../page-scripts/name-calculator-1.js', '../page-scripts/member-1.js', '../home-page.js', '../netlify/functions/wordnikWordOfDay.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /\.normalize\('NFKC'\)\.replace\(\/\[\^A-Za-z\]\/g, ''\)\.toUpperCase\(\)/, path);
    assert.ok(!/String\((?:input|value|word) (?:\|\||\?\?) ''\)\.toUpperCase\(\)/.test(source), `${path} still upper-cases raw input`);
  }
});

test('the server looks up and stores the normalized form', async () => {
  const { queries } = installFakeNeon((query, params) => baseRows(query) ?? (/INSERT INTO words/.test(query)
    ? [{ word: params[1], gematria_value: Number(params[2]), digital_root: Number(params[3]), is_base_root: false, search_count: 1, source: 'calculated' }]
    : []));
  const url = new URL('https://gematria.today/api/englishGematria');
  url.searchParams.set('word', 'ﬁnance');
  const response = await englishGematriaRoute(new Request(url, { headers: { 'x-forwarded-for': '203.0.113.12' } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).gematria.total, englishGematria('finance'));
  const write = queries.find(({ query }) => /INSERT INTO words/.test(query));
  assert.ok(write.params.includes('finance'), 'the key and the stored word are the plain-letter form');
  assert.ok(!JSON.stringify(write.params).includes('ﬁ'));
});

// ---------------------------------------------------------------------------
// rows stored under the old rule
// ---------------------------------------------------------------------------

// Before the rule above, "Straße" upper-cased to STRASSE and was stored at 606.
// It adds up to 378 now, on the calculators' per-letter breakdown, the name
// chart and its own /w/ page, so the server must not hand back the stored 606.
const LEGACY_STRASSE = { word: 'Straße', gematria_value: 606, digital_root: 3, is_base_root: false, search_count: 4 };

function legacyRows(row) {
  return (query) => {
    const base = baseRows(query);
    if (base) return base;
    // The lookup's SELECT, its UPDATE ... RETURNING and its WITH updated AS
    // (...) all find the stored row by its lowercase key.
    if (/LOWER\(word\) = \$1/.test(query)) return [{ ...row, source: 'database' }];
    return [];
  };
}

function legacyLookup(word, params = {}) {
  const url = new URL('https://gematria.today/api/englishGematria');
  url.searchParams.set('word', word);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return englishGematriaRoute(new Request(url, { headers: { 'x-forwarded-for': '203.0.113.13' } }));
}

test('a row stored under the old rule is answered with the value its word has now', async () => {
  assert.equal(englishGematria('Straße'), '378');
  const cases = [
    ['Straße', {}, 'a counted lookup of a storable word'],
    ['Straße', { kind: 'name' }, 'a name lookup'],
    ['Straße', { intent: 'view' }, 'a page-load lookup'],
    ['STRAẞE', {}, 'the capital sharp s'],
  ];
  for (const [word, params, label] of cases) {
    const { queries } = installFakeNeon(legacyRows(LEGACY_STRASSE));
    const response = await legacyLookup(word, params);
    assert.equal(response.status, 200, label);
    const payload = await response.json();
    assert.ok(queries.some(({ query }) => /LOWER\(word\) = \$1/.test(query)), `${label}: the stored row was looked up`);
    assert.equal(payload.source, 'database', `${label}: the stored row was found`);
    assert.equal(payload.word, 'Straße', `${label}: the stored spelling is kept`);
    assert.equal(payload.gematria.total, '378', `${label}: not the stored 606`);
    assert.equal(payload.gematria.digitalRoot, 9, label);
    assert.equal(payload.isBaseRoot, false, label);
    assert.equal(payload.searchCount, 4, label);
  }

  // An input too loose to store still bumps an existing row's count, and is
  // answered the same way.
  const loose = 'Straße 2';
  installFakeNeon(legacyRows({ ...LEGACY_STRASSE, word: loose }));
  const response = await legacyLookup(loose);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.source, 'database');
  assert.equal(payload.gematria.total, '378');
});

test('lists of the words worth a value leave out rows whose word no longer adds up to it', async () => {
  const worth606 = ['doorway', 'repentance', 'sorcerer'];
  for (const word of worth606) assert.equal(englishGematria(word), '606', word);
  const rows = [...worth606, 'Straße'].map((word) => ({ word, gematria_value: 606, digital_root: 3, is_base_root: false, search_count: 4 }));
  const respond = (query) => baseRows(query) ?? (/WHERE gematria_value = \$1/.test(query)
    ? rows
    : /SELECT search_count FROM words/.test(query) ? [{ search_count: 0 }] : []);
  const anonymous = (path) => new Request(`https://gematria.today${path}`, { headers: { 'x-forwarded-for': '203.0.113.14' } });

  installFakeNeon(respond);
  const reverse = await searchByGematriaRoute(anonymous('/api/searchByGematria?gematria=606'));
  assert.equal(reverse.status, 200);
  const found = await reverse.json();
  assert.deepEqual(found.words.map(({ word }) => word), worth606, 'the reverse lookup must not list it');
  assert.equal(found.count, 3);

  installFakeNeon(respond);
  const page = await wordPageRoute(anonymous('/v/606'));
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(!html.includes('Stra'), 'the value page must not list it');
  assert.match(html, /3 words share this value/);
  for (const word of worth606) assert.ok(html.includes(`/w/${word}`), word);
});
