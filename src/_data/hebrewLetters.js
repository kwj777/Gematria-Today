// The 22 Hebrew letters, their five final forms and the worked examples for
// hebrew-gematria-chart.html. Every total that page shows is added up here,
// from the letter table below, at build time -- none is typed into the page --
// and tests/hebrew-gematria-chart-page.test.mjs adds each one up again.
//
// Values are the standard method, mispar hechrachi: aleph to tet are 1 to 9,
// yod to tsadi 10 to 90, qof to tav 100 to 400. A final form counts the same as
// its ordinary letter, except in mispar gadol, where the five finals continue
// past tav as 500 to 900.

const LETTERS = [
  { position: 1, char: 'א', name: 'Aleph', also: 'Alef', sound: 'silent; carries a vowel', value: 1 },
  { position: 2, char: 'ב', name: 'Bet', also: 'Beth, Vet', sound: 'b or v', value: 2 },
  { position: 3, char: 'ג', name: 'Gimel', also: 'Gimmel', sound: 'g', value: 3 },
  { position: 4, char: 'ד', name: 'Dalet', also: 'Daleth', sound: 'd', value: 4 },
  { position: 5, char: 'ה', name: 'He', also: 'Hei, Heh', sound: 'h', value: 5 },
  { position: 6, char: 'ו', name: 'Vav', also: 'Waw', sound: 'v; also the vowels o and u', value: 6 },
  { position: 7, char: 'ז', name: 'Zayin', also: '', sound: 'z', value: 7 },
  { position: 8, char: 'ח', name: 'Chet', also: 'Het, Heth', sound: 'ch, as in Bach', value: 8 },
  { position: 9, char: 'ט', name: 'Tet', also: 'Teth', sound: 't', value: 9 },
  { position: 10, char: 'י', name: 'Yod', also: 'Yud', sound: 'y; also the vowel i', value: 10 },
  { position: 11, char: 'כ', name: 'Kaf', also: 'Kaph, Khaf', sound: 'k or kh', value: 20 },
  { position: 12, char: 'ל', name: 'Lamed', also: 'Lamedh', sound: 'l', value: 30 },
  { position: 13, char: 'מ', name: 'Mem', also: '', sound: 'm', value: 40 },
  { position: 14, char: 'נ', name: 'Nun', also: '', sound: 'n', value: 50 },
  { position: 15, char: 'ס', name: 'Samekh', also: 'Samech', sound: 's', value: 60 },
  { position: 16, char: 'ע', name: 'Ayin', also: '', sound: 'silent; carries a vowel', value: 70 },
  { position: 17, char: 'פ', name: 'Pe', also: 'Peh, Fe', sound: 'p or f', value: 80 },
  { position: 18, char: 'צ', name: 'Tsadi', also: 'Tzadi, Tsade', sound: 'ts', value: 90 },
  { position: 19, char: 'ק', name: 'Qof', also: 'Kuf, Qoph', sound: 'k (often written q)', value: 100 },
  { position: 20, char: 'ר', name: 'Resh', also: '', sound: 'r', value: 200 },
  { position: 21, char: 'ש', name: 'Shin', also: 'Sin', sound: 'sh or s', value: 300 },
  { position: 22, char: 'ת', name: 'Tav', also: 'Taf, Taw', sound: 't', value: 400 },
];

// In alphabetical order of the letters they belong to, which is also the order
// mispar gadol counts them in.
const FINALS = [
  { char: 'ך', base: 'כ', name: 'Final kaf', sofit: 'kaf sofit', gadol: 500 },
  { char: 'ם', base: 'מ', name: 'Final mem', sofit: 'mem sofit', gadol: 600 },
  { char: 'ן', base: 'נ', name: 'Final nun', sofit: 'nun sofit', gadol: 700 },
  { char: 'ף', base: 'פ', name: 'Final pe', sofit: 'pe sofit', gadol: 800 },
  { char: 'ץ', base: 'צ', name: 'Final tsadi', sofit: 'tsadi sofit', gadol: 900 },
];

const BY_CHAR = new Map(LETTERS.map((letter) => [letter.char, letter]));
const FINAL_BY_CHAR = new Map(FINALS.map((final) => [final.char, final]));
const CHAR_FOR_VALUE = new Map(LETTERS.map((letter) => [letter.value, letter.char]));

const GERESH = '׳';
const GERSHAYIM = '״';

// One character's worth in a given method. Spaces and the numeral punctuation
// marks count for nothing; anything else that is not a Hebrew letter is a typo
// in this file, so it throws instead of quietly adding zero.
function charValue(char, method) {
  if (char === ' ' || char === GERESH || char === GERSHAYIM) return 0;
  const final = FINAL_BY_CHAR.get(char);
  const letter = final ? BY_CHAR.get(final.base) : BY_CHAR.get(char);
  if (!letter) throw new Error(`hebrewLetters: ${JSON.stringify(char)} is not a Hebrew letter`);
  switch (method) {
    case 'hechrachi':
      return letter.value;
    case 'gadol':
      return final ? final.gadol : letter.value;
    case 'katan': {
      let reduced = letter.value;
      while (reduced >= 10) reduced /= 10;
      return reduced;
    }
    case 'siduri':
      return letter.position;
    default:
      throw new Error(`hebrewLetters: unknown method ${method}`);
  }
}

function wordValue(word, method = 'hechrachi') {
  return [...word].reduce((total, char) => total + charValue(char, method), 0);
}

function charName(char) {
  return FINAL_BY_CHAR.get(char)?.name ?? BY_CHAR.get(char).name;
}

// "Chet 8 + Yod 10", in reading order (first letter first).
function breakdown(word, method = 'hechrachi') {
  return [...word]
    .filter((char) => char !== ' ' && char !== GERESH && char !== GERSHAYIM)
    .map((char) => `${charName(char)} ${charValue(char, method)}`)
    .join(' + ');
}

// The letters for 1-999, largest value first, with the 15/16 rule applied:
// 15 and 16 are tet-vav and tet-zayin, never yod-he and yod-vav.
function numeralLetters(number) {
  if (!Number.isInteger(number) || number < 1 || number > 999) throw new RangeError(`numeral out of range: ${number}`);
  let rest = number;
  let out = '';
  while (rest >= 400) {
    out += CHAR_FOR_VALUE.get(400);
    rest -= 400;
  }
  for (const hundred of [300, 200, 100]) {
    if (rest >= hundred) {
      out += CHAR_FOR_VALUE.get(hundred);
      rest -= hundred;
    }
  }
  if (rest === 15) return out + CHAR_FOR_VALUE.get(9) + CHAR_FOR_VALUE.get(6);
  if (rest === 16) return out + CHAR_FOR_VALUE.get(9) + CHAR_FOR_VALUE.get(7);
  const tens = rest - (rest % 10);
  if (tens) out += CHAR_FOR_VALUE.get(tens);
  if (rest % 10) out += CHAR_FOR_VALUE.get(rest % 10);
  return out;
}

// A geresh after a one-letter number, a gershayim before the last letter of a
// longer one.
function punctuate(letters) {
  return letters.length === 1 ? letters + GERESH : `${letters.slice(0, -1)}${GERSHAYIM}${letters.slice(-1)}`;
}

function hebrewNumeral(number) {
  return punctuate(numeralLetters(number));
}

// A Hebrew calendar year: the thousands as a units letter with a geresh, then
// the rest. Calendars often print only the part after the thousands.
function hebrewYear(year) {
  const thousands = Math.floor(year / 1000);
  return `${CHAR_FOR_VALUE.get(thousands)}${GERESH}${hebrewNumeral(year % 1000)}`;
}

const EXAMPLES = [
  { id: 'chai', word: 'חי', translit: 'chai', meaning: 'life, living' },
  { id: 'echad', word: 'אחד', translit: 'echad', meaning: 'one' },
  { id: 'ahavah', word: 'אהבה', translit: 'ahavah', meaning: 'love' },
  { id: 'mashiach', word: 'משיח', translit: 'mashiach', meaning: 'messiah, anointed one' },
  { id: 'nachash', word: 'נחש', translit: 'nachash', meaning: 'serpent' },
  { id: 'yayin', word: 'יין', translit: 'yayin', meaning: 'wine' },
  { id: 'sod', word: 'סוד', translit: 'sod', meaning: 'secret' },
  { id: 'emet', word: 'אמת', translit: 'emet', meaning: 'truth' },
  { id: 'shalom', word: 'שלום', translit: 'shalom', meaning: 'peace' },
].map((example) => ({
  ...example,
  value: wordValue(example.word),
  gadol: wordValue(example.word, 'gadol'),
  breakdown: breakdown(example.word),
  hasFinal: [...example.word].some((char) => FINAL_BY_CHAR.has(char)),
}));

const ABOVE_400 = [500, 600, 700, 800, 900].map((number) => {
  const letters = numeralLetters(number);
  return { number, written: punctuate(letters), breakdown: breakdown(letters) };
});

// The same word under four methods, for the "other methods" table. Emet has no
// final letter, so gadol leaves it unchanged; shalom shows where gadol moves.
const METHOD_WORD = { word: 'אמת', translit: 'emet' };
const METHODS = [
  { id: 'hechrachi', name: 'Mispar hechrachi', hebrew: 'מספר הכרחי', rule: 'The standard values in the chart, 1 to 400.' },
  { id: 'gadol', name: 'Mispar gadol', hebrew: 'מספר גדול', rule: 'Standard values, except the five finals count 500 to 900.' },
  { id: 'katan', name: 'Mispar katan', hebrew: 'מספר קטן', rule: 'Each letter loses its zeros: yod 10 and qof 100 both count 1.' },
  { id: 'siduri', name: 'Mispar siduri', hebrew: 'מספר סידורי', rule: 'Each letter counts its place in the alphabet, aleph 1 to tav 22.' },
].map((method) => ({
  ...method,
  value: wordValue(METHOD_WORD.word, method.id),
  breakdown: breakdown(METHOD_WORD.word, method.id),
}));

export default {
  letters: LETTERS.map((letter) => ({
    ...letter,
    final: FINALS.find((final) => final.base === letter.char)?.char ?? '',
  })),
  finals: FINALS.map((final) => ({
    ...final,
    baseName: BY_CHAR.get(final.base).name,
    value: BY_CHAR.get(final.base).value,
  })),
  examples: EXAMPLES,
  above400: ABOVE_400,
  methodWord: METHOD_WORD,
  methods: METHODS,
  // The Hebrew year that began at Rosh Hashanah in September 2026.
  year: { number: 5787, written: hebrewYear(5787), short: hebrewNumeral(787), breakdown: breakdown(numeralLetters(787)) },
};
