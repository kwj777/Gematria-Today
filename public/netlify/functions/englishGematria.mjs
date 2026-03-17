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
 * Determine whether a gematria total is a base-root value.
 *
 * A value is considered a base root when it is evenly divisible by 54.
 *
 * @param {number|string} gematriaTotal - Gematria total to check.
 * @returns {boolean} True when the total is a base-root value.
 */
export function isBaseRootValue(gematriaTotal) {
  return Number(gematriaTotal) % 54 === 0;
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

  const gematria = englishGematriaWithDigitalRoot(word);

  return new Response(
    JSON.stringify({ word, gematria, isBaseRoot: isBaseRootValue(gematria.total) }),
    {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    },
  );
}

export default handler;
