import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as words from '../netlify/functions/_words.mjs';
import {
  hasEnoughSearches,
  hasEnoughSharedWords,
  isPublishableWord,
  MIN_SEARCHES_FOR_INDEX,
  MIN_SHARED_VALUE_WORDS,
} from '../netlify/functions/_words.mjs';
import { countsAsSearch, extractIntentFromEvent } from '../netlify/functions/englishGematria.mjs';

// Search Console, quarter to 2026-08-06: 512 impressions, 10 clicks, average
// position 15.1. The top eight queries by impressions were archaic dictionary
// words -- dull-pated, filamentule, gauping, well-affectedness,
// chronogrammatic -- with zero clicks between them. They were being served
// programmatically generated /w/ pages that qualified for the index because
// something had looked the word up exactly once. That something was the site.
//
// These tests pin the two halves of the fix: the loop that manufactured the
// lookups, and the gate that treated one lookup as demand.

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// the gate
// ---------------------------------------------------------------------------

test('a word needs repeated demand before it is offered to a search engine', () => {
  for (let count = 0; count < MIN_SEARCHES_FOR_INDEX; count += 1) {
    assert.equal(hasEnoughSearches({ search_count: count }), false, `${count} search(es) must not qualify`);
  }
  assert.equal(hasEnoughSearches({ search_count: MIN_SEARCHES_FOR_INDEX }), true);
  assert.equal(hasEnoughSearches({}), false);
  assert.equal(hasEnoughSearches(null), false);
});

test('a word needs company before its page is more than its own letter sum', () => {
  assert.equal(hasEnoughSharedWords(MIN_SHARED_VALUE_WORDS - 1), false);
  assert.equal(hasEnoughSharedWords(MIN_SHARED_VALUE_WORDS), true);
  assert.equal(hasEnoughSharedWords(0), false);
  assert.equal(hasEnoughSharedWords(undefined), false);
});

test('the junk and slur filters still apply on top of the thresholds', () => {
  assert.equal(isPublishableWord('-ol'), false);
  assert.equal(isPublishableWord('fag'), false);
  assert.equal(isPublishableWord('filamentule'), true, 'the word itself is fine; the demand for it is what was missing');
});

test('there is no single-row helper that looks like the whole gate', () => {
  // A helper taking only a row cannot see how many words share its value, so
  // it would report "publishable" while checking half the rule -- which is how
  // the one-lookup gate survived as long as it did.
  assert.equal(words.isPublishableRow, undefined, 'compose the three checks at the call site instead');
});

test('word pages require demand AND substance, value pages require substance', () => {
  const source = read('../netlify/functions/word-page.mjs');

  // A word page whose value nothing else shares renders "No other words in the
  // database share this value yet" and nothing else. That is the thin page.
  assert.match(source, /hasEnoughSearches\(\{ search_count/);
  assert.match(source, /hasEnoughSharedWords\(sharedWordCount\)/);

  // A value page is a real aggregation -- every word in the database worth
  // 336 -- so it earns indexing on the size of that list alone.
  assert.match(source, /: !hasEnoughSharedWords\(sharedWordCount\)/);
});

test('the sitemap applies the same two conditions the page applies', () => {
  const sitemap = read('../netlify/functions/sitemap-words-xml.mjs');

  assert.match(sitemap, /search_count >= \$\{MIN_SEARCHES_FOR_INDEX\}/);
  assert.match(sitemap, /value_word_count >= \$\{MIN_SHARED_VALUE_WORDS\}/);
  assert.match(sitemap, /HAVING COUNT\(\*\) >= \$\{MIN_SHARED_VALUE_WORDS\}/);

  // Cached payloads outlive a deploy, so a filtering change that does not move
  // the cache version keeps serving the old set for its full six-hour TTL.
  const version = sitemap.match(/const CACHE_VERSION = (\d+)/);
  assert.ok(version, 'sitemap must declare a cache version');
  assert.ok(Number(version[1]) >= 4, 'bump CACHE_VERSION when the filtering changes');
});

test('the SQL pre-filter is looser than the JS rule, never tighter', () => {
  // sitemap SQL cannot call isPublishableWord, so it pre-filters on "starts
  // with a letter". Anything that rule keeps but the JS rule drops is filtered
  // out later; anything the SQL rule dropped early would be invisible to the
  // JS filter and could put the sitemap out of step with the page.
  const startsWithLetter = (word) => /^[A-Za-z]/.test(word);
  for (const word of ['light', 'A per se', "O'Brien", 'ALGOL', 'fag', 'dull-pated']) {
    if (isPublishableWord(word)) {
      assert.equal(startsWithLetter(word), true, `${word} is publishable but the SQL pre-filter would drop it`);
    }
  }
});

// ---------------------------------------------------------------------------
// the loop that fed the gate
// ---------------------------------------------------------------------------

test('intent=view returns the value without recording demand', () => {
  assert.equal(countsAsSearch('view'), false);
  assert.equal(countsAsSearch('VIEW'), false);
  assert.equal(countsAsSearch(' view '), false);
  assert.equal(countsAsSearch(null), true, 'an ordinary lookup still counts');
  assert.equal(countsAsSearch(undefined), true);
  assert.equal(countsAsSearch('search'), true);
});

test('intent survives both function runtimes', () => {
  assert.equal(extractIntentFromEvent({ queryStringParameters: { intent: 'view' } }), 'view');
  assert.equal(extractIntentFromEvent({ rawUrl: 'https://gematria.today/api/englishGematria?word=x&intent=view' }), 'view');
  assert.equal(extractIntentFromEvent({ queryStringParameters: {} }), null);
  assert.equal(extractIntentFromEvent(null), null);
  assert.equal(countsAsSearch(extractIntentFromEvent({ queryStringParameters: {} })), true);
});

test('a non-counting lookup neither inserts a row nor increments one', () => {
  const source = read('../netlify/functions/englishGematria.mjs');
  const guard = source.indexOf('if (!countAsSearch) {');
  const insert = source.indexOf('INSERT INTO words');
  const increment = source.indexOf('SET search_count = search_count + 1');

  assert.ok(guard !== -1, 'the read-only branch must exist');
  assert.ok(guard < insert, 'the read-only branch must return before any insert');
  assert.ok(guard < increment, 'the read-only branch must return before any increment');

  // Sharing one cache entry would let a page-load lookup park a payload and
  // swallow the increment for a real search of the same word inside the TTL.
  assert.match(source, /intent: countAsSearch \? 'search' : 'view'/);
});

test('the calculator does not count lookups nobody asked for', () => {
  const source = read('../page-scripts/calculator-1.js');

  // /calculator.html?query=WORD runs on page load. The home page builds exactly
  // that link for the Wordnik word of the day, and every definition page builds
  // one for each long word in the definition body.
  assert.match(source, /runSearch\(query, \{ pagePrefill: true \}\)/);
  assert.match(source, /pendingSearchIsPagePrefill/);
  assert.match(source, /requestGematria\(term, \{ countAsSearch: !isPagePrefill \}\)/);

  // One search used to fan out into a gematria lookup per Wordnik related
  // word, registering a dozen searches the visitor never made.
  assert.match(source, /requestGematria\(word, \{ countAsSearch: false \}\)/);
});

test('the name calculator does not count names it filled in from the URL', () => {
  const source = read('../page-scripts/name-calculator-1.js');
  assert.match(source, /renderResults\(namesFromQuery, \{ countAsSearch: false \}\)/);
  assert.match(source, /searchParams\.set\('intent', 'view'\)/);
});

// ---------------------------------------------------------------------------
// scraped definition pages
// ---------------------------------------------------------------------------

test('definition pages are not offered to search engines', () => {
  const source = read('../netlify/functions/wordnikDefinition.mjs');

  // The body is Wordnik's definition text verbatim. Published as an indexable
  // page it is somebody else's dictionary entry under our name, competing for
  // the definition queries that dictionary owns -- and the home page linked a
  // fresh one every day for the word of the day.
  assert.match(source, /<meta name="robots" content="noindex,nofollow" \/>/);
  assert.match(source, /'x-robots-tag': 'noindex, nofollow'/);

  // Self-canonical is what let each one stand as its own indexable URL.
  assert.ok(
    !/<link rel="canonical" href="\$\{canonicalPath\}"/.test(source),
    'the self-canonical must be gone',
  );
});

test('definition pages stay crawlable so the noindex can be read', () => {
  // A robots.txt Disallow would freeze the already-indexed URLs exactly as
  // they are: Google cannot drop a page for a tag it is not allowed to fetch.
  const staticRobots = read('../robots.txt');
  const generated = read('../netlify/functions/robots-txt.mjs');
  assert.ok(!/Disallow: \/definition/.test(staticRobots));
  assert.ok(!/'\/definition'/.test(generated));
});
