import { getSqlClient, jsonResponse } from './_auth.mjs';
import { getAuthenticatedMember } from './_member.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, fetchWithTimeout, getClientIp, getProtectionConfig, logRequestAudit, withCachedJson } from './_security.mjs';

export const DEFAULT_WORDNIK_RELATIONSHIP_TYPE = 'synonym';
export const ALLOWED_WORDNIK_RELATIONSHIP_TYPES = new Set([
  'antonym',
  'synonym',
  'equivalent',
  'cross-reference',
  'hypernym',
  'hyponym',
  'variant',
  'same-context',
]);
export const PREMIUM_LIMIT_PER_RELATIONSHIP_TYPE = 250;
export const FREE_LIMIT_PER_RELATIONSHIP_TYPE = 100;
const PREMIUM_TIERS = new Set(['premium', 'lifetime']);

function toResponse(statusCode, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

export function extractRequestOptionsFromEvent(event) {
  if (!event || typeof event !== 'object') return { term: null, limit: null, relationshipType: null };
  if ('queryStringParameters' in event) {
    return {
      term: event.queryStringParameters?.word ?? event.queryStringParameters?.phrase ?? null,
      limit: event.queryStringParameters?.limit ?? null,
      relationshipType: event.queryStringParameters?.relationshipType ?? null,
    };
  }
  if ('rawUrl' in event && typeof event.rawUrl === 'string') {
    const searchParams = new URL(event.rawUrl).searchParams;
    return {
      term: searchParams.get('word') ?? searchParams.get('phrase'),
      limit: searchParams.get('limit'),
      relationshipType: searchParams.get('relationshipType'),
    };
  }
  return { term: null, limit: null, relationshipType: null };
}

export function getTierLimit(membershipLevel) {
  return PREMIUM_TIERS.has(membershipLevel) ? PREMIUM_LIMIT_PER_RELATIONSHIP_TYPE : FREE_LIMIT_PER_RELATIONSHIP_TYPE;
}

export function parseLimit(limit, { membershipLevel } = {}) {
  const tierLimit = getTierLimit(membershipLevel);
  if (limit == null || limit === '') return tierLimit;
  const parsedLimit = Number.parseInt(limit, 10);
  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) throw new Error('Query parameter "limit" must be a positive integer');
  return Math.min(parsedLimit, tierLimit);
}

export function parseRelationshipType(relationshipType) {
  if (relationshipType == null || relationshipType === '') return DEFAULT_WORDNIK_RELATIONSHIP_TYPE;
  const parsedRelationshipType = String(relationshipType).trim().toLowerCase();
  if (!ALLOWED_WORDNIK_RELATIONSHIP_TYPES.has(parsedRelationshipType)) {
    throw new Error(`Query parameter "relationshipType" must be one of: ${Array.from(ALLOWED_WORDNIK_RELATIONSHIP_TYPES).join(', ')}`);
  }
  return parsedRelationshipType;
}

export function buildWordnikUrl(term, limit, relationshipType) {
  const baseUrl = process.env.WORDNIK_BASE_URL;
  const apiKey = process.env.WORDNIK_API_KEY;
  if (!baseUrl) throw new Error('Missing WORDNIK_BASE_URL environment variable');
  if (!apiKey) throw new Error('Missing WORDNIK_API_KEY environment variable');
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const wordnikUrl = new URL(`${encodeURIComponent(term)}/relatedWords`, normalizedBaseUrl);
  wordnikUrl.searchParams.set('useCanonical', 'false');
  wordnikUrl.searchParams.set('relationshipTypes', relationshipType);
  wordnikUrl.searchParams.set('limitPerRelationshipType', String(limit));
  wordnikUrl.searchParams.set('api_key', apiKey);
  return wordnikUrl;
}

export function getErrorStatusCode(error) {
  if (error.message?.startsWith('Missing required query parameter: word')) return 400;
  if (error.message?.startsWith('Query parameter "limit"')) return 400;
  if (error.message?.startsWith('Query parameter "relationshipType"')) return 400;
  if (error.message?.startsWith('Wordnik request failed')) return 502;
  if (error.statusCode) return error.statusCode;
  return 500;
}

async function fetchRelatedWords(sql, source, term, limit, relationshipType, { membershipLevel } = {}) {
  const trimmedTerm = term.trim();
  const normalizedTerm = trimmedTerm.toLowerCase();
  if (!normalizedTerm) throw new Error('Missing required query parameter: word');
  const parsedLimit = parseLimit(limit, { membershipLevel });
  const parsedRelationshipType = parseRelationshipType(relationshipType);

  const cacheResult = await withCachedJson(sql, {
    cacheKey: buildCacheKey({
      route: 'wordnikRelatedWords',
      term: normalizedTerm,
      limit: parsedLimit,
      relationshipType: parsedRelationshipType,
    }),
    route: 'wordnikRelatedWords',
    ttlSeconds: 600,
    compute: async () => {
      const url = buildWordnikUrl(normalizedTerm, parsedLimit, parsedRelationshipType);
      const response = await fetchWithTimeout(url, {}, getProtectionConfig().wordnikTimeoutMs);
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
          throw Object.assign(new Error("Wordnik's search came up empty."), { statusCode: 404 });
        }
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
      const data = await response.json();
      return { query: trimmedTerm, relationshipType: parsedRelationshipType, limit: parsedLimit, url: url.toString(), data };
    },
  });

  await logRequestAudit(sql, source, {
    route: 'wordnikRelatedWords',
    action: 'lookup',
    outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    metadata: { term: normalizedTerm, relationshipType: parsedRelationshipType, limit: parsedLimit },
  });

  return cacheResult;
}

export default async function onRequest(request) {
  const searchParams = new URL(request.url).searchParams;
  const term = searchParams.get('word') ?? searchParams.get('phrase');
  const limit = searchParams.get('limit');
  const relationshipType = searchParams.get('relationshipType');
  if (!term?.trim()) return toResponse(400, { error: 'Missing required query parameter: word' });

  try {
    assertEndpointEnabled({ publicRoute: false, expensive: true, route: 'wordnikRelatedWords' });
    const { sql, member } = await getAuthenticatedMember(request, { requireAuth: true });
    if (!member) throw Object.assign(new Error('Membership required for related-word lookups.'), { statusCode: 401 });
    await applyRateLimit(sql, request, {
      scope: 'wordnikRelatedWords-member',
      key: member.id || getClientIp(request),
      limit: 60,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many related-word lookups.',
    });
    const cacheResult = await fetchRelatedWords(sql, request, term, limit, relationshipType, { membershipLevel: member.membershipLevel });
    return toResponse(200, cacheResult.payload, {
      'cache-control': 'private, max-age=600',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return toResponse(getErrorStatusCode(error), { error: error.message }, error.headers || {});
  }
}

export async function handler(event) {
  const { term, limit, relationshipType } = extractRequestOptionsFromEvent(event);
  if (!term?.trim()) return jsonResponse(400, { error: 'Missing required query parameter: word' });

  try {
    assertEndpointEnabled({ publicRoute: false, expensive: true, route: 'wordnikRelatedWords' });
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    if (!member) throw Object.assign(new Error('Membership required for related-word lookups.'), { statusCode: 401 });
    await applyRateLimit(sql, event, {
      scope: 'wordnikRelatedWords-member',
      key: member.id || getClientIp(event),
      limit: 60,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many related-word lookups.',
    });
    const cacheResult = await fetchRelatedWords(sql, event, term, limit, relationshipType, { membershipLevel: member.membershipLevel });
    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'private, max-age=600',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(getErrorStatusCode(error), { error: error.message }, error.headers || {});
  }
}
