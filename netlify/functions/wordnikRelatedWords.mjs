import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, fetchWithTimeout, getClientIp, getProtectionConfig, logRequestAudit, withCachedJson } from './_security.mjs';

const WORDNIK_RELATIONSHIP_TYPES = 'synonym';
const DEFAULT_LIMIT_PER_RELATIONSHIP_TYPE = 250;
const MAX_LIMIT_PER_RELATIONSHIP_TYPE = 250;
const AUTHENTICATED_MAX_LIMIT_PER_RELATIONSHIP_TYPE = 1000;

function toResponse(statusCode, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function extractRequestOptionsFromEvent(event) {
  if (!event || typeof event !== 'object') return { term: null, limit: null };
  if ('queryStringParameters' in event) {
    return {
      term: event.queryStringParameters?.word ?? event.queryStringParameters?.phrase ?? null,
      limit: event.queryStringParameters?.limit ?? null,
    };
  }
  if ('rawUrl' in event && typeof event.rawUrl === 'string') {
    const searchParams = new URL(event.rawUrl).searchParams;
    return { term: searchParams.get('word') ?? searchParams.get('phrase'), limit: searchParams.get('limit') };
  }
  return { term: null, limit: null };
}

function parseLimit(limit, { isAuthenticated = false } = {}) {
  if (limit == null || limit === '') return DEFAULT_LIMIT_PER_RELATIONSHIP_TYPE;
  const parsedLimit = Number.parseInt(limit, 10);
  const maxLimit = isAuthenticated ? AUTHENTICATED_MAX_LIMIT_PER_RELATIONSHIP_TYPE : MAX_LIMIT_PER_RELATIONSHIP_TYPE;
  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) throw new Error('Query parameter "limit" must be a positive integer');
  if (parsedLimit > maxLimit) throw new Error(`Query parameter "limit" must not exceed ${maxLimit}`);
  return parsedLimit;
}

function buildWordnikUrl(term, limit) {
  const baseUrl = process.env.WORDNIK_BASE_URL;
  const apiKey = process.env.WORDNIK_API_KEY;
  if (!baseUrl) throw new Error('Missing WORDNIK_BASE_URL environment variable');
  if (!apiKey) throw new Error('Missing WORDNIK_API_KEY environment variable');
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const wordnikUrl = new URL(`${encodeURIComponent(term)}/relatedWords`, normalizedBaseUrl);
  wordnikUrl.searchParams.set('useCanonical', 'false');
  wordnikUrl.searchParams.set('relationshipTypes', WORDNIK_RELATIONSHIP_TYPES);
  wordnikUrl.searchParams.set('limitPerRelationshipType', String(limit));
  wordnikUrl.searchParams.set('api_key', apiKey);
  return wordnikUrl;
}

function getErrorStatusCode(error) {
  if (error.message?.startsWith('Missing required query parameter: word')) return 400;
  if (error.message?.startsWith('Query parameter "limit"')) return 400;
  if (error.message?.startsWith('Wordnik request failed')) return 502;
  return error.statusCode || 500;
}

async function fetchRelatedWords(sql, source, term, limit, { isAuthenticated = false } = {}) {
  const trimmedTerm = term.trim();
  const normalizedTerm = trimmedTerm.toLowerCase();
  if (!normalizedTerm) throw new Error('Missing required query parameter: word');
  const parsedLimit = parseLimit(limit, { isAuthenticated });

  const cacheResult = await withCachedJson(sql, {
    cacheKey: buildCacheKey({ route: 'wordnikRelatedWords', term: normalizedTerm, limit: parsedLimit }),
    route: 'wordnikRelatedWords',
    ttlSeconds: 600,
    compute: async () => {
      const url = buildWordnikUrl(normalizedTerm, parsedLimit);
      const response = await fetchWithTimeout(url, {}, getProtectionConfig().wordnikTimeoutMs);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Wordnik request failed with ${response.status}: ${errorText || response.statusText}`);
      }
      const data = await response.json();
      return { query: trimmedTerm, limit: parsedLimit, url: url.toString(), data };
    },
  });

  await logRequestAudit(sql, source, {
    route: 'wordnikRelatedWords',
    action: 'lookup',
    outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    metadata: { term: normalizedTerm, limit: parsedLimit },
  });

  return cacheResult;
}

export default async function onRequest(request) {
  const searchParams = new URL(request.url).searchParams;
  const term = searchParams.get('word') ?? searchParams.get('phrase');
  const limit = searchParams.get('limit');
  if (!term?.trim()) return toResponse(400, { error: 'Missing required query parameter: word' });

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'wordnikRelatedWords' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(request, { sql });
    if (!user) {
      await applyRateLimit(sql, request, {
        scope: 'wordnikRelatedWords-ip',
        key: getClientIp(request),
        limit: 20,
        windowMs: 60_000,
        blockMs: 10 * 60_000,
        message: 'Too many related-word lookups.',
      });
    }
    const cacheResult = await fetchRelatedWords(sql, request, term, limit, { isAuthenticated: Boolean(user) });
    return toResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=600, stale-while-revalidate=120',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return toResponse(getErrorStatusCode(error), { error: error.message }, error.headers || {});
  }
}

export async function handler(event) {
  const { term, limit } = extractRequestOptionsFromEvent(event);
  if (!term?.trim()) return jsonResponse(400, { error: 'Missing required query parameter: word' });

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'wordnikRelatedWords' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'wordnikRelatedWords-ip',
        key: getClientIp(event),
        limit: 20,
        windowMs: 60_000,
        blockMs: 10 * 60_000,
        message: 'Too many related-word lookups.',
      });
    }
    const cacheResult = await fetchRelatedWords(sql, event, term, limit, { isAuthenticated: Boolean(user) });
    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=600, stale-while-revalidate=120',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(getErrorStatusCode(error), { error: error.message }, error.headers || {});
  }
}
