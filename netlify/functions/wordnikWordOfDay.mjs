import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, fetchWithTimeout, getClientIp, getProtectionConfig, logRequestAudit, withCachedJson } from './_security.mjs';

function toResponse(statusCode, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function getDateKey() {
  return new Date().toISOString().slice(0, 10);
}

// NFKC, then ASCII letters only: the same rule as englishGematria.mjs.
function englishGematria(input) {
  return String(input ?? '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase().split('').reduce((sum, char) => {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return sum;
    return sum + ((code - 64) * 6);
  }, 0);
}

function digitalRoot(value) {
  const digits = String(Math.abs(Number(value) || 0)).replace(/\D/g, '');
  if (!digits) return 0;
  let total = digits.split('').reduce((sum, digit) => sum + Number(digit), 0);
  while (total > 9) {
    total = String(total).split('').reduce((sum, digit) => sum + Number(digit), 0);
  }
  return total;
}

function gematriaLetterBreakdown(input) {
  return String(input ?? '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase().split('').flatMap((char) => {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return [];
    return [{ char, value: (code - 64) * 6 }];
  });
}

function buildWordnikWordOfDayUrl() {
  const baseUrl = process.env.WORDNIK_WORD_OF_DAY_URL || 'https://api.wordnik.com/v4/words.json/wordOfTheDay';
  const apiKey = process.env.WORDNIK_API_KEY;

  if (!apiKey) {
    throw new Error('Missing WORDNIK_API_KEY environment variable');
  }

  const url = new URL(baseUrl);
  url.searchParams.set('date', getDateKey());
  url.searchParams.set('api_key', apiKey);
  return url;
}

function selectDefinitionPreview(entries) {
  const items = Array.isArray(entries) ? entries : [];
  const raw = String(items[0]?.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.length > 180 ? `${raw.slice(0, 180).trim()}…` : raw;
}

function getErrorStatusCode(error) {
  if (error.message?.startsWith('Missing WORDNIK_')) return 500;
  if (error.message?.startsWith('Wordnik request failed')) return 502;
  if (error.statusCode) return error.statusCode;
  return 500;
}

async function fetchWordOfDay(sql, source) {
  const dateKey = getDateKey();
  const cacheResult = await withCachedJson(sql, {
    cacheKey: buildCacheKey({ route: 'wordnikWordOfDay', date: dateKey }),
    route: 'wordnikWordOfDay',
    ttlSeconds: 60 * 60 * 24,
    compute: async () => {
      const url = buildWordnikWordOfDayUrl();
      const timeoutMs = getProtectionConfig().wordnikTimeoutMs;
      const maxAttempts = 3;
      let response;
      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          response = await fetchWithTimeout(url, {}, timeoutMs);
        } catch (networkError) {
          lastError = networkError;
          response = null;
        }
        const isTransient = !response || response.status === 429 || (response.status >= 500 && response.status <= 599);
        if (!isTransient) {
          break;
        }
        if (attempt < maxAttempts) {
          const backoffMs = 250 * 2 ** (attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
      if (!response) {
        throw Object.assign(
          new Error("We couldn't reach Wordnik just now. Please try again in a little while."),
          { statusCode: 502, upstreamStatus: 0, upstreamBody: lastError?.message || 'network error' },
        );
      }
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw Object.assign(
            new Error("Wordnik is busy right now. Please try again in a few minutes."),
            { statusCode: 429, upstreamStatus: 429, upstreamBody: errorText || response.statusText },
          );
        }
        throw Object.assign(
          new Error("We couldn't reach Wordnik just now. Please try again in a little while."),
          { statusCode: 502, upstreamStatus: response.status, upstreamBody: errorText || response.statusText },
        );
      }

      const payload = await response.json();
      const word = String(payload?.word || '').trim();
      if (!word) {
        throw new Error('Wordnik response did not include a word of the day');
      }

      const total = englishGematria(word);
      const root = digitalRoot(total);
      const letters = gematriaLetterBreakdown(word);
      const definitionPreview = selectDefinitionPreview(payload?.definitions);

      return {
        date: dateKey,
        word,
        definitionPreview,
        total,
        digitalRoot: root,
        letterBreakdown: letters,
        sourceUrl: `https://www.wordnik.com/words/${encodeURIComponent(word)}`,
      };
    },
  });

  await logRequestAudit(sql, source, {
    route: 'wordnikWordOfDay',
    action: 'lookup',
    outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    metadata: { date: dateKey },
  });

  return cacheResult;
}

export default async function onRequest(request) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'wordnikWordOfDay' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(request, { sql });
    if (!user) {
      await applyRateLimit(sql, request, {
        scope: 'wordnikWordOfDay-ip',
        key: getClientIp(request),
        limit: 20,
        windowMs: 60_000,
        blockMs: 10 * 60_000,
        message: 'Too many Word of the Day lookups.',
      });
    }

    const cacheResult = await fetchWordOfDay(sql, request);
    return toResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=600',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return toResponse(getErrorStatusCode(error), { error: error.message }, error.headers || {});
  }
}

export async function handler(event) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'wordnikWordOfDay' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'wordnikWordOfDay-ip',
        key: getClientIp(event),
        limit: 20,
        windowMs: 60_000,
        blockMs: 10 * 60_000,
        message: 'Too many Word of the Day lookups.',
      });
    }

    const cacheResult = await fetchWordOfDay(sql, event);
    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=600',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(getErrorStatusCode(error), { error: error.message }, error.headers || {});
  }
}
