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

/**
 * HTTP handler for gematria requests.
 *
 * Expected query parameter: ?word=<text>
 *
 * @param {{ queryStringParameters?: Record<string, string>, rawUrl?: string } | Request} event
 * @returns {{ statusCode: number, headers: Record<string, string>, body: string }}
 */
function isBaseRootValue(gematriaTotal) {
  return Number(gematriaTotal) % 54 === 0;
}

export async function handler(request) {
  const url = new URL(request.url);
  const word = url.searchParams.get('word');

  if (!word) {
    return jsonResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const normalizedWord = word.trim().toLowerCase();

    const existing = await sql`
      SELECT word, gematria_value, digital_root, is_base_root, search_count
      FROM words
      WHERE LOWER(word) = ${normalizedWord}
      LIMIT 1
    `;

    if (existing.length > 0) {
      const row = existing[0];

      const updated = await sql`
        UPDATE words
        SET search_count = search_count + 1
        WHERE LOWER(word) = ${normalizedWord}
        RETURNING search_count
      `;

      return new Response(
        JSON.stringify({
          word: row.word,
          gematria: {
            total: String(row.gematria_value),
            digitalRoot: Number(row.digital_root),
          },
          isBaseRoot: isBaseRootValue(row.gematria_value),
          searchCount: Number(updated[0].search_count),
          source: 'database',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        },
      );
    }

    const gematria = englishGematriaWithDigitalRoot(word);
    const digitalRootValue = Number(gematria.digitalRoot);
    const isBaseRoot = isBaseRootValue(gematria.total);

    const inserted = await sql`
      INSERT INTO words (word, gematria_value, digital_root, is_base_root, search_count)
      VALUES (${word}, ${Number(gematria.total)}, ${digitalRootValue}, ${isBaseRoot}, 1)
      RETURNING search_count
    `;

    return new Response(
      JSON.stringify({
        word,
        gematria,
        isBaseRoot,
        searchCount: Number(inserted[0].search_count),
        source: 'calculated',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}

export default handler;
