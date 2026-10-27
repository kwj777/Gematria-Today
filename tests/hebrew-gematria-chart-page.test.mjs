import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Eleventy from '@11ty/eleventy';

import hebrewLetters from '../src/_data/hebrewLetters.js';
import { englishGematria, hasCountableLetters } from '../netlify/functions/englishGematria.mjs';
import { CIPHERS, calculateAllCiphers } from '../page-scripts/multi-cipher-engine.mjs';
import { loadPartials, renderFooter } from '../scripts/lib/page-chrome.mjs';

// hebrew-gematria-chart.html is a reference page: its tables are rendered from
// src/_data/hebrewLetters.js and its prose quotes totals worked out from them.
// Nothing here trusts the totals the data file computes for itself. Every
// value is added up again from the letter table alone, and every number the
// prose states is pinned to that arithmetic. The tables are also checked as
// Eleventy actually renders them, so a template field that names nothing
// cannot quietly print as an empty cell.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = 'hebrew-gematria-chart.html';
const SOURCE = readFileSync(join(ROOT, 'src', PAGE), 'utf8');
const TEMPLATE = readFileSync(join(ROOT, 'src/how-to-use-gematria.html'), 'utf8');

const GERESH = '׳';
const GERSHAYIM = '״';
const NOT_LETTERS = new Set([' ', GERESH, GERSHAYIM]);

// Lookup tables built from nothing but the letters and finals in the data file.
const LETTER = new Map(hebrewLetters.letters.map((letter) => [letter.char, letter]));
const FINAL = new Map(hebrewLetters.finals.map((final) => [final.char, final]));
const baseOf = (char) => LETTER.get(FINAL.get(char)?.base ?? char);

const METHODS = {
  hechrachi: (char) => baseOf(char).value,
  gadol: (char) => FINAL.get(char)?.gadol ?? baseOf(char).value,
  katan: (char) => Number(String(baseOf(char).value).replace(/0+$/, '')),
  siduri: (char) => hebrewLetters.letters.indexOf(baseOf(char)) + 1,
};

function lettersOf(text) {
  const letters = [...text].filter((char) => !NOT_LETTERS.has(char));
  for (const char of letters) assert.ok(baseOf(char), `${JSON.stringify(char)} in ${text} is not a Hebrew letter`);
  return letters;
}

function total(text, method = 'hechrachi') {
  return lettersOf(text).reduce((sum, char) => sum + METHODS[method](char), 0);
}

function breakdown(text, method = 'hechrachi') {
  return lettersOf(text)
    .map((char) => `${FINAL.get(char)?.name ?? LETTER.get(char).name} ${METHODS[method](char)}`)
    .join(' + ');
}

function decode(html) {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, '–')
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
    `src/hebrew-gematria-chart.html no longer says:\n  ${snippet}\nIf you changed the wording, update this test and recheck the arithmetic.`,
  );
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

// ---------- the data ----------

test('the chart lists the 22 letters in alphabetical order with their standard values', () => {
  const { letters } = hebrewLetters;
  assert.equal(letters.length, 22);
  letters.forEach((letter, index) => {
    assert.equal(letter.position, index + 1, letter.name);
    // Units for the first nine, tens for the next nine, hundreds for the last four.
    const expected = index < 9 ? index + 1 : index < 18 ? (index - 8) * 10 : (index - 17) * 100;
    assert.equal(letter.value, expected, `${letter.name} is ${expected}`);
    assert.equal([...letter.char].length, 1, letter.name);
  });
  assert.equal(letters[0].name, 'Aleph');
  assert.equal(letters[21].name, 'Tav');

  // Unicode's Hebrew letter block is the 22 letters and 5 finals in order,
  // each final sitting directly before its ordinary form. Matching it proves
  // the right glyph was typed for every row.
  const all = [...letters.map((letter) => letter.char), ...hebrewLetters.finals.map((final) => final.char)];
  const codePoints = all.map((char) => char.codePointAt(0)).sort((a, b) => a - b);
  assert.deepEqual(codePoints, Array.from({ length: 27 }, (_, index) => 0x05d0 + index));
  for (const final of hebrewLetters.finals) {
    assert.equal(final.char.codePointAt(0), final.base.codePointAt(0) - 1, final.name);
  }
});

test('a final form keeps its letter\'s value in the standard method and counts 500 to 900 in mispar gadol', () => {
  const { finals, letters } = hebrewLetters;
  assert.deepEqual(finals.map((final) => LETTER.get(final.base).name), ['Kaf', 'Mem', 'Nun', 'Pe', 'Tsadi']);
  // Gadol follows alphabetical order of the base letters.
  const positions = finals.map((final) => LETTER.get(final.base).position);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  finals.forEach((final, index) => {
    assert.equal(final.gadol, 500 + index * 100, final.name);
    assert.equal(final.value, LETTER.get(final.base).value, `${final.name} is worth its base letter`);
    assert.equal(final.baseName, LETTER.get(final.base).name);
    assert.equal(letters.find((letter) => letter.char === final.base).final, final.char);
  });
  // With the finals, mispar gadol has exactly one letter for every hundred.
  const hundreds = [...letters.filter((letter) => letter.value >= 100).map((letter) => letter.value), ...finals.map((final) => final.gadol)];
  assert.deepEqual(hundreds, [100, 200, 300, 400, 500, 600, 700, 800, 900]);
});

test('every worked example adds up from the letter table to its classic value', () => {
  const standard = { chai: 18, echad: 13, ahavah: 13, mashiach: 358, nachash: 358, yayin: 70, sod: 70, emet: 441, shalom: 376 };
  const gadol = { ...standard, yayin: 720, shalom: 936 };
  assert.deepEqual(hebrewLetters.examples.map((example) => example.id).sort(), Object.keys(standard).sort());
  for (const example of hebrewLetters.examples) {
    assert.equal(total(example.word), standard[example.id], `${example.translit} in the standard method`);
    assert.equal(total(example.word, 'gadol'), gadol[example.id], `${example.translit} in mispar gadol`);
    assert.equal(example.value, total(example.word), `${example.translit}: data file total`);
    assert.equal(example.gadol, total(example.word, 'gadol'), `${example.translit}: data file gadol total`);
    assert.equal(example.breakdown, breakdown(example.word), `${example.translit}: letter breakdown`);
    assert.equal(example.hasFinal, [...example.word].some((char) => FINAL.has(char)), `${example.translit}: final letter flag`);
  }
});

test('the classic pairs share a value, and wine and secret only in the standard method', () => {
  const byId = Object.fromEntries(hebrewLetters.examples.map((example) => [example.id, example.word]));
  assert.equal(total(byId.echad), total(byId.ahavah));
  assert.equal(total(byId.mashiach), total(byId.nachash));
  assert.equal(total(byId.yayin), total(byId.sod));
  assert.notEqual(total(byId.yayin, 'gadol'), total(byId.sod, 'gadol'));
  // 13 + 13 is the value of the four-letter name.
  assert.equal(total(byId.echad) + total(byId.ahavah), total('יהוה'));
  assert.equal(total('יהוה'), 26);
});

test('the hundreds above 400 are built from tav and add back up', () => {
  const written = { 500: 'ת״ק', 600: 'ת״ר', 700: 'ת״ש', 800: 'ת״ת', 900: 'תת״ק' };
  assert.deepEqual(hebrewLetters.above400.map((row) => row.number), [500, 600, 700, 800, 900]);
  for (const row of hebrewLetters.above400) {
    assert.equal(row.written, written[row.number]);
    assert.equal(total(row.written), row.number);
    assert.ok(row.written.startsWith('ת'), `${row.number} starts with tav`);
    assert.equal(row.written.indexOf(GERSHAYIM), row.written.length - 2, `${row.number} has its gershayim before the last letter`);
    assert.equal(row.breakdown, breakdown(row.written));
  }
});

test('the year example is 5787, written ה׳תשפ״ז', (t) => {
  const { year } = hebrewLetters;
  assert.equal(year.number, 5787);
  assert.equal(year.written, 'ה׳תשפ״ז');
  assert.equal(year.short, 'תשפ״ז');
  const [thousands, rest] = year.written.split(GERESH);
  assert.equal(total(thousands) * 1000 + total(rest), 5787);
  assert.equal(total(year.short), 787);
  assert.equal(year.breakdown, breakdown(year.short));

  // "Began at Rosh Hashanah in September 2026": 1 Tishri 5787 is 12 September
  // 2026, and the page's update date falls in 5787.
  const hebrewDate = new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  if (hebrewDate.resolvedOptions().calendar !== 'hebrew') {
    t.skip('no Hebrew calendar in this ICU build, so the Rosh Hashanah date is unchecked');
    return;
  }
  assert.match(hebrewDate.format(new Date('2026-09-11T12:00:00Z')), /5786/);
  assert.match(hebrewDate.format(new Date('2026-09-12T12:00:00Z')), /^1 Tishri 5787$/);
  assert.match(hebrewDate.format(new Date('2026-10-27T12:00:00Z')), /5787/);
});

test('the other-methods table adds up emet four ways', () => {
  const { methodWord, methods } = hebrewLetters;
  assert.equal(methodWord.word, 'אמת');
  const expected = { hechrachi: 441, gadol: 441, katan: 9, siduri: 36 };
  assert.deepEqual(methods.map((method) => method.id), Object.keys(expected));
  for (const method of methods) {
    assert.equal(total(methodWord.word, method.id), expected[method.id], method.name);
    assert.equal(method.value, expected[method.id], `${method.name}: data file total`);
    assert.equal(method.breakdown, breakdown(methodWord.word, method.id), `${method.name}: breakdown`);
  }
  // The katan rule's own examples.
  assert.match(methods.find((method) => method.id === 'katan').rule, /yod 10 and qof 100 both count 1/);
  assert.equal(METHODS.katan('י'), 1);
  assert.equal(METHODS.katan('ק'), 1);
  assert.match(methods.find((method) => method.id === 'siduri').rule, /aleph 1 to tav 22/);
});

// ---------- the prose ----------

test('every number the prose states is what the letter table produces', () => {
  const [aleph, tav] = [hebrewLetters.letters[0], hebrewLetters.letters[21]];
  says(`aleph = ${aleph.value} to tav = ${tav.value}`);
  says('aleph to tet count the units 1 to 9, yod to tsadi count the tens 10 to 90, and qof to tav count the hundreds 100 to 400');
  assert.deepEqual(hebrewLetters.letters.slice(0, 9).map((l) => l.value), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(hebrewLetters.letters.slice(9, 18).map((l) => l.value), [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.deepEqual(hebrewLetters.letters.slice(18).map((l) => l.value), [100, 200, 300, 400]);
  assert.deepEqual([hebrewLetters.letters[8].name, hebrewLetters.letters[9].name, hebrewLetters.letters[17].name, hebrewLetters.letters[18].name], ['Tet', 'Yod', 'Tsadi', 'Qof']);

  // What counts.
  says(`Bet and vet are both ${total('ב')}, kaf and khaf both ${total('כ')}, pe and fe both ${total('פ')}.`);
  says(`ש is ${total('ש')} whichever side its dot is on`);
  says(`spelled דוד through most of the Bible, ${breakdown('דוד')} = ${total('דוד')}, and דויד in Chronicles, which adds a yod and comes to ${total('דויד')}`);
  assert.deepEqual([total('דוד'), total('דויד')], [14, 24]);

  // Final forms.
  says(`ם is ${total('ם')}, exactly like מ`);
  says(hebrewLetters.finals.map((final, index) => `${index === 4 ? 'and ' : ''}${final.name.toLowerCase()} ${final.gadol}`).join(', ').replace(', and', ' and'));
  says(`${breakdown('שלום')} = ${total('שלום')} in the standard method, and ${total('שלום', 'gadol')} in mispar gadol, where the final mem counts ${METHODS.gadol('ם')}`);
  says(`נרון קסר: ${breakdown('נרון קסר')} = ${total('נרון קסר')}`);
  assert.equal(total('נרון קסר'), 666);
  says(`in mispar gadol the same letters come to ${total('נרון קסר', 'gadol')}`);
  says(`the total is ${total('נרו קסר')}, the number some early manuscripts give instead`);
  assert.equal(total('נרו קסר'), 616);

  // Writing numbers.
  says(`Tav, ${total('ת')}, is the largest single letter`);
  assert.equal(Math.max(...hebrewLetters.letters.map((l) => l.value)), total('ת'));
  says(`so ${total('י״ח')} is written י״ח`);
  assert.equal(total('י״ח'), 18);
  says(`ה׳ for ${(total('ה') * 1000).toLocaleString('en-US')}, then`);
  assert.ok(SOURCE.includes(`{{ hebrewLetters.year.breakdown }} = ${total(hebrewLetters.year.short)}`));
  assert.ok(SOURCE.includes('the Hebrew year {{ hebrewLetters.year.number }}, which began at Rosh Hashanah in September 2026'));

  // 15 and 16.
  says(`15 should be yod-he, י״ה (${total('י')} + ${total('ה')}), and 16 should be yod-vav, י״ו (${total('י')} + ${total('ו')})`);
  assert.deepEqual([total('י״ה'), total('י״ו')], [15, 16]);
  says(`15 is written ט״ו, tet-vav (${total('ט')} + ${total('ו')}), and 16 is written ט״ז, tet-zayin (${total('ט')} + ${total('ז')})`);
  assert.deepEqual([total('ט״ו'), total('ט״ז')], [15, 16]);
  says('115 is קט״ו, never קי״ה');
  assert.deepEqual([total('קט״ו'), total('קי״ה')], [115, 115]);
  says('ט״ו בשבט, the 15th of Shevat');
  says(`${total('ער')} can appear as ער rather than רע`);
  assert.deepEqual([total('ער'), total('רע')], [270, 270]);
  says(`${total('דש')} as דש rather than שד`);
  assert.deepEqual([total('דש'), total('שד')], [304, 304]);

  // Worked examples.
  const byId = Object.fromEntries(hebrewLetters.examples.map((example) => [example.id, example]));
  says(`Chai, ${byId.chai.value}.`);
  says(`Echad and ahavah, ${byId.echad.value}.`);
  says(`${byId.echad.value} + ${byId.ahavah.value} = ${total('יהוה')}, the value of the four-letter divine name יהוה (${breakdown('יהוה')} = ${total('יהוה')})`);
  says(`Mashiach and nachash, ${byId.mashiach.value}.`);
  says(`Yayin and sod, ${byId.yayin.value}.`);
  says(`in mispar gadol it is ${byId.yayin.gadol} while sod stays ${byId.sod.gadol}`);
  says(`mispar gadol leaves it at ${byId.emet.gadol}; shalom, as above, moves from ${byId.shalom.value} to ${byId.shalom.gadol}`);
});

test('the note on this site\'s calculators matches the English engines', () => {
  says('The calculators on Gematria.Today count only the English letters A–Z.');
  says('use one cipher, A = 6, B = 12 and so on up to Z = 156 (alphabet position times six)');
  assert.equal(englishGematria('A'), '6');
  assert.equal(englishGematria('B'), '12');
  assert.equal(englishGematria('Z'), '156');

  // "runs that cipher and six other English ones": seven ciphers, one of
  // them the main calculator's.
  says('The multi-cipher calculator runs that cipher and six other English ones side by side.');
  assert.equal(CIPHERS.length, 7);
  const sameAsMain = CIPHERS.filter((cipher) => (
    Array.from({ length: 26 }, (_, index) => cipher.valueFor(index + 1)).every((value, index) => String(value) === englishGematria(String.fromCharCode(65 + index)))
  ));
  assert.deepEqual(sameAsMain.map((cipher) => cipher.id), ['sumerian']);

  // A Hebrew word has nothing any calculator can count. The main and name
  // calculators say so instead of showing a value; the multi-cipher calculator
  // shows 0 with 0 letters counted.
  says('Enter a Hebrew word in the main or name calculator and it tells you it counts English letters A–Z only, instead of showing a value; the multi-cipher calculator shows a total of 0, with 0 letters counted.');
  for (const example of hebrewLetters.examples) {
    assert.equal(englishGematria(example.word), '0', example.translit);
    assert.equal(hasCountableLetters(example.word), false, example.translit);
    for (const result of calculateAllCiphers(example.word)) {
      assert.equal(result.total, 0, `${example.translit} in ${result.cipherName}`);
      assert.equal(result.letterCount, 0, `${example.translit} in ${result.cipherName}`);
    }
  }
  for (const script of ['page-scripts/calculator-1.js', 'page-scripts/name-calculator-1.js']) {
    assert.match(readFileSync(join(ROOT, script), 'utf8'), /This calculator counts English letters A-Z only/, script);
  }

  // A transliteration is counted as English letters.
  const chai = ['C', 'H', 'A', 'I'].map((letter) => `${letter} ${englishGematria(letter)}`).join(' + ');
  says(`CHAI in the main calculator is ${chai} = ${englishGematria('chai')}, the value of four English letters, not the ${total('חי')} of חי`);
  assert.equal(englishGematria('CHAI'), '126');
  says(`CHAI comes to ${englishGematria('chai')} in the main calculator, not ${total('חי')}`);

  // The multi-cipher Jewish / Latin cipher, as the page describes it.
  const cipher = CIPHERS.find((entry) => entry.id === 'jewish-latin');
  assert.equal(cipher.name, 'Jewish / Latin');
  says("One of the multi-cipher calculator's ciphers, Jewish / Latin, borrows the Hebrew pattern of units, tens and hundreds");
  says('A–I = 1–9, J–R = 10–90, S–Z = 100–800');
  const value = (letter) => cipher.valueFor(letter.charCodeAt(0) - 64);
  assert.deepEqual(['A', 'I', 'J', 'R', 'S', 'Z'].map(value), [1, 9, 10, 90, 100, 800]);
});

test('the tables are rendered from the data file, not typed into the page', () => {
  for (const loop of ['letter in hebrewLetters.letters', 'final in hebrewLetters.finals', 'row in hebrewLetters.above400', 'example in hebrewLetters.examples', 'method in hebrewLetters.methods']) {
    assert.ok(SOURCE.includes(`{%- for ${loop} %}`), `missing loop: ${loop}`);
  }
  // A value cell typed by hand would drift from the data.
  assert.ok(!/<td class="text-end fw-semibold">\d+<\/td>/.test(SOURCE), 'a hard-coded value cell');
});

// ---------- the page as Eleventy renders it ----------

// The site config reads its partials from the working directory.
process.chdir(ROOT);

async function renderPage() {
  const partials = await loadPartials(ROOT);
  const eleventy = new Eleventy(join('src', PAGE), join(tmpdir(), 'hebrew-gematria-chart-test'), {
    quietMode: true,
    configPath: 'eleventy.config.mjs',
    config(eleventyConfig) {
      // Nunjucks prints a field that does not exist as an empty string, which
      // would leave a blank cell in the chart. Make it an error instead.
      eleventyConfig.setNunjucksEnvironmentOptions({ throwOnUndefined: true });
      // A plugin runs after the site config, so this wraps its footer
      // shortcode. A page has to be listed in FOOTER_SECTION_BY_FILE before
      // the footer renders; until it is, use the Learn footer so the content
      // can still be checked. Once it is listed, the real footer renders.
      eleventyConfig.addPlugin((pluginConfig) => {
        pluginConfig.addShortcode('footer', function footer() {
          try {
            return renderFooter(partials.footer, PAGE);
          } catch {
            return renderFooter(partials.footer, 'how-to-use-gematria.html');
          }
        });
      });
    },
  });
  const pages = await eleventy.toJSON();
  const page = pages.find((entry) => entry.url === `/${PAGE}`);
  assert.ok(page, `${PAGE} did not render`);
  return page.content;
}

const HTML = await renderPage();
const MAIN = HTML.slice(HTML.indexOf('<main'), HTML.indexOf('</main>'));
const MAIN_TEXT = visibleText(MAIN.replace(/&#39;/g, "'").replace(/&quot;/g, '"'));

// Each rendered table's body, as rows of cell text.
function renderedTables() {
  return [...MAIN.matchAll(/<table\b[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)].map(([, body]) => (
    [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => (
      // Tags become spaces, so "<span>חי</span><span>chai</span>" reads "חי chai".
      [...row.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(([, , cell]) => visibleText(cell.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')))
    ))
  ));
}

const TABLES = renderedTables();
const [CHART, FINALS_TABLE, ABOVE_400_TABLE, EXAMPLES_TABLE, METHODS_TABLE] = TABLES;

test('the rendered page has five tables and no empty cell in any of them', () => {
  assert.equal(TABLES.length, 5);
  TABLES.forEach((rows, tableIndex) => {
    assert.ok(rows.length > 0, `table ${tableIndex + 1} has no rows`);
    rows.forEach((cells, rowIndex) => {
      cells.forEach((cell, cellIndex) => assert.notEqual(cell, '', `table ${tableIndex + 1}, row ${rowIndex + 1}, cell ${cellIndex + 1} is empty`));
    });
  });
  // No template tag survived into the output.
  assert.ok(!/\{\{|\{%/.test(MAIN), 'an unrendered Nunjucks tag');
});

test('the rendered chart shows the 22 letters with the values 1 to 400', () => {
  assert.equal(CHART.length, 22);
  // Units, tens, hundreds: worked out here, not read from the data file.
  const values = Array.from({ length: 22 }, (_, index) => (index < 9 ? index + 1 : index < 18 ? (index - 8) * 10 : (index - 17) * 100));
  assert.deepEqual(CHART.map((cells) => Number(cells[4])), values);
  assert.deepEqual(CHART.map((cells) => Number(cells[0])), Array.from({ length: 22 }, (_, index) => index + 1));
  // The letter cell starts with the right glyph: the Unicode Hebrew block in
  // order, skipping the five finals.
  const glyphs = Array.from({ length: 27 }, (_, index) => String.fromCodePoint(0x05d0 + index)).filter((char) => !FINAL.has(char));
  assert.deepEqual(CHART.map((cells) => [...cells[1]][0]), glyphs);
  for (const cells of CHART) assert.equal(total([...cells[1]][0]), Number(cells[4]), cells[2]);
  assert.match(CHART[0][2], /^Aleph/);
  assert.match(CHART[21][2], /^Tav/);
});

test('the rendered final-forms table shows each final at its letter\'s value and at 500 to 900', () => {
  assert.equal(FINALS_TABLE.length, 5);
  assert.deepEqual(FINALS_TABLE.map((cells) => cells[0]), ['ך', 'ם', 'ן', 'ף', 'ץ']);
  assert.deepEqual(FINALS_TABLE.map((cells) => Number(cells[3])), [20, 40, 50, 80, 90]);
  assert.deepEqual(FINALS_TABLE.map((cells) => Number(cells[4])), [500, 600, 700, 800, 900]);
  for (const cells of FINALS_TABLE) {
    assert.equal(Number(cells[3]), total(cells[0]), cells[1]);
    assert.equal(Number(cells[4]), total(cells[0], 'gadol'), cells[1]);
  }
});

test('the rendered numbers-above-400 table adds up', () => {
  assert.deepEqual(ABOVE_400_TABLE.map((cells) => Number(cells[0])), [500, 600, 700, 800, 900]);
  for (const [number, written, letters] of ABOVE_400_TABLE) {
    assert.equal(total(written), Number(number), written);
    assert.equal(letters, breakdown(written), written);
  }
});

test('the rendered worked examples show the totals the letters add up to', () => {
  const expected = { chai: 18, echad: 13, ahavah: 13, mashiach: 358, nachash: 358, yayin: 70, sod: 70, emet: 441, shalom: 376 };
  assert.equal(EXAMPLES_TABLE.length, Object.keys(expected).length);
  for (const [wordCell, , letters, valueCell] of EXAMPLES_TABLE) {
    const [word, translit] = wordCell.split(' ');
    assert.equal(total(word), expected[translit], translit);
    assert.equal(letters, breakdown(word), translit);
    const hasFinal = [...word].some((char) => FINAL.has(char));
    assert.equal(valueCell, hasFinal ? `${total(word)} gadol ${total(word, 'gadol')}` : String(total(word)), translit);
  }
  assert.ok(MAIN.includes('id="example-shalom"'));
});

test('the rendered methods table and year line carry their totals', () => {
  assert.deepEqual(METHODS_TABLE.map((cells) => Number(cells[3])), [441, 441, 9, 36]);
  assert.deepEqual(METHODS_TABLE.map((cells) => cells[2]), ['hechrachi', 'gadol', 'katan', 'siduri'].map((method) => breakdown('אמת', method)));
  assert.ok(MAIN_TEXT.includes('Here is emet, אמת, "truth"'));
  assert.ok(MAIN_TEXT.includes(`the Hebrew year 5787, which began at Rosh Hashanah in September 2026, is written ה׳תשפ״ז: ה׳ for 5,000, then ${breakdown('תשפ״ז')} = ${total('תשפ״ז')}`));
  assert.equal(total('ה') * 1000 + total('תשפ״ז'), 5787);
  assert.ok(MAIN_TEXT.includes('print just תשפ״ז'));
});

test('the FAQ structured data repeats the visible answers word for word', () => {
  const faq = jsonLd(SOURCE).find((block) => block['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage JSON-LD is missing');
  const section = SOURCE.match(/<section id="faq"[\s\S]*?<\/section>/)[0];
  const visible = [...section.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map(([, question, answer]) => ({
    question: visibleText(question),
    answer: visibleText(answer),
  }));
  assert.equal(visible.length, faq.mainEntity.length);
  faq.mainEntity.forEach((entry, index) => {
    assert.equal(entry['@type'], 'Question');
    assert.equal(entry.name, visible[index].question);
    assert.equal(entry.acceptedAnswer.text, visible[index].answer);
  });
});

// ---------- the page shell ----------

test('the head copies the template and targets the page\'s queries', () => {
  // The shared head blocks, verbatim from how-to-use-gematria.html.
  const shared = [
    TEMPLATE.slice(TEMPLATE.indexOf('    <meta charset'), TEMPLATE.indexOf('    <title>')),
    TEMPLATE.slice(TEMPLATE.indexOf('    <link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css" />'), TEMPLATE.indexOf('    <script type="application/ld+json">')),
  ];
  for (const block of shared) {
    assert.ok(block.length > 200);
    assert.ok(SOURCE.includes(block), `head block differs from the template:\n${block}`);
  }
  assert.ok(SOURCE.includes('<script src="/assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>'));

  const title = decode(SOURCE.match(/<title>([^<]*)<\/title>/)[1]);
  assert.ok(title.startsWith('Hebrew Gematria Chart'), title);
  assert.ok(title.endsWith(' | Gematria.Today'));
  assert.ok(title.length <= 60, `title is ${title.length} characters`);

  const description = decode(SOURCE.match(/<meta name="description" content="([^"]*)"/)[1]);
  assert.ok(description.length <= 160, `description is ${description.length} characters`);
  assert.match(description, /Hebrew gematria chart/);
  assert.match(description, /mispar hechrachi/);

  assert.ok(SOURCE.includes('<meta name="robots" content="index,follow,max-image-preview:large" />'));
  assert.ok(SOURCE.includes('<link rel="canonical" href="https://gematria.today/hebrew-gematria-chart.html" />'));
  assert.ok(SOURCE.includes('<meta property="og:url" content="https://gematria.today/hebrew-gematria-chart.html" />'));
  assert.ok(SOURCE.includes('<meta name="last-updated" content="2026-10-27" />'));
  const ogImage = TEMPLATE.match(/<meta property="og:image" content="([^"]+)"/)[1];
  assert.ok(SOURCE.includes(`<meta property="og:image" content="${ogImage}" />`));
  assert.ok(SOURCE.includes(`<meta name="twitter:image" content="${ogImage}" />`));

  const h1 = visibleText(SOURCE.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);
  assert.match(h1, /^Hebrew gematria chart/);
  const lead = visibleText(SOURCE.match(/<p class="lead[^"]*">([\s\S]*?)<\/p>/)[1]);
  assert.match(lead, /^This Hebrew gematria chart gives the numerical value of every Hebrew letter/);
  assert.match(lead, /mispar hechrachi/);
  says('By the Gematria.Today Editorial Team · Updated October 27, 2026');
  assert.ok(SOURCE.includes('<time datetime="2026-10-27">October 27, 2026</time>'));
});

test('the structured data describes this page', () => {
  const blocks = jsonLd(SOURCE);
  assert.deepEqual(blocks.map((block) => block['@type']), ['BreadcrumbList', 'Article', 'FAQPage']);
  const [breadcrumbs, article] = blocks;
  assert.deepEqual(breadcrumbs.itemListElement.map((item) => item.item), ['https://gematria.today/', 'https://gematria.today/hebrew-gematria-chart.html']);
  assert.equal(article.mainEntityOfPage, 'https://gematria.today/hebrew-gematria-chart.html');
  assert.equal(article.dateModified, '2026-10-27');
  assert.equal(article.headline, visibleText(SOURCE.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]));
});

test('the page has no inline script and links where it says it does', () => {
  for (const [, attrs, body] of SOURCE.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc\s*=/.test(attrs)) continue;
    assert.match(attrs, /type="application\/ld\+json"/, `inline script: <script${attrs}>${body.slice(0, 40)}`);
  }
  assert.ok(!/\son[a-z]+\s*=\s*"/i.test(SOURCE), 'inline event handler');

  for (const href of [
    '/why-english-gematria.html',
    '/gematria-cipher-chart.html',
    '/what-is-gematria.html',
    '/666-gematria.html',
    '/multi-cipher-calculator.html',
    '/how-to-use-gematria.html#test-the-match',
    '/definitions.html#defn-hebrew-gematria',
    '/bible-names-gematria.html',
    '/calculator.html?query=chai',
  ]) {
    assert.ok(SOURCE.includes(`href="${href}"`), `no link to ${href}`);
  }
  // Every in-page link lands on an element that exists.
  const ids = new Set([...SOURCE.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const [, fragment] of SOURCE.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(fragment), `#${fragment} has no target`);
  }
});
