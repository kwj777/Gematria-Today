// One definition of what counts as a real word, shared by everything that
// stores, renders, or publishes entries from the words table.
//
// The table is written to by englishGematria on every lookup, so anything that
// reaches that endpoint is persisted forever. That is how bare numbers (0, 45,
// 276), punctuation (*), fragments (-ol), digit strings ("2 5 0 62 4") and raw
// Wordnik markup (<er>annoy</er>) ended up in it and, later, in the sitemap.

const MARKUP_OR_WILDCARD = /[<>{}|*\\/[\]^~`"]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

export function isIndexableWord(word) {
  const value = String(word ?? '').trim();
  if (!value || value.length > 64) return false;
  // Must read as a word: begins with a letter, not a digit or punctuation.
  if (!/^[A-Za-z]/.test(value)) return false;
  if (MARKUP_OR_WILDCARD.test(value)) return false;
  if (CONTROL_CHARS.test(value)) return false;
  return true;
}

// Storage uses the same rule as indexing. A word we would never show a search
// engine is a word we have no reason to keep.
export const isStorableWord = isIndexableWord;

// Words the dictionary contains that should not appear on a page published
// under the site's name. The calculator still returns them on demand; this
// governs generated pages and the sitemap only.
const BLOCKED = new Set([
  'fag', 'fags', 'faggot', 'faggots',
  'nigger', 'niggers', 'nigga', 'niggas',
  'kike', 'kikes', 'spic', 'spics', 'wop', 'wops',
  'chink', 'chinks', 'gook', 'gooks', 'coon', 'coons',
  'tranny', 'trannies', 'retard', 'retards', 'retarded',
  'cunt', 'cunts', 'whore', 'whores', 'slut', 'sluts',
]);

export function isPublishableWord(word) {
  if (!isIndexableWord(word)) return false;
  return !BLOCKED.has(String(word).trim().toLowerCase());
}

// How much demand and how much substance a generated page needs before it is
// offered to a search engine.
//
// `search_count > 0` was the original gate, and it did not hold. One lookup --
// from anyone, including a crawler following a link the site itself renders --
// was enough to mint an indexable URL and a sitemap entry. Search Console for
// the quarter to 2026-08-06 shows the result: the top eight queries by
// impressions were archaic dictionary words (dull-pated, filamentule, gauping,
// well-affectedness, chronogrammatic) with zero clicks between them, arriving
// on pages nobody wrote.
//
// Two conditions now, because thinness has two causes:
//   demand   -- one stray lookup is not evidence anyone wants the page
//   substance -- a word whose value nothing else shares has nothing on its page
//                but its own letter sum, which is thin by any reading
export const MIN_SEARCHES_FOR_INDEX = 3;
export const MIN_SHARED_VALUE_WORDS = 5;

// Words are only worth indexing if people keep coming back to them. The table
// carries tens of thousands of bulk-imported rows with no search history; a
// smaller set of pages people actually wanted beats a large set of thin ones,
// which is what thin-content and doorway heuristics penalise.
export function hasEnoughSearches(row) {
  return Number(row?.search_count || 0) >= MIN_SEARCHES_FOR_INDEX;
}

// A /w/ or /v/ page is a list of words sharing a gematria value. Below a
// handful of entries there is no list, and the page is a letter sum with
// nothing around it.
export function hasEnoughSharedWords(count) {
  return Number(count || 0) >= MIN_SHARED_VALUE_WORDS;
}

// Deliberately not exported as a single isPublishableRow(row) helper. A row on
// its own cannot answer the question: how many other words share its value is
// a property of the whole table, and a helper that took only the row would
// look like the full gate while checking half of it. Callers compose
// isPublishableWord + hasEnoughSearches + hasEnoughSharedWords, so the missing
// half is visible at every call site.
