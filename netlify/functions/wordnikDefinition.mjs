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

function extractWordFromEvent(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  if ('queryStringParameters' in event) {
    return event.queryStringParameters?.word ?? null;
  }

  if ('rawUrl' in event && typeof event.rawUrl === 'string') {
    return new URL(event.rawUrl).searchParams.get('word');
  }

  return null;
}

function buildWordnikDefinitionUrl(word) {
  const baseUrl = process.env.WORDNIK_URL_BASE;
  const apiKey = process.env.WORDNIK_API_KEY;

  if (!baseUrl) {
    throw new Error('Missing WORDNIK_URL_BASE environment variable');
  }

  if (!apiKey) {
    throw new Error('Missing WORDNIK_API_KEY environment variable');
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(`${encodeURIComponent(word)}/definitions`, normalizedBaseUrl);
  url.searchParams.set('api_key', apiKey);

  return url;
}

function getStatusCode(error) {
  if (error.message?.startsWith('Missing required query parameter: word')) {
    return 400;
  }

  if (error.message?.startsWith('Missing WORDNIK_')) {
    return 500;
  }

  if (error.message?.startsWith('Wordnik request failed')) {
    return 502;
  }

  return 500;
}

async function fetchDefinition(word) {
  const trimmedWord = String(word ?? '').trim();

  if (!trimmedWord) {
    throw new Error('Missing required query parameter: word');
  }

  const url = buildWordnikDefinitionUrl(trimmedWord);
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wordnik request failed with ${response.status}: ${errorText || response.statusText}`);
  }

  return {
    word: trimmedWord,
    url: url.toString(),
    definitions: await response.json(),
  };
}

export default async function onRequest(request) {
  const word = new URL(request.url).searchParams.get('word');

  if (!word?.trim()) {
    return toResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    const payload = await fetchDefinition(word);
    return toResponse(200, payload);
  } catch (error) {
    return toResponse(getStatusCode(error), { error: error.message });
  }
}

export async function handler(event) {
  const word = extractWordFromEvent(event);

  if (!word?.trim()) {
    return toNetlifyResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    const payload = await fetchDefinition(word);
    return toNetlifyResponse(200, payload);
  } catch (error) {
    return toNetlifyResponse(getStatusCode(error), { error: error.message });
  }
}
