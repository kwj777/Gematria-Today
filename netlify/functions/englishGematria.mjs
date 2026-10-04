import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';
import { recordWordSearchActivity } from './_badges.mjs';
import { isStorableWord } from './_words.mjs';

// Text that looks the same has to add up the same. Upper-casing the raw input
// let a decomposed "José" (e + U+0301, common in macOS and PDF copy-paste)
// count the E that a precomposed é skips, turned ß into SS while dropping ẞ,
// and scored nothing for the Kelvin sign in "Kevin" while the lowercase key
// still matched the stored "kevin" row. NFKC folds compatibility forms
// (ligatures, full-width letters, the Kelvin sign) into the letters they stand
// for and composes accents onto their base letter; only ASCII A-Z is then
// counted, so accented letters are skipped, as the calculators document.
export function normalizeGematriaInput(input) {
  return String(input ?? '').normalize('NFKC');
}

export function gematriaLetters(input) {
  return normalizeGematriaInput(input).replace(/[^A-Za-z]/g, '').toUpperCase();
}

export function englishGematria(input) {
  if (typeof input !== 'string') throw new TypeError('englishGematria expects a string input');
  let total = 0;
  for (const char of gematriaLetters(input)) {
    total += (char.charCodeAt(0) - 64) * 6;
  }
  return total.toString();
}

export function digitalRoot(value) {
  let root = Math.abs(Math.trunc(value));
  while (root >= 10) {
    root = String(root).split('').reduce((sum, digit) => sum + Number(digit), 0);
  }
  return root;
}

export function englishGematriaWithDigitalRoot(input) {
  const total = Number(englishGematria(input));
  return { total: total.toString(), digitalRoot: digitalRoot(total) };
}

export function isBaseRootValue(gematriaTotal) {
  return Number(gematriaTotal - 6) % 54 === 0;
}

// Only A-Z count, so an input without one -- a Hebrew or Greek word, an emoji,
// bare punctuation -- totals 0. That is not a gematria value, but it used to be
// returned as one, and the calculator showed "0" with share buttons for it.
export const NO_COUNTABLE_LETTERS_MESSAGE = 'This calculator counts English letters A-Z only. Enter a word or phrase with at least one of them.';

export function hasCountableLetters(input) {
  return Number(englishGematria(String(input ?? ''))) > 0;
}

// A stored row keeps the total computed when it was written. Rows written
// before the rule above counted ß as SS and ı as I, so "Straße" sits in the
// table at 606 although it now adds up to 378. A list of the words worth a
// value shows only rows that still are, so no word in it opens to a different
// number than the one it was listed under.
export function wordHasValue(word, value) {
  return Number(englishGematria(String(word ?? ''))) === Number(value);
}

function extractWordFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if ('queryStringParameters' in event) return event.queryStringParameters?.word ?? null;
  if ('rawUrl' in event && typeof event.rawUrl === 'string') return new URL(event.rawUrl).searchParams.get('word');
  return null;
}

// `search_count` is the gate that decides whether a word gets an indexable /w/
// page (see _words.mjs), so what increments it decides what the site publishes.
// Two callers were incrementing it without anybody having searched anything:
//
//   1. /calculator.html?query=WORD runs the lookup on page load. The home page
//      builds exactly that link for the Wordnik word of the day, so every
//      crawl of the home page registered a "search" for an archaic word --
//      dull-pated, filamentule, gauping -- and published a page for it.
//   2. One search fans out to a gematria lookup for every Wordnik related
//      word, registering ten more "searches" the visitor never made.
//
// Callers pass intent=view for both. The value is still calculated and
// returned; only the demand signal is withheld.
export function extractIntentFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if ('queryStringParameters' in event) return event.queryStringParameters?.intent ?? null;
  if ('rawUrl' in event && typeof event.rawUrl === 'string') return new URL(event.rawUrl).searchParams.get('intent');
  return null;
}

export function countsAsSearch(intent) {
  return String(intent ?? '').trim().toLowerCase() !== 'view';
}

// The name calculator sends kind=name. The words table is published -- in the
// calculator's reverse lookup, on /v/ and /w/ pages and in the sitemap -- so a
// name typed there (often a child's or a partner's) was listed for every
// visitor whose own lookup shared its value. A name lookup still returns the
// value, and intent still decides whether the member gets credit for it, but
// the name never adds a row or moves an existing row's search_count, and it is
// kept out of the shared response cache and the request audit log. The page's
// definition and related-word requests send the same flag, and
// wordnikDefinition and wordnikRelatedWords keep the name out of both as well.
export function extractKindFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if ('queryStringParameters' in event) return event.queryStringParameters?.kind ?? null;
  if ('rawUrl' in event && typeof event.rawUrl === 'string') return new URL(event.rawUrl).searchParams.get('kind');
  return null;
}

export function isNameLookup(kind) {
  return String(kind ?? '').trim().toLowerCase() === 'name';
}

// Whether a lookup may add the word to the words table or count as demand for
// its page.
export function storesLookup(intent, kind) {
  return countsAsSearch(intent) && !isNameLookup(kind);
}

// `countAsSearch` here is storesLookup(): whether this lookup is recorded
// against the words table. Credit to the member is the caller's decision.
// `shareCache: false` skips the shared response cache, which keeps each payload
// -- the looked-up text included -- in the database for its TTL and the cleanup
// grace period after it. A name is not kept there either.
async function processWord(sql, word, { countAsSearch = true, shareCache = true } = {}) {
  if (word === null || word === undefined || typeof word !== 'string') {
    throw Object.assign(new Error('Missing required query parameter: word'), { statusCode: 400 });
  }
  // The stored word, its lowercase key and the cache key all use the same
  // normalized form, so text that looks the same finds the same row.
  const trimmedWord = normalizeGematriaInput(word).trim();
  const normalizedWord = trimmedWord.toLowerCase();
  if (!trimmedWord) throw Object.assign(new Error('Missing required query parameter: word'), { statusCode: 400 });
  if (!hasCountableLetters(trimmedWord)) throw Object.assign(new Error(NO_COUNTABLE_LETTERS_MESSAGE), { statusCode: 400 });

  // True only when this request's own INSERT created the row. A cached
  // payload, an existing row, or an input too loose to store is not a new word,
  // whatever `source` says.
  let inserted = false;
  const lookup = {
    // Counting and non-counting lookups cache separately. Sharing one entry
    // would let a page-load lookup park a payload in the cache and swallow the
    // increment for a real search of the same word within the TTL.
    cacheKey: buildCacheKey({ route: 'englishGematria', word: normalizedWord, intent: countAsSearch ? 'search' : 'view' }),
    route: 'englishGematria',
    ttlSeconds: 120,
    compute: async () => {
      const gematria = englishGematriaWithDigitalRoot(trimmedWord);
      const digitalRootValue = Number(gematria.digitalRoot);
      const gematriaTotal = Number(gematria.total);
      const isBaseRoot = isBaseRootValue(gematriaTotal);
      // The value is a pure function of the normalized word, so it is always
      // this calculation, never the row's stored copy: a row written under the
      // old rule still holds its old total (see wordHasValue), and returning
      // it put the server at odds with the per-letter breakdown beside it and
      // with the word's own /w/ page. The row supplies only its stored
      // spelling and its search count.
      const toPayload = (row, source = row ? 'database' : 'calculated') => ({
        word: row ? row.word : trimmedWord,
        gematria: {
          total: String(gematriaTotal),
          digitalRoot: digitalRootValue,
        },
        isBaseRoot,
        searchCount: Number(row ? row.search_count : 0),
        source,
      });

      // Nobody searched for this, so it neither creates a row nor moves an
      // existing one closer to being published.
      if (!countAsSearch) {
        const existing = await sql`
          SELECT word, gematria_value, digital_root, is_base_root, search_count
          FROM words WHERE LOWER(word) = ${normalizedWord} LIMIT 1
        `;
        return toPayload(existing[0]);
      }

      // Every lookup used to be written to the words table, so anything a caller
      // sent was persisted forever -- which is how numbers, punctuation and raw
      // Wordnik markup got in, and later into the sitemap. The value is still
      // calculated and returned for any input; only storage is gated.
      const storable = isStorableWord(trimmedWord);

      if (!storable) {
        const existing = await sql`
          UPDATE words
          SET search_count = search_count + 1
          WHERE LOWER(word) = ${normalizedWord}
          RETURNING word, gematria_value, digital_root, is_base_root, search_count
        `;
        return toPayload(existing[0]);
      }

      const result = await sql`
        WITH updated AS (
          UPDATE words
          SET search_count = search_count + 1
          WHERE LOWER(word) = ${normalizedWord}
          RETURNING word, gematria_value, digital_root, is_base_root, search_count
        ),
        inserted AS (
          INSERT INTO words (word, gematria_value, digital_root, is_base_root, search_count)
          SELECT ${trimmedWord}, ${gematriaTotal}, ${digitalRootValue}, ${isBaseRoot}, 1
          WHERE NOT EXISTS (SELECT 1 FROM updated)
          RETURNING word, gematria_value, digital_root, is_base_root, search_count
        )
        SELECT word, gematria_value, digital_root, is_base_root, search_count, 'database' AS source
        FROM updated
        UNION ALL
        SELECT word, gematria_value, digital_root, is_base_root, search_count, 'calculated' AS source
        FROM inserted
        LIMIT 1
      `;

      if (result.length === 0) throw new Error('Failed to retrieve or insert word.');
      const row = result[0];
      inserted = row.source === 'calculated';
      return toPayload(row, row.source);
    },
  };
  const cacheResult = shareCache
    ? await withCachedJson(sql, lookup)
    : { statusCode: 200, payload: await lookup.compute(), cached: false };

  return { ...cacheResult, inserted };
}

function lookupAuditEntry({ intent, kind, word, cacheResult }) {
  return {
    route: 'englishGematria',
    action: countsAsSearch(intent) ? 'lookup' : 'view',
    outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    metadata: isNameLookup(kind) ? { kind: 'name' } : { word: String(word || '').trim().toLowerCase() },
  };
}

export default async function onRequest(request) {
  const requestUrl = new URL(request.url);
  const word = requestUrl.searchParams.get('word');
  const intent = requestUrl.searchParams.get('intent');
  const kind = requestUrl.searchParams.get('kind');
  const countAsSearch = countsAsSearch(intent);
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'englishGematria' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(request, { sql });
    if (!user) {
      await applyRateLimit(sql, request, {
        scope: 'englishGematria-ip',
        key: getClientIp(request),
        limit: 45,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many calculator requests.',
      });
    }
    const cacheResult = await processWord(sql, word, { countAsSearch: storesLookup(intent, kind), shareCache: !isNameLookup(kind) });
    let badgeAward = null;
    // A lookup nobody performed (intent=view) is not activity to award a
    // badge for. Any other lookup is, whether or not the shared response cache
    // answered it: someone else searching the same word a minute earlier does
    // not make this member's search any less theirs. Only a row this request
    // actually inserted is a contributed word.
    if (user?.id && countAsSearch) {
      badgeAward = await recordWordSearchActivity(sql, user.id, {
        wasNewWord: cacheResult.inserted,
        isBaseRoot: Boolean(cacheResult.payload?.isBaseRoot),
      });
    }
    await logRequestAudit(sql, request, lookupAuditEntry({ intent, kind, word, cacheResult }));
    const responsePayload = badgeAward?.newBadges?.length
      ? { ...cacheResult.payload, newlyEarnedBadges: badgeAward.newBadges }
      : cacheResult.payload;
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, max-age=120, stale-while-revalidate=60',
        'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.statusCode || 500,
      headers: { 'content-type': 'application/json; charset=utf-8', ...(error.headers || {}) },
    });
  }
}

export async function handler(event) {
  const word = extractWordFromEvent(event);
  const intent = extractIntentFromEvent(event);
  const kind = extractKindFromEvent(event);
  const countAsSearch = countsAsSearch(intent);
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'englishGematria' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'englishGematria-ip',
        key: getClientIp(event),
        limit: 45,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many calculator requests.',
      });
    }
    const cacheResult = await processWord(sql, word, { countAsSearch: storesLookup(intent, kind), shareCache: !isNameLookup(kind) });
    let badgeAward = null;
    if (user?.id && countAsSearch) {
      badgeAward = await recordWordSearchActivity(sql, user.id, {
        wasNewWord: cacheResult.inserted,
        isBaseRoot: Boolean(cacheResult.payload?.isBaseRoot),
      });
    }
    await logRequestAudit(sql, event, lookupAuditEntry({ intent, kind, word, cacheResult }));
    const responsePayload = badgeAward?.newBadges?.length
      ? { ...cacheResult.payload, newlyEarnedBadges: badgeAward.newBadges }
      : cacheResult.payload;
    return jsonResponse(200, responsePayload, {
      'cache-control': 'private, max-age=120, stale-while-revalidate=60',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message }, error.headers || {});
  }
}
