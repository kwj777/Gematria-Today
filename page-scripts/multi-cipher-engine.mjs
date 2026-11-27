// Pure functions for the seven canonical English gematria ciphers.
// Used by the multi-cipher calculator page and by unit tests.

const A_CODE = 65;
const Z_CODE = 90;

function ordinalValue(index1to26) {
  return index1to26;
}

function reverseOrdinalValue(index1to26) {
  return 27 - index1to26;
}

function fullReductionValue(index1to26) {
  // Pythagorean reduction: digital root of the ordinal value,
  // which yields 1..9 cycling across the alphabet.
  const mod = index1to26 % 9;
  return mod === 0 ? 9 : mod;
}

function reverseFullReductionValue(index1to26) {
  return fullReductionValue(reverseOrdinalValue(index1to26));
}

function sumerianValue(index1to26) {
  return index1to26 * 6;
}

function reverseSumerianValue(index1to26) {
  return reverseOrdinalValue(index1to26) * 6;
}

// Standard Jewish/Latin (also called English Extended):
// A-I = 1..9, J-R = 10,20,..,90, S-Z = 100,200,..,800.
const JEWISH_LATIN_TABLE = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 20, 30, 40, 50, 60, 70, 80, 90,
  100, 200, 300, 400, 500, 600, 700, 800,
];

function jewishLatinValue(index1to26) {
  return JEWISH_LATIN_TABLE[index1to26 - 1];
}

// blogSlug points at the matching post in the "English Gematria Cipher Atlas"
// series. Reverse Sumerian has no dedicated post and shares the English
// Sumerian post (same ×6 family).
export const CIPHERS = [
  { id: 'english-ordinal', name: 'English Ordinal', valueFor: ordinalValue,
    description: 'A=1, B=2, … Z=26.',
    blogSlug: 'english-gematria-cipher-atlas-simple-ordinal' },
  { id: 'reverse-ordinal', name: 'Reverse Ordinal', valueFor: reverseOrdinalValue,
    description: 'A=26, B=25, … Z=1.',
    blogSlug: 'english-gematria-cipher-atlas-reverse-ordinal' },
  { id: 'full-reduction', name: 'Full Reduction (Pythagorean)', valueFor: fullReductionValue,
    description: 'Ordinal reduced to a single digit (1..9 cycling).',
    blogSlug: 'english-gematria-cipher-atlas-full-reduction' },
  { id: 'reverse-full-reduction', name: 'Reverse Full Reduction', valueFor: reverseFullReductionValue,
    description: 'Reverse ordinal reduced to a single digit.',
    blogSlug: 'english-gematria-cipher-atlas-reverse-full-reduction' },
  { id: 'sumerian', name: 'Sumerian', valueFor: sumerianValue,
    description: 'Ordinal × 6 (matches the site’s default cipher).',
    blogSlug: 'english-gematria-cipher-atlas-english-sumerian' },
  { id: 'reverse-sumerian', name: 'Reverse Sumerian', valueFor: reverseSumerianValue,
    description: 'Reverse ordinal × 6.',
    blogSlug: 'english-gematria-cipher-atlas-english-sumerian' },
  { id: 'jewish-latin', name: 'Jewish / Latin', valueFor: jewishLatinValue,
    description: 'A-I = 1..9, J-R = 10..90, S-Z = 100..800.',
    blogSlug: 'english-gematria-cipher-atlas-jewish-latin' },
];

export function blogUrlForCipher(cipherId) {
  const cipher = CIPHERS.find((c) => c.id === cipherId);
  if (!cipher || !cipher.blogSlug) return null;
  return `/blog/${cipher.blogSlug}`;
}

export function digitalRoot(value) {
  let root = Math.abs(Math.trunc(value));
  while (root >= 10) {
    root = String(root).split('').reduce((sum, d) => sum + Number(d), 0);
  }
  return root;
}

function lettersOf(input) {
  if (typeof input !== 'string') {
    throw new TypeError('multi-cipher engine expects a string input');
  }
  // Same normalization as englishGematria() on the server: NFKC folds
  // ligatures, full-width letters and the Kelvin sign into plain letters and
  // composes accents onto their base letter, then only ASCII A-Z counts. Raw
  // upper-casing scored a decomposed "José" differently from a precomposed one
  // and turned ß into SS.
  const letters = [];
  for (const char of input.normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code >= A_CODE && code <= Z_CODE) letters.push({ letter: char, index: code - A_CODE + 1 });
  }
  return letters;
}

export function calculateCipher(input, cipherId) {
  const cipher = CIPHERS.find((c) => c.id === cipherId);
  if (!cipher) throw new Error(`Unknown cipher: ${cipherId}`);
  const letters = lettersOf(input);
  let total = 0;
  const perLetter = letters.map(({ letter, index }) => {
    const value = cipher.valueFor(index);
    total += value;
    return { letter, value };
  });
  return {
    cipherId: cipher.id,
    cipherName: cipher.name,
    total,
    digitalRoot: digitalRoot(total),
    letterCount: letters.length,
    perLetter,
  };
}

// Shape a result set into the payload format expected by the
// /api/member-history endpoint. The site's existing schema has typed
// columns for a single cipher (Sumerian), plus a flexible result_payload
// jsonb column that can hold all seven cipher values for later display.
export function buildSearchPayload({ query, mode, cipherId, allResults }) {
  const sumerian = allResults.find((r) => r.cipherId === 'sumerian');
  const sumerianTotal = sumerian ? sumerian.total : 0;
  const sumerianDigitalRoot = sumerian ? sumerian.digitalRoot : 0;
  // Mirrors englishGematria.mjs: (total - 6) % 54 === 0 marks a base-root value.
  const isBaseRoot = sumerianTotal > 0 && (sumerianTotal - 6) % 54 === 0;
  const ciphers = allResults.map(({ cipherId: id, cipherName, total, digitalRoot, letterCount }) => ({
    cipherId: id, cipherName, total, digitalRoot, letterCount,
  }));
  return {
    queryText: query,
    queryType: 'word',
    calculatorSource: 'multi-cipher-calculator',
    gematriaTotal: sumerianTotal,
    digitalRoot: sumerianDigitalRoot,
    isBaseRoot,
    resultPayload: {
      mode,
      selectedCipherId: mode === 'single' ? cipherId : null,
      ciphers,
    },
  };
}

export function calculateAllCiphers(input) {
  const letters = lettersOf(input);
  return CIPHERS.map((cipher) => {
    let total = 0;
    const perLetter = letters.map(({ letter, index }) => {
      const value = cipher.valueFor(index);
      total += value;
      return { letter, value };
    });
    return {
      cipherId: cipher.id,
      cipherName: cipher.name,
      description: cipher.description,
      total,
      digitalRoot: digitalRoot(total),
      letterCount: letters.length,
      perLetter,
    };
  });
}
