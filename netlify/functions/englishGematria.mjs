import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';
import { recordWordSearchActivity } from './_badges.mjs';
import { isStorableWord } from './_words.mjs';

export function englishGematria(input) {
  if (typeof input !== 'string') throw new TypeError('englishGematria expects a string input');
  let total = 0;
  for (const char of input.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) total += (code - 64) * 6;
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

async function processWord(sql, word, { countAsSearch = true } = {}) {
  if (word === null || word === undefined || typeof word !== 'string') {
    throw Object.assign(new Error('Missing required query parameter: word'), { statusCode: 400 });
  }
  const trimmedWord = word.trim();
  const normalizedWord = trimmedWord.toLowerCase();
  if (!trimmedWord) throw Object.assign(new Error('Missing required query parameter: word'), { statusCode: 400 });

  const cacheResult = await withCachedJson(sql, {
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

      // Nobody searched for this, so it neither creates a row nor moves an
      // existing one closer to being published.
      if (!countAsSearch) {
        const existing = await sql`
          SELECT word, gematria_value, digital_root, is_base_root, search_count
          FROM words WHERE LOWER(word) = ${normalizedWord} LIMIT 1
        `;
        const row = existing[0];
        return {
          word: row ? row.word : trimmedWord,
          gematria: {
            total: String(row ? row.gematria_value : gematriaTotal),
            digitalRoot: Number(row ? row.digital_root : digitalRootValue),
          },
          isBaseRoot: isBaseRootValue(row ? row.gematria_value : gematriaTotal),
          searchCount: Number(row ? row.search_count : 0),
          source: row ? 'database' : 'calculated',
        };
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
        const row = existing[0];
        return {
          word: row ? row.word : trimmedWord,
          gematria: {
            total: String(row ? row.gematria_value : gematriaTotal),
            digitalRoot: Number(row ? row.digital_root : digitalRootValue),
          },
          isBaseRoot: isBaseRootValue(row ? row.gematria_value : gematriaTotal),
          searchCount: Number(row ? row.search_count : 0),
          source: row ? 'database' : 'calculated',
        };
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
      return {
        word: row.word,
        gematria: {
          total: String(row.gematria_value),
          digitalRoot: Number(row.digital_root),
        },
        isBaseRoot: isBaseRootValue(row.gematria_value),
        searchCount: Number(row.search_count),
        source: row.source,
      };
    },
  });

  return cacheResult;
}

export default async function onRequest(request) {
  const requestUrl = new URL(request.url);
  const word = requestUrl.searchParams.get('word');
  const countAsSearch = countsAsSearch(requestUrl.searchParams.get('intent'));
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
    const cacheResult = await processWord(sql, word, { countAsSearch });
    let badgeAward = null;
    // A lookup nobody performed is not activity to award a badge for, and in
    // the intent=view branch `source: 'calculated'` only means the word has no
    // row yet -- it does not mean this request created one.
    if (user?.id && countAsSearch && !cacheResult.cached) {
      badgeAward = await recordWordSearchActivity(sql, user.id, {
        wasNewWord: cacheResult.payload?.source === 'calculated',
        isBaseRoot: Boolean(cacheResult.payload?.isBaseRoot),
      });
    }
    await logRequestAudit(sql, request, {
      route: 'englishGematria',
      action: countAsSearch ? 'lookup' : 'view',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
      metadata: { word: String(word || '').trim().toLowerCase() },
    });
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
  const countAsSearch = countsAsSearch(extractIntentFromEvent(event));
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
    const cacheResult = await processWord(sql, word, { countAsSearch });
    let badgeAward = null;
    if (user?.id && countAsSearch && !cacheResult.cached) {
      badgeAward = await recordWordSearchActivity(sql, user.id, {
        wasNewWord: cacheResult.payload?.source === 'calculated',
        isBaseRoot: Boolean(cacheResult.payload?.isBaseRoot),
      });
    }
    await logRequestAudit(sql, event, {
      route: 'englishGematria',
      action: countAsSearch ? 'lookup' : 'view',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
      metadata: { word: String(word || '').trim().toLowerCase() },
    });
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
