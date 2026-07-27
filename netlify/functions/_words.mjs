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
