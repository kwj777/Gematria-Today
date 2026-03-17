import { neon } from '@neondatabase/serverless';

/**
 * Calculate base-6 English gematria for a word or phrase.
 *
 * English gematria mapping:
 * A=1, B=2, ..., Z=26
 *
 * Non-letter characters are ignored.
 *
 * @param {string} input - Word or phrase to evaluate.
 * @returns {string} Gematria score represented in base 6.
 * @throws {TypeError} If input is not a string.
 */
export function englishGematria(input) {
  if (typeof input !== 'string') {
    throw new TypeError('englishGematria expects a string input');
  }

  let total = 0;

  for (const char of input.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      total += (code - 64) * 6;
    }
  }

  return total.toString();
}

/**
 * Calculate the digital root for a positive integer.
 *
 * @param {number} value - Value to reduce.
 * @returns {number} Single-digit digital root.
 */
export function digitalRoot(value) {
  let root = Math.abs(Math.trunc(value));

  while (root >= 10) {
    root = String(root)
      .split('')
      .reduce((sum, digit) => sum + Number(digit), 0);
  }

  return root;
}

/**
 * Calculate English gematria details for a word or phrase.
 *
 * @param {string} input - Word or phrase to evaluate.
 * @returns {{ total: string, digitalRoot: number }} Total and digital root values.
 */
export function englishGematriaWithDigitalRoot(input) {
  const total = Number(englishGematria(input));

  return {
    total: total.toString(),
    digitalRoot: digitalRoot(total),
  };
}

function isBaseRootValue(gematriaTotal) {
  return Number(gematriaTotal) % 54 === 0;
}

async function processWord(word) {
  const sql = neon(process.env.DATABASE_URL);
  const trimmedWord = word.trim();
  const normalizedWord = trimmedWord.toLowerCase();
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

  if (result.length === 0) {
    throw new Error('Failed to retrieve or insert word.');
  }

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
}

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

/**
 * Handler for Netlify Functions v2 / edge-style runtimes.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export default async function onRequest(request) {
  const word = new URL(request.url).searchParams.get('word');

  if (!word) {
    return toResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    const payload = await processWord(word);
    return toResponse(200, payload);
  } catch (error) {
    return toResponse(500, { error: error.message });
 * @param {{ queryStringParameters?: Record<string, string>, rawUrl?: string } | Request} event
 * @returns {{ statusCode: number, headers: Record<string, string>, body: string }}
 */
function isBaseRootValue(gematriaTotal) {
  return Number(gematriaTotal) % 54 === 0;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

function extractWord(event) {
  if (event && typeof event === 'object') {
    if ('queryStringParameters' in event && event.queryStringParameters?.word) {
      return event.queryStringParameters.word;
    }

    if ('rawUrl' in event && typeof event.rawUrl === 'string') {
      return new URL(event.rawUrl).searchParams.get('word');
    }

    if ('url' in event && typeof event.url === 'string') {
      return new URL(event.url).searchParams.get('word');
    }
  }

  return null;
}

export async function handler(event) {
  const word = extractWord(event);

  if (!word) {
    return jsonResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const trimmedWord = word.trim();
    const normalizedWord = trimmedWord.toLowerCase();
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

    if (result.length === 0) {
      return jsonResponse(500, { error: 'Failed to retrieve or insert word.' });
    }

    const row = result[0];

    return jsonResponse(200, {
      word: row.word,
      gematria: {
        total: String(row.gematria_value),
        digitalRoot: Number(row.digital_root),
      },
      isBaseRoot: isBaseRootValue(row.gematria_value),
      searchCount: Number(row.search_count),
      source: row.source,
    });
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
}

/**
 * Backward-compatible Netlify Functions v1 handler.
 *
 * @param {{ queryStringParameters?: Record<string, string>, rawUrl?: string }} event
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function handler(event) {
  const word = extractWordFromEvent(event);

  if (!word) {
    return toNetlifyResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    const payload = await processWord(word);
    return toNetlifyResponse(200, payload);
  } catch (error) {
    return toNetlifyResponse(500, { error: error.message });
  }
}
