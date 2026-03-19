import { neon } from '@neondatabase/serverless';

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

function extractGematriaValue(source) {
  if (!source || typeof source !== 'object') {
    return null;
  }

  if ('queryStringParameters' in source) {
    return source.queryStringParameters?.gematria ?? null;
  }

  if ('rawUrl' in source && typeof source.rawUrl === 'string') {
    return new URL(source.rawUrl).searchParams.get('gematria');
  }

  return null;
}

async function searchByGematria(gematriaValue) {
  const normalizedValue = String(gematriaValue ?? '').trim();

  if (!normalizedValue) {
    throw new Error('Missing required query parameter: gematria');
  }

  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error('Gematria must be a positive integer.');
  }

  const sql = neon(process.env.DATABASE_URL);
  const words = await sql`
    SELECT word, gematria_value, digital_root, is_base_root, search_count
    FROM words
    WHERE gematria_value = ${Number(normalizedValue)}
    ORDER BY LOWER(word) ASC
  `;

  return {
    gematria: normalizedValue,
    count: words.length,
    words: words.map((row) => ({
      word: row.word,
      gematria: {
        total: String(row.gematria_value),
        digitalRoot: Number(row.digital_root),
      },
      isBaseRoot: Boolean(row.is_base_root),
      searchCount: Number(row.search_count),
    })),
  };
}

export default async function onRequest(request) {
  const gematriaValue = new URL(request.url).searchParams.get('gematria');

  try {
    const payload = await searchByGematria(gematriaValue);
    return toResponse(200, payload);
  } catch (error) {
    const statusCode = error.message.startsWith('Missing required') || error.message.includes('positive integer') ? 400 : 500;
    return toResponse(statusCode, { error: error.message });
  }
}

export async function handler(event) {
  const gematriaValue = extractGematriaValue(event);

  try {
    const payload = await searchByGematria(gematriaValue);
    return toNetlifyResponse(200, payload);
  } catch (error) {
    const statusCode = error.message.startsWith('Missing required') || error.message.includes('positive integer') ? 400 : 500;
    return toNetlifyResponse(statusCode, { error: error.message });
  }
}
