import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digitalRoot, englishGematria, isBaseRootValue } from '../netlify/functions/englishGematria.mjs';
import { CIPHERS } from '../page-scripts/multi-cipher-engine.mjs';

// 666-gematria.html states a lot of arithmetic: Greek numerals, Hebrew letter
// values, Roman numerals, an A = 100 cipher and this site's own A = 6 cipher.
// None of it is trusted here. Every total is worked out again from the letter
// tables below (or, for English, from the site's own englishGematria), every
// sentence that states a total is pinned to that arithmetic, and the last test
// checks that no number on the page is left that this file did not either
// compute or pin to a cited date or reference.
const SOURCE = readFileSync(new URL('../src/666-gematria.html', import.meta.url), 'utf8');
const TEMPLATE = readFileSync(new URL('../src/how-to-use-gematria.html', import.meta.url), 'utf8');
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---------- letter tables ----------

// Greek alphabetic numerals: nine letters each for units, tens and hundreds,
// including the three that survive only as numerals (stigma 6, qoppa 90,
// sampi 900).
const GREEK_ORDER = [...'αβγδεϛζηθικλμνξοπϙρστυφχψωϡ'];
const GREEK = new Map(GREEK_ORDER.map((char, index) => [char, (index % 9 + 1) * 10 ** Math.floor(index / 9)]));
const GREEK_NAMES = { χ: 'chi', ξ: 'xi', ι: 'iota', ϛ: 'stigma' };

function greekLetters(text) {
  return [...text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ')].filter((char) => char !== ' ');
}

function greek(text) {
  return greekLetters(text).reduce((sum, char) => {
    assert.ok(GREEK.has(char), `${JSON.stringify(char)} in ${text} is not a Greek numeral letter`);
    return sum + GREEK.get(char);
  }, 0);
}

// The page writes Greek breakdowns with capitals: "Λ 30 + Α 1 + ...".
const greekBreakdown = (text) => [...text].filter((char) => char !== ' ').map((char) => `${char} ${greek(char)}`).join(' + ');

// Hebrew, standard method: units, tens, then the four hundreds. A final form
// counts the same as its ordinary letter.
const HEBREW_ORDER = [...'אבגדהוזחטיכלמנסעפצקרשת'];
const HEBREW_NAMES = ['Aleph', 'Bet', 'Gimel', 'Dalet', 'He', 'Vav', 'Zayin', 'Chet', 'Tet', 'Yod', 'Kaf', 'Lamed', 'Mem', 'Nun', 'Samekh', 'Ayin', 'Pe', 'Tsadi', 'Qof', 'Resh', 'Shin', 'Tav'];
const HEBREW = new Map(HEBREW_ORDER.map((char, index) => [char, { name: HEBREW_NAMES[index], value: (index % 9 + 1) * 10 ** Math.floor(index / 9) }]));
for (const [final, base] of [['ך', 'כ'], ['ם', 'מ'], ['ן', 'נ'], ['ף', 'פ'], ['ץ', 'צ']]) {
  HEBREW.set(final, { name: `Final ${HEBREW.get(base).name.toLowerCase()}`, value: HEBREW.get(base).value });
}

function hebrewLetters(text) {
  const letters = [...text].filter((char) => char !== ' ');
  for (const char of letters) assert.ok(HEBREW.has(char), `${JSON.stringify(char)} in ${text} is not a Hebrew letter`);
  return letters;
}

const hebrew = (text) => hebrewLetters(text).reduce((sum, char) => sum + HEBREW.get(char).value, 0);
const hebrewBreakdown = (text) => hebrewLetters(text).map((char) => `${HEBREW.get(char).name} ${HEBREW.get(char).value}`).join(' + ');

// Roman numerals counted letter by letter, the way the historical 666 sums do;
// letters that are not numerals count nothing.
const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
const romanLetters = (text) => [...text].filter((char) => char in ROMAN);
const roman = (text) => romanLetters(text).reduce((sum, char) => sum + ROMAN[char], 0);
const romanBreakdown = (text) => romanLetters(text).map((char) => `${char} ${ROMAN[char]}`).join(' + ');

// Ordinary positional reading, where a smaller numeral before a larger one subtracts.
function romanSubtractive(text) {
  const values = [...text].map((char) => ROMAN[char]);
  return values.reduce((sum, value, index) => sum + (value < (values[index + 1] ?? 0) ? -value : value), 0);
}

// The Latin numeral alphabet of the Reformation-era 666 sums: 23 letters,
// nine each for units and tens and five for the hundreds, with I/J and U/V
// counted as one letter.
const LATIN_ORDER = [...'ABCDEFGHIKLMNOPQRSTVXYZ'];
const LATIN = new Map(LATIN_ORDER.map((char, index) => [char, (index % 9 + 1) * 10 ** Math.floor(index / 9)]));
LATIN.set('J', LATIN.get('I'));
LATIN.set('U', LATIN.get('V'));

function latinLetters(text) {
  const letters = [...text].filter((char) => char !== ' ');
  for (const char of letters) assert.ok(LATIN.has(char), `${JSON.stringify(char)} in ${text} is not in the Latin numeral alphabet`);
  return letters;
}

const latin = (text) => latinLetters(text).reduce((sum, char) => sum + LATIN.get(char), 0);
const latinBreakdown = (text) => latinLetters(text).map((char) => `${char} ${LATIN.get(char)}`).join(' + ');

// A cipher that starts at A = 100, B = 101 and so on.
const a100 = (letter) => letter.charCodeAt(0) - 65 + 100;
const a100Breakdown = (word) => [...word].map((char) => `${char} ${a100(char)}`).join(' + ');

// This site's cipher, through its own function, and the A = 1 sum beside it.
const english = (text) => Number(englishGematria(text));
const lettersOf = (text) => [...text.toUpperCase().replace(/[^A-Z]/g, '')];
const englishBreakdown = (text) => lettersOf(text).map((char) => `${char} ${english(char)}`).join(' + ');
const ordinal = (text) => lettersOf(text).reduce((sum, char) => sum + char.charCodeAt(0) - 64, 0);

// ---------- reading the page ----------

function decode(html) {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&minus;/g, '−')
    .replace(/&times;/g, '×')
    .replace(/&hellip;/g, '…')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&');
}

// Text as a reader sees it: tags dropped, entities decoded, whitespace folded.
function visibleText(html) {
  return decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

const BODY = SOURCE.slice(SOURCE.indexOf('<body>'));
const BODY_TEXT = visibleText(BODY.replace(/<script[\s\S]*?<\/script>/g, ''));

function says(snippet) {
  assert.ok(
    BODY_TEXT.includes(snippet),
    `src/666-gematria.html no longer says:\n  ${snippet}\nIf you changed the wording, update this test and recheck the arithmetic.`,
  );
}

function section(id) {
  const match = SOURCE.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`));
  assert.ok(match, `no <section id="${id}">`);
  return match[0];
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

// Rows of the English table, as typed.
const ENGLISH_ROWS = [...section('what-equals-666').matchAll(
  /<tr><th scope="row"><a href="\/calculator\.html\?query=([^"]+)">([^<]+)<\/a><\/th><td class="small">([^<]+)<\/td><td class="[^"]*">(\d+)<\/td><td class="[^"]*">(\d+)<\/td><\/tr>/g,
)].map(([, query, word, letters, sum, total]) => ({ query: decodeURIComponent(query), word, letters, sum: Number(sum), total: Number(total) }));

// Of every string of eight letters A-Z, how many reach each A = 1 sum.
function lengthDistribution(length) {
  let counts = new Map([[0, 1n]]);
  for (let step = 0; step < length; step += 1) {
    const next = new Map();
    for (const [sum, count] of counts) {
      for (let letter = 1; letter <= 26; letter += 1) next.set(sum + letter, (next.get(sum + letter) ?? 0n) + count);
    }
    counts = next;
  }
  return counts;
}

const EIGHT = (() => {
  const counts = lengthDistribution(8);
  const at666 = counts.get(666 / 6);
  return {
    possibleTotals: counts.size,
    oneIn: Math.round(Number(26n ** 8n) / Number(at666)),
    moreCommon: [...counts.values()].filter((count) => count > at666).length,
  };
})();

const BASE_ROOT_BELOW = (() => {
  let value = 666;
  while (!isBaseRootValue(value)) value -= 6;
  return value;
})();
const BASE_ROOT_ABOVE = (() => {
  let value = 666;
  while (!isBaseRootValue(value)) value += 6;
  return value;
})();

// ---------- Revelation 13 ----------

test('the King James text is quoted exactly and threescore adds up', () => {
  says('And that no man might buy or sell, save he that had the mark, or the name of the beast, or the number of his name. Here is wisdom. Let him that hath understanding count the number of the beast: for it is the number of a man; and his number is Six hundred threescore and six.');
  says('Revelation 13:17–18, King James Version');
  const score = 20;
  const threescore = 3 * score;
  assert.equal(600 + threescore + 6, 666);
  says(`A score is ${score}, so threescore is ${threescore}, and 600 + ${threescore} + 6 = ${600 + threescore + 6}.`);
});

// ---------- Greek ----------

test('the Greek numeral table is chi, xi, stigma and totals 666', () => {
  const body = section('greek-numerals');
  const rows = [...body.matchAll(/<tr><th scope="row"[^>]*><span lang="grc">(.)<\/span><\/th><td>(\w+)<\/td><td>(\w+)<\/td><td class="text-end">(\d+)<\/td><\/tr>/gu)];
  assert.deepEqual(rows.map(([, char]) => char).join(''), 'χξϛ');
  const places = ['Hundreds', 'Tens', 'Units'];
  rows.forEach(([, char, name, place, value], index) => {
    assert.equal(Number(value), greek(char), `${char} is ${greek(char)}`);
    assert.equal(name.toLowerCase(), GREEK_NAMES[char]);
    assert.equal(place, places[index]);
    assert.equal(String(greek(char)).length, 3 - index, `${char} is in the ${place.toLowerCase()}`);
  });
  const total = Number(body.match(/<th scope="row" colspan="3">Total<\/th><td class="text-end fw-bold">(\d+)<\/td>/)[1]);
  assert.equal(total, greek('χξϛ'));
  assert.equal(total, 666);
  // A number below a thousand never needs more than one letter per place.
  assert.equal(Math.max(...GREEK.values()), 900);
  says('Any number below a thousand needs at most three letters, and 666 is written with three: chi, xi and stigma.');

  // The Greek name of Jesus.
  assert.equal(greek('Ἰησοῦς'), 888);
  says(`the Greek name of Jesus, Ἰησοῦς, totals ${greek('Ἰησοῦς')}.`);
});

test('616 is chi-iota-stigma, and Irenaeus\'s fifty is the difference in the middle numeral', () => {
  const variant = 'χιϛ';
  assert.equal(greek(variant), 616);
  says(`Its surviving text reads ${variant}: ${[...variant].map((char) => `${GREEK_NAMES[char]} ${greek(char)}`).join(' + ')} = ${greek(variant)}.`);
  // Papyrus 115 is one of two third-century copies of the verse, and the other reads 666.
  says('was written in the third century or soon after and is one of the two oldest surviving copies of this passage.');
  says('The other, Papyrus 47, is also from the third century and reads 666.');
  assert.ok(!/oldest known copy/.test(BODY_TEXT), 'Papyrus 115 is not the single oldest copy');

  // The two readings differ only in the tens letter.
  const [a, b] = ['χξϛ', 'χιϛ'].map((text) => [...text]);
  assert.deepEqual([a[0], a[2]], [b[0], b[2]]);
  const fifty = greek(a[1]) - greek(b[1]);
  assert.equal(fifty, 50);
  assert.equal(greek('χξϛ') - greek('χιϛ'), fifty);
  says(`xi, ${greek('ξ')}, in ${greek('χξϛ')}, and iota, ${greek('ι')}, in ${greek('χιϛ')}. ${greek('ξ')} − ${greek('ι')} = ${fifty}.`);
  says('“vitiated the middle number in the name, deducting the amount of fifty from it”');
});

// ---------- Hebrew ----------

test('the Nero Caesar table is נרון קסר letter by letter and totals 666', () => {
  const body = section('nero-caesar');
  const rows = [...body.matchAll(/<tr><th scope="row"[^>]*><span lang="he" dir="rtl">(.)<\/span><\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><td class="text-end">(\d+)<\/td><\/tr>/gu)];
  assert.equal(rows.map(([, char]) => char).join(''), 'נרוןקסר');
  for (const [, char, name, , value] of rows) {
    assert.equal(name, HEBREW.get(char).name, char);
    assert.equal(Number(value), HEBREW.get(char).value, `${name} is ${HEBREW.get(char).value}`);
  }
  // Transliterated, the sounds spell the name.
  assert.equal(rows.map(([, , , sound]) => sound).join(''), 'nronqsr');
  const total = Number(body.match(/<th scope="row" colspan="3">Total<\/th><td class="text-end fw-bold">(\d+)<\/td>/)[1]);
  assert.equal(total, hebrew('נרון קסר'));
  assert.equal(total, 666);
  assert.ok(body.includes('<span lang="he" dir="rtl" class="text-nowrap">נרון קסר</span> (<em>nrwn qsr</em>)'));
});

test('dropping the final nun gives 616, the variant to the unit', () => {
  const latin = 'נרו קסר';
  assert.equal(hebrew(latin), 616);
  assert.equal(hebrew('נרון קסר') - hebrew(latin), HEBREW.get('ן').value);
  assert.equal(HEBREW.get('ן').value, greek('χξϛ') - greek('χιϛ'));
  says(`Spell it that way, ${latin}, and the final nun drops out: ${hebrewBreakdown(latin)} = ${hebrew(latin)}.`);
});

test('the supporting and opposing points add up', () => {
  // Bauckham: therion in Hebrew letters.
  const therion = 'תריון';
  assert.equal(hebrew(therion), 666);
  says(`written in Hebrew letters as ${therion}, also totals ${hebrew(therion)}: ${hebrewBreakdown(therion)}.`);

  // In Greek letters the name does not reach 666.
  const neronKaisar = 'ΝΕΡΩΝ ΚΑΙΣΑΡ';
  assert.notEqual(greek(neronKaisar), 666);
  says(`in Greek letters ${neronKaisar} totals ${greek(neronKaisar)},`);

  // Caesar with a yod.
  const withYod = 'נרון קיסר';
  assert.equal(hebrew(withYod) - hebrew('נרון קסר'), HEBREW.get('י').value);
  says(`Caesar is often spelled with a yod, קיסר, which would make the total ${hebrew(withYod)}.`);

  // 616 also fits Gaius Caesar in Greek letters.
  assert.equal(greek('ΓΑΙΟΣ ΚΑΙΣΑΡ'), 616);
  says(`ΓΑΙΟΣ ΚΑΙΣΑΡ, Gaius Caesar, better known as Caligula, totals ${greek('ΓΑΙΟΣ ΚΑΙΣΑΡ')} in Greek letters.`);

  // The objections are put as critics' points, not as settled fact.
  says('The reading is widely held, not settled, and critics raise several objections.');
  says('Gematria is not a known feature anywhere else in Revelation.');
});

// ---------- this site's cipher ----------

test('every word in the English table totals 666 in this site\'s cipher', () => {
  assert.equal(ENGLISH_ROWS.length, 10);
  says(`${NUMBER_WORDS[ENGLISH_ROWS.length][0].toUpperCase()}${NUMBER_WORDS[ENGLISH_ROWS.length].slice(1)} words that total 666 in this site’s cipher.`);
  const sumerian = CIPHERS.find((cipher) => cipher.id === 'sumerian');
  const ordinalCipher = CIPHERS.find((cipher) => cipher.id === 'english-ordinal');
  const cipherSum = (cipher, word) => lettersOf(word).reduce((sum, char) => sum + cipher.valueFor(char.charCodeAt(0) - 64), 0);
  for (const row of ENGLISH_ROWS) {
    assert.equal(row.query.toLowerCase(), row.word.toLowerCase(), `${row.word} links to the calculator for itself`);
    assert.equal(row.letters, englishBreakdown(row.word), `${row.word} letter values`);
    assert.equal(row.total, english(row.word), `${row.word} total`);
    assert.equal(row.total, 666);
    assert.equal(row.sum, ordinal(row.word), `${row.word} A = 1 sum`);
    assert.equal(row.total, 6 * row.sum);
    // The multi-cipher calculator agrees: Sumerian is this cipher, English Ordinal the A = 1 sum.
    assert.equal(cipherSum(sumerian, row.word), row.total);
    assert.equal(cipherSum(ordinalCipher, row.word), row.sum);
  }
  assert.equal(new Set(ENGLISH_ROWS.map((row) => row.word.toLowerCase())).size, ENGLISH_ROWS.length);
});

test('the cipher description and the facts about 666 follow from the arithmetic', () => {
  says(`with A = ${english('A')}, B = ${english('B')} and so on up to Z = ${english('Z')}, each letter’s place in the alphabet times six.`);
  for (let index = 0; index < 26; index += 1) assert.equal(english(String.fromCharCode(65 + index)), 6 * (index + 1));
  assert.equal(666 % 6, 0);
  says(`666 is 6 × ${666 / 6}.`);
  says(`exactly when its letters add up to ${666 / 6} with A = ${ordinal('A')}, B = ${ordinal('B')} … Z = ${ordinal('Z')}`);

  // Length limits.
  const four = english('ZZZZ');
  const five = english('ZZZZZ');
  assert.ok(four < 666 && five >= 666 && english('AAAAA') <= 666);
  says(`No word shorter than five letters can reach it. Four Z’s total ${four}; five total ${five}.`);

  // Eight letters.
  says(`Of all possible strings of eight letters, about 1 in ${EIGHT.oneIn} totals 666, and only ${NUMBER_WORDS[EIGHT.moreCommon]} of the ${EIGHT.possibleTotals} possible eight-letter totals are more common.`);
  assert.equal(EIGHT.possibleTotals, 8 * 25 + 1);
  const eightLetterWords = ['Computer', 'humanity', 'majority', 'recovery', 'strength'];
  for (const word of eightLetterWords) {
    assert.equal(lettersOf(word).length, 8, word);
    assert.ok(ENGLISH_ROWS.some((row) => row.word.toLowerCase() === word.toLowerCase()), `${word} is in the table`);
  }
  says(`${eightLetterWords.slice(0, -1).join(', ')} and ${eightLetterWords.at(-1)} all have eight letters.`);
  says(`In this site’s cipher alone, about 1 in ${EIGHT.oneIn} eight-letter strings totals 666.`);

  // Digital root and base root.
  assert.equal(digitalRoot(666), 9);
  assert.equal(6 + 6 + 6, 18);
  assert.equal(digitalRoot(18), 1 + 8);
  says(`Its digital root is ${digitalRoot(666)} (6 + 6 + 6 = ${6 + 6 + 6}, then 1 + 8 = ${1 + 8})`);
  assert.equal(isBaseRootValue(666), false);
  says(`the base-root ladder goes from ${BASE_ROOT_BELOW} straight to ${BASE_ROOT_ABOVE}.`);
  assert.equal(BASE_ROOT_ABOVE - BASE_ROOT_BELOW, 54);

  // 616 is unreachable.
  assert.notEqual(616 % 6, 0);
  says('616 cannot occur. It is not a multiple of six, so no word or phrase totals 616 in this cipher.');
  const below = Math.floor(616 / 6) * 6;
  const above = Math.ceil(616 / 6) * 6;
  says(`The nearest totals this cipher can produce are ${below} and ${above}.`);
});

test('the verse\'s own phrases and Nero Caesar in English letters miss 666', () => {
  for (const phrase of ['BEAST', 'MARK OF THE BEAST', 'NUMBER OF THE BEAST', 'NERO CAESAR']) assert.notEqual(english(phrase), 666, phrase);
  says(`BEAST totals ${english('BEAST')}, MARK OF THE BEAST ${english('MARK OF THE BEAST')} and NUMBER OF THE BEAST ${english('NUMBER OF THE BEAST')}.`);
  says(`NERO CAESAR, typed in English letters, totals ${english('NERO CAESAR')}.`);
  says('their letters add up to 111.');
  for (const word of ['usually', 'somewhere', 'majority', 'Computer', 'humanity']) assert.equal(english(word), 666, word);
});

// ---------- the historical fits ----------

test('Irenaeus\'s three names each total 666 in Greek numerals', () => {
  for (const name of ['ΕΥΑΝΘΑΣ', 'ΛΑΤΕΙΝΟΣ', 'ΤΕΙΤΑΝ']) assert.equal(greek(name), 666, name);
  says(`LATEINOS (${greekBreakdown('ΛΑΤΕΙΝΟΣ')}) and TEITAN (${greekBreakdown('ΤΕΙΤΑΝ')}) all total ${greek('ΤΕΙΤΑΝ')}.`);
  says('“It is therefore more certain, and less hazardous, to await the fulfilment of the prophecy, than to be making surmises.”');
  // He leaned towards Lateinos and Teitan without committing himself (Against Heresies 5.30.3).
  says('Irenaeus: several names, no firm verdict');
  says('He judged LATEINOS very probable and TEITAN the most credible of the names he knew, but he would not commit himself:');
});

test('Stifel\'s LEO DECIMVS, VICARIVS FILII DEI, HITLER at A = 100 and the six-letter names add up', () => {
  const leo = 'LEO DECIMVS';
  const leoTotal = roman(leo);
  assert.equal(leoTotal, 1656);
  says(`LEO DECIMVS, Pope Leo X: ${romanBreakdown(leo)} = ${leoTotal}.`);
  // Drop the M, add an X.
  const adjusted = leoTotal - ROMAN.M + ROMAN.X;
  assert.equal(adjusted, 666);
  says(`${leoTotal} − ${ROMAN.M} + ${ROMAN.X} = ${adjusted}.`);
  // MacTutor's reason for the X: the ten letters of LEO DECIMVS.
  assert.equal(lettersOf(leo).length, ROMAN.X);
  says(`added an X because LEO DECIMVS has ${NUMBER_WORDS[lettersOf(leo).length]} letters:`);

  // Bungus: MARTIN LUTERA in the Latin numeral alphabet.
  const [first, surname] = ['MARTIN', 'LUTERA'];
  assert.equal(latin(first) + latin(surname), 666);
  says(`He numbered the Latin alphabet A = ${LATIN.get('A')} to I = ${LATIN.get('I')}, K = ${LATIN.get('K')} to S = ${LATIN.get('S')} and T = ${LATIN.get('T')} to Z = ${LATIN.get('Z')}, with U and V as one letter, and spelled the name MARTIN LUTERA, dropping the H and adding an A:`);
  says(`${latinBreakdown(first)} = ${latin(first)}, and ${latinBreakdown(surname)} = ${latin(surname)}. ${latin(first)} + ${latin(surname)} = ${latin(first) + latin(surname)}.`);
  // LUTERA is LUTHER without the H and with an A added; the usual spelling misses.
  assert.equal(surname, `${'LUTHER'.replace('H', '')}A`);
  assert.notEqual(latin('MARTIN LUTHER'), 666);
  assert.notEqual(latin('MARTIN LUTHERA'), 666);
  says(`The usual spelling, MARTIN LUTHER, gives ${latin('MARTIN LUTHER')}.`);
  says('the spelling (Neron or Nero, Luther or Lutera)');

  const title = 'VICARIVS FILII DEI';
  assert.equal(roman(title), 666);
  says(`${title} as Roman numerals: ${romanBreakdown(title)} = ${roman(title)}.`);
  assert.ok(title.includes('IV'));
  assert.equal(roman('IV'), 6);
  assert.equal(romanSubtractive('IV'), 4);
  says(`the IV in VICARIVS counts as ${roman('IV')} rather than ${romanSubtractive('IV')}`);

  const hitler = 'HITLER';
  const hitlerTotal = [...hitler].reduce((sum, char) => sum + a100(char), 0);
  assert.equal(hitlerTotal, 666);
  assert.equal(a100('A'), 100);
  says(`A cipher that starts at A = ${a100('A')} gives HITLER ${hitlerTotal}: ${a100Breakdown(hitler)}.`);

  const names = ['Ronald', 'Wilson', 'Reagan'];
  for (const name of names) assert.equal(name.length, 6, name);
  says(`${names.join(' ')} was singled out because each of his ${NUMBER_WORDS[names.length]} names has six letters.`);
  says('8 a.m. on 18 October 1533');
});

// ---------- every number accounted for ----------

// Numbers on the page that are dates, references or manuscript names rather
// than arithmetic. Each is allowed only in the phrase it appears in.
const CITED = [
  /Rev(?:elation|\.) 13(?::1[678](?:–18)?)?/g,
  /Verse 17/g,
  /Papyrus 115/g,
  /Papyrus 47/g,
  /around 180/g,
  /the 1830s/g,
  /8 a\.m\. on 18 October 1533/g,
  /book 5, chapter 30/g,
  /\(1963\)/g,
  /1993\)/g,
  /October 27, 2026/g,
  /The 22 Hebrew letters/g,
];

function readingMinutes() {
  const main = SOURCE.slice(SOURCE.indexOf('<main'), SOURCE.indexOf('</main>'));
  const words = visibleText(main).split(' ').filter((word) => /\p{L}/u.test(word)).length;
  const stated = Number(BODY_TEXT.match(/~(\d+) min read/)[1]);
  // A reading speed somewhere between 200 and 250 words a minute.
  assert.ok(stated >= Math.floor(words / 250) && stated <= Math.ceil(words / 200), `${words} words is not ~${stated} min`);
  return stated;
}

function computedNumbers() {
  const values = new Set();
  const add = (...numbers) => numbers.forEach((number) => values.add(Number(number)));
  // Revelation 13:18.
  add(20, 3 * 20, 600, 6, 666);
  // Greek numerals and names.
  for (const text of ['χξϛ', 'χιϛ', 'Ἰησοῦς', 'ΛΑΤΕΙΝΟΣ', 'ΤΕΙΤΑΝ', 'ΝΕΡΩΝ ΚΑΙΣΑΡ', 'ΓΑΙΟΣ ΚΑΙΣΑΡ']) {
    add(greek(text), ...greekLetters(text).map((char) => GREEK.get(char)));
  }
  add(greek('ξ') - greek('ι'));
  // Hebrew.
  for (const text of ['נרון קסר', 'נרו קסר', 'תריון', 'נרון קיסר']) add(hebrew(text), ...hebrewLetters(text).map((char) => HEBREW.get(char).value));
  // This site's cipher.
  for (const row of ENGLISH_ROWS) add(english(row.word), ordinal(row.word), ...lettersOf(row.word).map(english));
  add(english('A'), english('B'), english('Z'), ordinal('A'), ordinal('B'), ordinal('Z'), 666 / 6);
  add(english('ZZZZ'), english('ZZZZZ'));
  add(1, EIGHT.oneIn, EIGHT.possibleTotals);
  add(digitalRoot(666), 6 + 6 + 6, 1, 8, BASE_ROOT_BELOW, BASE_ROOT_ABOVE);
  add(616, Math.floor(616 / 6) * 6, Math.ceil(616 / 6) * 6);
  for (const phrase of ['BEAST', 'MARK OF THE BEAST', 'NUMBER OF THE BEAST', 'NERO CAESAR']) add(english(phrase));
  // Roman numerals and A = 100.
  for (const text of ['LEO DECIMVS', 'VICARIVS FILII DEI']) add(roman(text), ...romanLetters(text).map((char) => ROMAN[char]));
  add(ROMAN.X, roman('LEO DECIMVS') - ROMAN.M + ROMAN.X, roman('IV'), romanSubtractive('IV'));
  add(...[...'HITLER'].map(a100), a100('A'));
  // The Latin numeral alphabet.
  add(...['A', 'I', 'K', 'S', 'T', 'Z'].map((char) => LATIN.get(char)));
  for (const text of ['MARTIN', 'LUTERA']) add(latin(text), ...latinLetters(text).map((char) => LATIN.get(char)));
  add(latin('MARTIN') + latin('LUTERA'), latin('MARTIN LUTHER'));
  add(readingMinutes());
  return values;
}

test('every number on the page is computed above or is a cited date or reference', () => {
  const computed = computedNumbers();
  // Table cells and other blocks read as separate words, so 108, 111 and 666
  // in neighbouring cells do not run together into one number.
  let text = visibleText(BODY.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<\/?(?:td|th|tr|li|p|dt|dd|h\d|caption|figcaption|div|section|blockquote|address|nav)\b[^>]*>/g, ' '));
  // Section numbers: the six numbered headings and their entries in the contents.
  const headings = [...SOURCE.matchAll(/<h2[^>]*>(\d)\. ([^<]+)<\/h2>/g)].map(([, number, title]) => ({ number: Number(number), title: decode(title) }));
  assert.deepEqual(headings.map((heading) => heading.number), [1, 2, 3, 4, 5, 6]);
  for (const { number, title } of headings) {
    const opening = title.split(' ').slice(0, 2).join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const label = new RegExp(`(?<=^|\\s)${number}\\. (?=${opening})`, 'g');
    assert.equal(text.match(label)?.length, 2, `"${number}. ${title}" should appear as a heading and in the contents`);
    text = text.replace(label, ' ');
  }

  for (const pattern of CITED) {
    assert.match(text, pattern, `${pattern} no longer appears; drop it from CITED`);
    text = text.replace(pattern, ' ');
  }
  const unexplained = [...new Set((text.match(/\d+/g) ?? []).map(Number))].filter((number) => !computed.has(number));
  assert.deepEqual(unexplained, [], `numbers on the page that nothing here computes: ${unexplained.join(', ')}`);

  // The head's descriptions state numbers too.
  for (const pattern of [/<meta name="description" content="([^"]*)"/, /<meta property="og:description" content="([^"]*)"/]) {
    const description = decode(SOURCE.match(pattern)[1]).replace(/Revelation 13:18/g, ' ');
    for (const number of description.match(/\d+/g) ?? []) assert.ok(computed.has(Number(number)), `${number} in ${description}`);
  }
});

// ---------- structured data and the page shell ----------

test('the FAQ structured data repeats the visible answers word for word', () => {
  const faq = jsonLd(SOURCE).find((block) => block['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage JSON-LD is missing');
  const visible = [...section('faq').matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map(([, question, answer]) => ({
    question: visibleText(question),
    answer: visibleText(answer),
  }));
  assert.equal(visible.length, faq.mainEntity.length);
  faq.mainEntity.forEach((entry, index) => {
    assert.equal(entry['@type'], 'Question');
    assert.equal(entry.name, visible[index].question);
    assert.equal(entry.acceptedAnswer.text, visible[index].answer);
  });
  // The answers' own numbers, and their wording where it was corrected.
  says('which asks the reader to count it, “for it is the number of a man”.');
  assert.ok(!/count the number of a name/.test(BODY_TEXT), 'verse 18 counts the number of the beast, not of a name');
  says('The other third-century copy, Papyrus 47, reads 666.');
  says(`In Greek numerals it is χξϛ: ${[...'χξϛ'].map(greek).join(' + ')}.`);
  says(`Spelling Nero’s name in Hebrew without its final nun, as in the Latin form Nero, takes off ${HEBREW.get('ן').value} and gives exactly ${hebrew('נרו קסר')}.`);
  const faqWords = ['Computer', 'humanity', 'New York', 'perfection', 'strength', 'usually'];
  for (const word of faqWords) assert.equal(english(word), 666, word);
  says(`${faqWords.slice(0, -1).join(', ')} and ${faqWords.at(-1)} all total 666. No word shorter than five letters can.`);
});

test('the head copies the template and targets the page\'s queries', () => {
  const shared = [
    TEMPLATE.slice(TEMPLATE.indexOf('    <meta charset'), TEMPLATE.indexOf('    <title>')),
    TEMPLATE.slice(TEMPLATE.indexOf('    <link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css" />'), TEMPLATE.indexOf('    <script type="application/ld+json">')),
  ];
  for (const block of shared) {
    assert.ok(block.length > 200);
    assert.ok(SOURCE.includes(block), `head block differs from the template:\n${block}`);
  }
  assert.ok(SOURCE.includes('<script src="/assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>'));
  assert.ok(SOURCE.includes('<a class="skip-link" href="#mainContent">Skip to main content</a>\n{% nav %}'));
  assert.ok(SOURCE.includes('<main id="mainContent" class="py-5">'));
  assert.ok(SOURCE.includes('{% footer %}'));

  const title = decode(SOURCE.match(/<title>([^<]*)<\/title>/)[1]);
  assert.ok(title.startsWith('666 in Gematria: The Number of the Beast'), title);
  assert.ok(title.endsWith(' | Gematria.Today'));
  assert.ok(title.length <= 60, `title is ${title.length} characters`);

  const description = decode(SOURCE.match(/<meta name="description" content="([^"]*)"/)[1]);
  assert.ok(description.length <= 160, `description is ${description.length} characters`);
  assert.match(description, /^666 in gematria/);
  assert.match(description, /616/);
  assert.match(description, /Nero Caesar/);

  assert.ok(SOURCE.includes('<meta name="robots" content="index,follow,max-image-preview:large" />'));
  assert.ok(SOURCE.includes('<link rel="canonical" href="https://gematria.today/666-gematria.html" />'));
  assert.ok(SOURCE.includes('<meta property="og:url" content="https://gematria.today/666-gematria.html" />'));
  assert.ok(SOURCE.includes('<meta name="author" content="Gematria.Today Editorial Team" />'));
  assert.ok(SOURCE.includes('<meta name="last-updated" content="2026-10-27" />'));
  const ogImage = TEMPLATE.match(/<meta property="og:image" content="([^"]+)"/)[1];
  assert.ok(SOURCE.includes(`<meta property="og:image" content="${ogImage}" />`));
  assert.ok(SOURCE.includes(`<meta name="twitter:image" content="${ogImage}" />`));

  // The primary query, and the secondary ones, where a reader meets them first.
  const h1 = visibleText(SOURCE.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);
  assert.match(h1, /^666 in gematria: the number of the beast/);
  const lead = visibleText(SOURCE.match(/<p class="lead[^"]*">([\s\S]*?)<\/p>/)[1]);
  assert.match(lead, /^666 is the number of the beast in Revelation 13:18, and the best-known number in gematria\./);
  assert.match(lead, /616/);
  assert.match(lead, /what equals 666/);
  says('By the Gematria.Today Editorial Team · Updated October 27, 2026');
  assert.ok(SOURCE.includes('<time datetime="2026-10-27">October 27, 2026</time>'));
});

test('the structured data describes this page', () => {
  const blocks = jsonLd(SOURCE);
  assert.deepEqual(blocks.map((block) => block['@type']), ['BreadcrumbList', 'Article', 'FAQPage']);
  const [breadcrumbs, article] = blocks;
  assert.deepEqual(breadcrumbs.itemListElement.map((item) => item.item), ['https://gematria.today/', 'https://gematria.today/666-gematria.html']);
  assert.equal(breadcrumbs.itemListElement.at(-1).name, visibleText(SOURCE.match(/<li class="breadcrumb-item active" aria-current="page">([^<]+)<\/li>/)[1]));
  assert.equal(article.mainEntityOfPage, 'https://gematria.today/666-gematria.html');
  assert.equal(article.datePublished, '2026-10-27');
  assert.equal(article.dateModified, '2026-10-27');
  assert.equal(article.headline, visibleText(SOURCE.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]));
  assert.equal(article.image, TEMPLATE.match(/<meta property="og:image" content="([^"]+)"/)[1]);
});

test('the page has no inline script and links where it says it does', () => {
  for (const [, attrs, body] of SOURCE.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc\s*=/.test(attrs)) continue;
    assert.match(attrs, /type="application\/ld\+json"/, `inline script: <script${attrs}>${body.slice(0, 40)}`);
  }
  assert.ok(!/\son[a-z]+\s*=\s*"/i.test(SOURCE), 'inline event handler');
  assert.ok(!/javascript:/i.test(SOURCE), 'javascript: URL');

  const blogPost = '/blog.html?post=determining-identity-of-the-beast-rev-13#determining-identity-of-the-beast-rev-13';
  for (const href of [
    '/v/666',
    '/calculator.html?query=computer',
    '/why-english-gematria.html',
    '/hebrew-gematria-chart.html',
    '/what-is-gematria.html',
    '/gematria-cipher-chart.html',
    '/multi-cipher-calculator.html',
    '/how-to-use-gematria.html',
    '/how-to-use-gematria.html#test-the-match',
    '/bible-names-gematria.html',
    '/definitions.html#defn-isopsephy-greek-gematria',
    '/disclaimer.html',
    '/blog.html',
    blogPost,
  ]) {
    assert.ok(SOURCE.includes(`href="${href}"`), `no link to ${href}`);
  }
  // /v/ pages exist only for values the cipher can produce.
  for (const [, value] of SOURCE.matchAll(/href="\/v\/(\d+)"/g)) assert.equal(Number(value) % 6, 0, `/v/${value}`);

  // The links into other pages land on something that exists.
  assert.match(read('src/definitions.html'), /id="defn-isopsephy-greek-gematria"/);
  assert.match(read('src/how-to-use-gematria.html'), /id="test-the-match"/);
  assert.match(read('netlify/functions/_admin.mjs'), /slug: 'determining-identity-of-the-beast-rev-13'/);

  // Every in-page link lands on an element that exists.
  const ids = new Set([...SOURCE.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const [, fragment] of SOURCE.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(fragment), `#${fragment} has no target`);
  }
  // External sources open safely.
  for (const [tag] of SOURCE.matchAll(/<a href="https?:\/\/[^"]+"[^>]*>/g)) assert.match(tag, /rel="noopener"/, tag);

  // The page stays inside the site's stance: no claim that gematria proves or predicts.
  says('nothing on this site is a prediction about any person or event.');
  // The FAQ matches the disclaimer's wording rather than claiming the site never identifies anyone.
  says('A match is evidence to weigh, not proof. Results on this site do not predict events or identify anyone with certainty.');
  assert.ok(!/identifies anyone/.test(BODY_TEXT), 'an absolute claim the site\'s own blog contradicts');
  assert.match(read('src/disclaimer.html'), /do not prove factual claims, predict future events, identify hidden meanings with certainty/);
  assert.ok(!/\bprove[sd]? (?:that|who)\b/i.test(BODY_TEXT.replace('Does gematria prove who the beast is?', '')), 'a claim that gematria proves something');
});
