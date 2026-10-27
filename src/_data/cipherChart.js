// The A-Z chart and worked examples for gematria-cipher-chart.html, generated
// at build time from the multi-cipher calculator's own engine
// (page-scripts/multi-cipher-engine.mjs). No letter value, total or number in
// that page's prose is typed by hand: each comes from here, and
// tests/gematria-cipher-chart-page.test.mjs renders the page and checks every
// cell against the engine again.
//
// The site's main calculator does not use the engine; it uses englishGematria()
// (mirrored in og-meta.mjs). The page says the calculator's cipher is the
// engine's Sumerian column, so the build fails if the two ever disagree.
import { CIPHERS, calculateAllCiphers, calculateCipher, blogUrlForCipher, digitalRoot } from '../../page-scripts/multi-cipher-engine.mjs';
import { englishGematria } from '../../netlify/edge-functions/lib/og-meta.mjs';

const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const SITE_CIPHER_ID = 'sumerian';
// One word run through every cipher, two words compared across them, and two
// words that share an English Ordinal total but not a Full Reduction one.
const EXAMPLE_WORD = 'CIPHER';
const PAIR = ['FAITH', 'HOPE'];
const ORDINAL_TWINS = ['ENGLISH', 'JESUS'];

// Page-only labels: the section anchor, a column header short enough for a
// phone, and the matching glossary entry with the term the glossary files it
// under (the link text names it, so each link says where it goes). Everything
// else comes from the engine. A cipher added to the engine without a label
// here stops the build, so the page cannot silently drop a column.
const PAGE_LABELS = {
  'english-ordinal': { anchor: 'english-ordinal', column: 'Ordinal', glossary: '/definitions.html#defn-english-ordinal-simple-english-gematria', glossaryTerm: 'English Ordinal' },
  'reverse-ordinal': { anchor: 'reverse-ordinal', column: 'Reverse Ordinal', glossary: '/definitions.html#defn-reverse-ordinal', glossaryTerm: 'Reverse Ordinal' },
  'full-reduction': { anchor: 'full-reduction', column: 'Full Reduction', glossary: '/definitions.html#defn-reduction-pythagorean', glossaryTerm: 'Reduction (Pythagorean)' },
  'reverse-full-reduction': { anchor: 'reverse-full-reduction', column: 'Reverse Full Reduction', glossary: '/definitions.html#defn-reverse-reduction', glossaryTerm: 'Reverse Reduction' },
  sumerian: { anchor: 'sumerian', column: 'Sumerian', glossary: '/definitions.html#defn-english-gematria-multiples-of-six', glossaryTerm: 'English Gematria (multiples of six)' },
  'reverse-sumerian': { anchor: 'reverse-sumerian', column: 'Reverse Sumerian', glossary: null, glossaryTerm: null },
  'jewish-latin': { anchor: 'jewish-latin', column: 'Jewish / Latin', glossary: null, glossaryTerm: null },
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function fail(message) {
  throw new Error(`cipherChart: ${message}`);
}

function numberWord(n) {
  if (!NUMBER_WORDS[n]) fail(`no word for ${n}`);
  return NUMBER_WORDS[n];
}

const sum = (numbers) => numbers.reduce((total, n) => total + n, 0);
const valueOf = (letter, cipherId) => calculateCipher(letter, cipherId).total;
const lettersBetween = (first, last) => LETTERS.slice(LETTERS.indexOf(first), LETTERS.indexOf(last) + 1);
const lettersWhere = (cipherId, predicate) => LETTERS.filter((letter) => predicate(valueOf(letter, cipherId)));

// "A, J and S" -- for prose that names a short list.
function listOf(items, conjunction = 'and') {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

// The one value f(letter) gives for every letter; fails if letters disagree.
function constant(label, f) {
  const seen = new Set(LETTERS.map(f));
  if (seen.size !== 1) fail(`${label} is not the same for every letter`);
  return [...seen][0];
}

// ---------- the chart ----------

const ciphers = CIPHERS.map((cipher) => {
  const labels = PAGE_LABELS[cipher.id];
  if (!labels) fail(`no page label for engine cipher ${cipher.id}`);
  const values = LETTERS.map((letter) => ({ letter, value: valueOf(letter, cipher.id) }));
  const numbers = values.map((entry) => entry.value);
  return {
    id: cipher.id,
    name: cipher.name,
    description: cipher.description,
    blogUrl: blogUrlForCipher(cipher.id),
    ...labels,
    isSiteCipher: cipher.id === SITE_CIPHER_ID,
    values,
    first: numbers[0],
    last: numbers[numbers.length - 1],
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    alphabetTotal: sum(numbers),
    distinctValues: new Set(numbers).size,
  };
});

const byId = Object.fromEntries(ciphers.map((cipher) => [cipher.id, cipher]));
for (const id of Object.keys(PAGE_LABELS)) {
  if (!byId[id]) fail(`page label ${id} has no engine cipher`);
}

// Which cipher each Cipher Atlas link is about. Reverse Sumerian has no post of
// its own and shares the Sumerian one, so its link is named for Sumerian rather
// than promising a post on Reverse Sumerian that does not exist.
for (const cipher of ciphers) {
  if (!cipher.blogUrl) fail(`${cipher.id} has no Cipher Atlas post`);
  const owner = ciphers.find((other) => other.blogUrl === cipher.blogUrl);
  cipher.atlasTopic = owner.name;
  cipher.hasOwnAtlasPost = owner === cipher;
}
// The series starts with the English Ordinal post (Simple Ordinal, post 1 of
// 8). blog.html has no series filter, so links to the series go there.
const atlas = { firstPostUrl: byId['english-ordinal'].blogUrl };

// The main calculator's cipher must be the Sumerian column, letter by letter.
for (const letter of LETTERS) {
  if (Number(englishGematria(letter)) !== valueOf(letter, SITE_CIPHER_ID)) {
    fail(`englishGematria(${letter}) disagrees with the engine's ${SITE_CIPHER_ID} value`);
  }
}

const rows = LETTERS.map((letter, index) => ({
  letter,
  position: index + 1,
  values: ciphers.map((cipher) => ({ cipherId: cipher.id, value: cipher.values[index].value, isSiteCipher: cipher.isSiteCipher })),
}));

// ---------- facts the prose quotes ----------

// Every multiple of six up to a generous bound, reduced to one digit.
const siteDigitalRoots = [...new Set(Array.from({ length: 5000 }, (_, k) => digitalRoot(6 * (k + 1))))].sort((a, b) => a - b);

// A letter's Full Reduction and Reverse Full Reduction values add to 9,
// except for the letters that are 9 in both.
const reductionPairs = LETTERS.map((letter) => ({ letter, total: valueOf(letter, 'full-reduction') + valueOf(letter, 'reverse-full-reduction') }));
const reductionPairTotals = [...new Set(reductionPairs.map((pair) => pair.total))].sort((a, b) => a - b);
if (reductionPairTotals.length !== 2) fail('Full Reduction + Reverse Full Reduction takes more than two values');
const reductionPairExceptions = reductionPairs.filter((pair) => pair.total !== reductionPairTotals[0]).map((pair) => pair.letter);

// How many letters share each Reverse Full Reduction digit.
const reverseReductionCounts = new Map();
for (const letter of LETTERS) {
  const value = valueOf(letter, 'reverse-full-reduction');
  reverseReductionCounts.set(value, (reverseReductionCounts.get(value) || 0) + 1);
}
const reverseReductionTop = Math.max(...reverseReductionCounts.keys());
const reverseReductionLower = [...reverseReductionCounts.keys()].filter((value) => value !== reverseReductionTop).sort((a, b) => a - b);
const lettersPerLowerDigit = new Set(reverseReductionLower.map((value) => reverseReductionCounts.get(value)));
if (lettersPerLowerDigit.size !== 1) fail('Reverse Full Reduction digits below the top one do not share a letter count');

// Jewish / Latin in bands of equal digit count: 1-9, 10-90, 100-800.
const jewishLatinBands = [];
for (const letter of LETTERS) {
  const value = valueOf(letter, 'jewish-latin');
  const band = jewishLatinBands[jewishLatinBands.length - 1];
  if (band && String(band.high).length === String(value).length) {
    band.to = letter;
    band.high = value;
  } else {
    jewishLatinBands.push({ from: letter, to: letter, low: value, high: value });
  }
}
if (jewishLatinBands.length !== 3) fail('Jewish / Latin no longer has three bands');
const jewishLatin = (letter) => valueOf(letter, 'jewish-latin');

// What each reduction takes off the cipher it reduces, letter by letter: 0 for
// one run of letters, 9 for the next and 18 for the last. So Full Reduction is
// the English Ordinal total minus 9 for each letter from J to R and 18 for each
// from S to Z, and Reverse Full Reduction does the same to Reverse Ordinal.
function reductionLoss(reducedId, baseId) {
  const bands = [];
  for (const letter of LETTERS) {
    const loss = valueOf(letter, baseId) - valueOf(letter, reducedId);
    const band = bands[bands.length - 1];
    if (band && band.loss === loss) band.to = letter;
    else bands.push({ from: letter, to: letter, loss });
  }
  const [none, small, large] = [...bands].sort((a, b) => a.loss - b.loss);
  if (bands.length !== 3 || none.loss !== 0 || large.loss !== 2 * small.loss) {
    fail(`${reducedId} does not take 0, k and 2k off ${baseId} in three runs of letters`);
  }
  return { small, large };
}
const fullReductionLoss = reductionLoss('full-reduction', 'english-ordinal');
const reverseReductionLoss = reductionLoss('reverse-full-reduction', 'reverse-ordinal');
if (fullReductionLoss.small.loss !== reverseReductionLoss.small.loss) fail('the two reductions take off different steps');

const facts = {
  cipherCount: ciphers.length,
  cipherCountWord: numberWord(ciphers.length),
  letterCount: LETTERS.length,
  // English Ordinal + Reverse Ordinal, and Sumerian + Reverse Sumerian, for any one letter.
  mirrorTotal: constant('Ordinal + Reverse Ordinal', (letter) => valueOf(letter, 'english-ordinal') + valueOf(letter, 'reverse-ordinal')),
  sumerianMirrorTotal: constant('Sumerian + Reverse Sumerian', (letter) => valueOf(letter, 'sumerian') + valueOf(letter, 'reverse-sumerian')),
  // Sumerian / Ordinal, and Reverse Sumerian / Reverse Ordinal.
  sumerianFactor: constant('Sumerian / Ordinal', (letter) => valueOf(letter, 'sumerian') / valueOf(letter, 'english-ordinal')),
  reverseSumerianFactor: constant('Reverse Sumerian / Reverse Ordinal', (letter) => valueOf(letter, 'reverse-sumerian') / valueOf(letter, 'reverse-ordinal')),
  siteDigitalRoots: listOf(siteDigitalRoots.map(String), 'or'),
  reductionOnes: listOf(lettersWhere('full-reduction', (value) => value === 1)),
  reductionNines: listOf(lettersWhere('full-reduction', (value) => value === byId['full-reduction'].max)),
  reductionZ: valueOf('Z', 'full-reduction'),
  reductionPairTotal: reductionPairTotals[0],
  reductionPairExceptions: listOf(reductionPairExceptions),
  reductionPairExtra: reductionPairTotals[1] - reductionPairTotals[0],
  reverseReductionTop,
  reverseReductionTopLetters: listOf(lettersWhere('reverse-full-reduction', (value) => value === reverseReductionTop)),
  reverseReductionTopCountWord: numberWord(reverseReductionCounts.get(reverseReductionTop)),
  reverseReductionLowerFirst: reverseReductionLower[0],
  reverseReductionLowerLast: reverseReductionLower[reverseReductionLower.length - 1],
  reverseReductionLowerCountWord: numberWord([...lettersPerLowerDigit][0]),
  jewishLatinBands,
  jewishLatinZ: jewishLatin('Z'),
  jewishLatinS: jewishLatin('S'),
  jewishLatinAtoI: sum(lettersBetween('A', 'I').map(jewishLatin)),
  jewishLatinAtoR: sum(lettersBetween('A', 'R').map(jewishLatin)),
  fullReductionLoss,
  reverseReductionLoss,
};
// A Sumerian total of 666 needs an English Ordinal total of 666 / 6.
facts.ordinalFor666 = 666 / facts.sumerianFactor;
if (!Number.isInteger(facts.ordinalFor666)) fail('666 is not a whole multiple of the Sumerian factor');

// ---------- words run through every cipher ----------

function wordProfile(word) {
  const results = calculateAllCiphers(word);
  return {
    word,
    lowercase: word.toLowerCase(),
    letterCount: results[0].letterCount,
    results: results.map((result) => ({
      ...result,
      anchor: byId[result.cipherId].anchor,
      breakdown: result.perLetter.map((entry) => entry.value).join(' + '),
    })),
    total: Object.fromEntries(results.map((result) => [result.cipherId, result.total])),
    root: Object.fromEntries(results.map((result) => [result.cipherId, result.digitalRoot])),
  };
}

const exampleProfile = wordProfile(EXAMPLE_WORD);
const exampleExtras = [...EXAMPLE_WORD].filter((letter) => reductionPairExceptions.includes(letter)).length;
const example = {
  ...exampleProfile,
  letters: [...EXAMPLE_WORD].join(' '),
  siteTotal: Number(englishGematria(EXAMPLE_WORD)),
  mirrorSum: exampleProfile.total['english-ordinal'] + exampleProfile.total['reverse-ordinal'],
  reductionExceptionCount: exampleExtras,
  // Reverse Full Reduction from Full Reduction, the letter count and the I's and R's.
  reverseReductionFromFull: facts.reductionPairTotal * exampleProfile.letterCount
    - exampleProfile.total['full-reduction']
    + facts.reductionPairExtra * exampleExtras,
};
if (example.siteTotal !== example.total.sumerian) fail('the main calculator and the engine disagree on the example word');
if (example.mirrorSum !== facts.mirrorTotal * example.letterCount) fail('Ordinal + Reverse Ordinal identity fails for the example word');
if (example.reverseReductionFromFull !== example.total['reverse-full-reduction']) fail('Reverse Full Reduction identity fails for the example word');

// Two words compared across every cipher.
const [pairFirst, pairSecond] = PAIR.map(wordProfile);
const pairRows = ciphers.map((cipher) => ({
  id: cipher.id,
  name: cipher.name,
  column: cipher.column,
  anchor: cipher.anchor,
  first: pairFirst.total[cipher.id],
  second: pairSecond.total[cipher.id],
  match: pairFirst.total[cipher.id] === pairSecond.total[cipher.id],
}));
// A Sumerian match is the English Ordinal match times six, and a Reverse
// Sumerian match the Reverse Ordinal one; neither is a separate fact.
const IMPLIED_BY = { sumerian: 'english-ordinal', 'reverse-sumerian': 'reverse-ordinal' };
// A Full Reduction match is not certain once the English Ordinal totals are
// level, but it is far more likely than between unrelated words: the two
// Full Reduction totals then differ only by what each word loses (see
// reductionLoss above), and they always share a digital root. So it is weak
// support, not a second source -- the Cipher Atlas's Full Reduction post says
// the same. Reverse Full Reduction stands to Reverse Ordinal the same way.
const SUPPORTED_BY = { 'full-reduction': 'english-ordinal', 'reverse-full-reduction': 'reverse-ordinal' };
const pairMatches = new Set(pairRows.filter((row) => row.match).map((row) => row.id));
const pairIndependent = [...pairMatches].filter((id) => !pairMatches.has(IMPLIED_BY[id]) && !pairMatches.has(SUPPORTED_BY[id]));
const pairWeak = [...pairMatches].filter((id) => pairMatches.has(SUPPORTED_BY[id]));
// The page's conclusion reads "one fact plus weak support"; a different pair
// would need different prose.
if (pairIndependent.length !== 1 || pairWeak.length !== 1 || !pairWeak.includes('full-reduction')) {
  fail(`the pair paragraph assumes one independent match plus a Full Reduction one, got ${pairIndependent} and ${pairWeak}`);
}
const pairLoss = [pairFirst, pairSecond].map((profile) => profile.total['english-ordinal'] - profile.total['full-reduction']);
if (pairLoss[0] !== pairLoss[1]) fail('the pair match in Full Reduction but lose different amounts');
const pair = {
  first: { word: pairFirst.word, lowercase: pairFirst.lowercase, letterCount: pairFirst.letterCount },
  second: { word: pairSecond.word, lowercase: pairSecond.lowercase, letterCount: pairSecond.letterCount },
  rows: pairRows,
  matchCount: pairMatches.size,
  matchCountWord: numberWord(pairMatches.size),
  independentMatchCount: pairIndependent.length,
  independentMatchCountWord: numberWord(pairIndependent.length),
  // What both words lose between English Ordinal and Full Reduction.
  reductionLoss: pairLoss[0],
  matchList: listOf(pairRows.filter((row) => row.match).map((row) => row.column)),
  total: Object.fromEntries(pairRows.map((row) => [row.id, { first: row.first, second: row.second }])),
  reverseGap: Math.abs(pairFirst.total['reverse-ordinal'] - pairSecond.total['reverse-ordinal']),
  letterGap: Math.abs(pairFirst.letterCount - pairSecond.letterCount),
};

// Two words level in English Ordinal and apart in Full Reduction.
const [twinFirst, twinSecond] = ORDINAL_TWINS.map(wordProfile);
if (twinFirst.total['english-ordinal'] !== twinSecond.total['english-ordinal']) fail('the ordinal twins no longer share an Ordinal total');
const ordinalTwins = {
  first: twinFirst.word,
  second: twinSecond.word,
  ordinal: twinFirst.total['english-ordinal'],
  firstReduction: twinFirst.total['full-reduction'],
  secondReduction: twinSecond.total['full-reduction'],
};

export default {
  siteCipherId: SITE_CIPHER_ID,
  siteCipher: byId[SITE_CIPHER_ID],
  letters: LETTERS,
  ciphers,
  byId,
  rows,
  facts,
  example,
  pair,
  ordinalTwins,
  atlas,
};
