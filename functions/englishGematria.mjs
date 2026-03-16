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
      total += code - 64;
    }
  }

  return total.toString(6);
}

/**
 * HTTP handler for gematria requests.
 *
 * Expected query parameter: ?word=<text>
 *
 * @param {Request} request
 * @returns {Response}
 */
export function handler(request) {
  const url = new URL(request.url);
  const word = url.searchParams.get('word');

  if (!word) {
    return new Response(
      JSON.stringify({ error: 'Missing required query parameter: word' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }

  const gematria = englishGematria(word);

  return new Response(JSON.stringify({ word, gematria }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default handler;
