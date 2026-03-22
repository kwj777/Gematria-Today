import { getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';

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

function isBaseRootValue(gematriaTotal) {
  return Number(gematriaTotal - 6) % 54 === 0;
}

function extractWordFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if ('queryStringParameters' in event) return event.queryStringParameters?.word ?? null;
  if ('rawUrl' in event && typeof event.rawUrl === 'string') return new URL(event.rawUrl).searchParams.get('word');
  return null;
}

async function processWord(sql, word) {
  const trimmedWord = word.trim();
  const normalizedWord = trimmedWord.toLowerCase();
  if (!trimmedWord) throw new Error('Missing required query parameter: word');

  const cacheResult = await withCachedJson(sql, {
    cacheKey: buildCacheKey({ route: 'englishGematria', word: normalizedWord }),
    route: 'englishGematria',
    ttlSeconds: 120,
    compute: async () => {
      const gematria = englishGematriaWithDigitalRoot(trimmedWord);
      const digitalRootValue = Number(gematria.digitalRoot);
      const gematriaTotal = Number(gematria.total);
      const isBaseRoot = isBaseRootValue(gematriaTotal);

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
  const word = new URL(request.url).searchParams.get('word');
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'englishGematria' });
    const sql = getSqlClient();
    await applyRateLimit(sql, request, {
      scope: 'englishGematria-ip',
      key: getClientIp(request),
      limit: 45,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many calculator requests.',
    });
    const cacheResult = await processWord(sql, word);
    await logRequestAudit(sql, request, {
      route: 'englishGematria',
      action: 'lookup',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
      metadata: { word: String(word || '').trim().toLowerCase() },
    });
    return new Response(JSON.stringify(cacheResult.payload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, max-age=120, stale-while-revalidate=60',
        'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.statusCode || (String(error.message).includes('Missing required') ? 400 : 500),
      headers: { 'content-type': 'application/json; charset=utf-8', ...(error.headers || {}) },
    });
  }
}

export async function handler(event) {
  const word = extractWordFromEvent(event);
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'englishGematria' });
    const sql = getSqlClient();
    await applyRateLimit(sql, event, {
      scope: 'englishGematria-ip',
      key: getClientIp(event),
      limit: 45,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many calculator requests.',
    });
    const cacheResult = await processWord(sql, word);
    await logRequestAudit(sql, event, {
      route: 'englishGematria',
      action: 'lookup',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
      metadata: { word: String(word || '').trim().toLowerCase() },
    });
    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'private, max-age=120, stale-while-revalidate=60',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || (String(error.message).includes('Missing required') ? 400 : 500), { error: error.message }, error.headers || {});
  }
}
