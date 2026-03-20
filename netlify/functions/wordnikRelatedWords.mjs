const WORDNIK_RELATIONSHIP_TYPES = 'synonym';
const DEFAULT_LIMIT_PER_RELATIONSHIP_TYPE = 10;
const MAX_LIMIT_PER_RELATIONSHIP_TYPE = 1000;

function toResponse(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function toNetlifyResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

function extractRequestOptionsFromEvent(event) {
  if (!event || typeof event !== 'object') {
    return { term: null, limit: null };
  }

  if ('queryStringParameters' in event) {
    return {
      term: event.queryStringParameters?.word ?? event.queryStringParameters?.phrase ?? null,
      limit: event.queryStringParameters?.limit ?? null,
    };
  }

  if ('rawUrl' in event && typeof event.rawUrl === 'string') {
    const searchParams = new URL(event.rawUrl).searchParams;
    return {
      term: searchParams.get('word') ?? searchParams.get('phrase'),
      limit: searchParams.get('limit'),
    };
  }

  return { term: null, limit: null };
}

function parseLimit(limit) {
  if (limit == null || limit === '') {
    return DEFAULT_LIMIT_PER_RELATIONSHIP_TYPE;
  }

  const parsedLimit = Number.parseInt(limit, 10);

  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    throw new Error('Query parameter "limit" must be a positive integer');
  }

  if (parsedLimit > MAX_LIMIT_PER_RELATIONSHIP_TYPE) {
    throw new Error(`Query parameter "limit" must not exceed ${MAX_LIMIT_PER_RELATIONSHIP_TYPE}`);
  }

  return parsedLimit;
}

function buildWordnikUrl(term, limit) {
  const baseUrl = process.env.WORDNIK_BASE_URL;
  const apiKey = process.env.WORDNIK_API_KEY;

  if (!baseUrl) {
    throw new Error('Missing WORDNIK_BASE_URL environment variable');
  }

  if (!apiKey) {
    throw new Error('Missing WORDNIK_API_KEY environment variable');
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const wordnikUrl = new URL(`${encodeURIComponent(term)}/relatedWords`, normalizedBaseUrl);

  wordnikUrl.searchParams.set('useCanonical', 'false');
  wordnikUrl.searchParams.set('relationshipTypes', WORDNIK_RELATIONSHIP_TYPES);
  wordnikUrl.searchParams.set('limitPerRelationshipType', String(limit));
  wordnikUrl.searchParams.set('api_key', apiKey);

  return wordnikUrl;
}

function getErrorStatusCode(error) {
  if (error.message?.startsWith('Missing required query parameter: word')) {
    return 400;
  }

  if (error.message?.startsWith('Query parameter "limit"')) {
    return 400;
  }

  return 500;
}

async function fetchRelatedWords(term, limit) {
  const trimmedTerm = term.trim();
  const normalizedTerm = trimmedTerm.toLowerCase();

  if (!normalizedTerm) {
    throw new Error('Missing required query parameter: word');
  }

  const parsedLimit = parseLimit(limit);
  const url = buildWordnikUrl(normalizedTerm, parsedLimit);
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wordnik request failed with ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();

  return {
    query: trimmedTerm,
    limit: parsedLimit,
    url: url.toString(),
    data,
  };
}

export default async function onRequest(request) {
  const searchParams = new URL(request.url).searchParams;
  const term = searchParams.get('word') ?? searchParams.get('phrase');
  const limit = searchParams.get('limit');

  if (!term?.trim()) {
    return toResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    const payload = await fetchRelatedWords(term, limit);
    return toResponse(200, payload);
  } catch (error) {
    return toResponse(getErrorStatusCode(error), { error: error.message });
  }
}

export async function handler(event) {
  const { term, limit } = extractRequestOptionsFromEvent(event);

  if (!term?.trim()) {
    return toNetlifyResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    const payload = await fetchRelatedWords(term, limit);
    return toNetlifyResponse(200, payload);
  } catch (error) {
    return toNetlifyResponse(getErrorStatusCode(error), { error: error.message });
  }
}
