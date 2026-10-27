import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Eleventy from '@11ty/eleventy';

import { CIPHERS, blogUrlForCipher, calculateAllCiphers, calculateCipher, digitalRoot } from '../page-scripts/multi-cipher-engine.mjs';
import { englishGematria } from '../netlify/functions/englishGematria.mjs';
import { englishGematria as ogMetaGematria } from '../netlify/edge-functions/lib/og-meta.mjs';
import { loadPartials, renderFooter } from '../scripts/lib/page-chrome.mjs';

// gematria-cipher-chart.html is a reference page whose chart, worked examples
// and prose numbers are generated from src/_data/cipherChart.js at build time.
// This test does not trust that data file. It renders the page through
// Eleventy, reads every number back out of the HTML, and checks each one
// against the multi-cipher engine (and the main calculator's englishGematria)
// directly.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = 'gematria-cipher-chart.html';
const SOURCE = readFileSync(join(ROOT, 'src', PAGE), 'utf8');
const TEMPLATE = readFileSync(join(ROOT, 'src/how-to-use-gematria.html'), 'utf8');
const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

// The site config reads its partials from the working directory.
process.chdir(ROOT);

async function renderPage() {
  const partials = await loadPartials(ROOT);
  const eleventy = new Eleventy(join('src', PAGE), join(tmpdir(), 'gematria-cipher-chart-test'), {
    quietMode: true,
    configPath: 'eleventy.config.mjs',
    config(eleventyConfig) {
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

const ENTITIES = {
  nbsp: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '–', mdash: '—', middot: '·',
  times: '×', minus: '−', hellip: '…', rarr: '→', amp: '&', lt: '<', gt: '>', quot: '"',
};

function decode(html) {
  return html
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/g, (match, name) => ENTITIES[name] ?? match)
    .replace(/[‘’]/g, "'");
}

// Text as a reader sees it: tags dropped, entities decoded, whitespace folded.
function visibleText(html) {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/ ([,.;:)])/g, '$1').replace(/\( /g, '(').trim();
}

const MAIN_TEXT = visibleText(MAIN);

function says(snippet) {
  assert.ok(
    MAIN_TEXT.includes(snippet),
    `${PAGE} no longer says:\n  ${snippet}\nIf you changed the wording, update this test and recheck the arithmetic.`,
  );
}

function section(id) {
  const start = MAIN.indexOf(`<section id="${id}"`);
  assert.ok(start >= 0, `no section #${id}`);
  return MAIN.slice(start, MAIN.indexOf('</section>', start));
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const total = (word, cipherId) => calculateCipher(word, cipherId).total;
const value = (letter, cipherId) => total(letter, cipherId);
const nameOf = (cipherId) => CIPHERS.find((cipher) => cipher.id === cipherId).name;
const list = (items, conjunction = 'and') => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`);

function randomWords(count, seed = 23) {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state;
  };
  return Array.from({ length: count }, () => {
    const length = 1 + (next() % 12);
    return Array.from({ length }, () => String.fromCharCode(65 + (next() % 26))).join('');
  });
}

// Words from the high bits of the same LCG: its low bits repeat on short
// cycles, which is fine for the identity checks above but would skew a rate.
function wellMixedWords(count, seed, minLength, maxLength) {
  let state = seed;
  const next = (n) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Math.floor((state / 2147483648) * n);
  };
  return Array.from({ length: count }, () => {
    const length = minLength + next(maxLength - minLength + 1);
    return Array.from({ length }, () => LETTERS[next(26)]).join('');
  });
}

// What a reduction takes off its unreduced cipher, from the letters alone:
// 9 for each letter in the middle run of that alphabet, 18 for each in the far run.
function reductionLoss(word, reducedId, baseId) {
  return [...word].reduce((sum, letter) => sum + value(letter, baseId) - value(letter, reducedId), 0);
}

// ---------- the chart ----------

test('the chart has one column per engine cipher, in the calculator\'s order', () => {
  const table = MAIN.slice(MAIN.indexOf('<table id="cipherChartTable"'), MAIN.indexOf('</table>', MAIN.indexOf('<table id="cipherChartTable"')));
  const head = table.slice(table.indexOf('<thead>'), table.indexOf('</thead>'));
  const columns = [...head.matchAll(/<th scope="col" class="text-end" data-cipher="([a-z-]+)"><a href="#([a-z-]+)">/g)];
  assert.deepEqual(columns.map(([, id]) => id), CIPHERS.map((cipher) => cipher.id));
  // Each heading links to that cipher's own section.
  for (const [, id, anchor] of columns) assert.match(MAIN, new RegExp(`<h3 id="${anchor}"`), id);
  // The chart scrolls inside its own box on a narrow screen rather than widening the page.
  assert.match(MAIN, /<div class="table-responsive mb-0">\s*<table id="cipherChartTable"/);
  assert.match(section('chart'), /class="small text-muted d-md-none">On a phone, swipe the table sideways/);
  assert.match(section('chart'), /<a href="#ciphers">one-cipher charts<\/a>/);
  assert.match(section('chart'), /<a href="#sumerian">Sumerian chart<\/a> is the one this site uses/);
});

test('every letter in every cipher matches the multi-cipher engine', () => {
  const rows = [...MAIN.matchAll(/<tr data-letter="([A-Z])">([\s\S]*?)<\/tr>/g)];
  assert.deepEqual(rows.map(([, letter]) => letter), LETTERS);
  for (const [, letter, row] of rows) {
    assert.match(row, new RegExp(`<th scope="row">${letter}</th>`));
    const cells = [...row.matchAll(/<td class="[^"]*" data-cipher="([a-z-]+)">(\d+)<\/td>/g)];
    assert.deepEqual(cells.map(([, id]) => id), CIPHERS.map((cipher) => cipher.id), letter);
    for (const [, id, shown] of cells) {
      assert.equal(Number(shown), value(letter, id), `${letter} in ${id}`);
    }
  }
});

test('the A-Z total row adds up each engine column', () => {
  const [, row] = MAIN.match(/<tr data-letter="total">([\s\S]*?)<\/tr>/);
  const cells = [...row.matchAll(/data-cipher="([a-z-]+)">(\d+)<\/td>/g)];
  assert.equal(cells.length, CIPHERS.length);
  for (const [, id, shown] of cells) {
    const expected = LETTERS.reduce((sum, letter) => sum + value(letter, id), 0);
    assert.equal(Number(shown), expected, id);
    assert.equal(Number(shown), total(LETTERS.join(''), id), `${id}: the alphabet as one word`);
  }
});

test('each one-cipher chart lists all 26 letters with the engine\'s values', () => {
  const grids = [...MAIN.matchAll(/<dl class="letter-value-grid mb-3" data-cipher="([a-z-]+)">([\s\S]*?)<\/dl>/g)];
  assert.deepEqual(grids.map(([, id]) => id), CIPHERS.map((cipher) => cipher.id));
  for (const [, id, grid] of grids) {
    const cells = [...grid.matchAll(/<dt class="letter-value-grid__letter">([A-Z])<\/dt><dd class="letter-value-grid__value mb-0">(\d+)<\/dd>/g)];
    assert.deepEqual(cells.map(([, letter]) => letter), LETTERS, id);
    for (const [, letter, shown] of cells) assert.equal(Number(shown), value(letter, id), `${letter} in ${id}`);
  }
});

test('the Sumerian column is the main calculator\'s cipher, letter for letter', () => {
  for (const letter of LETTERS) {
    assert.equal(Number(englishGematria(letter)), value(letter, 'sumerian'), letter);
    assert.equal(Number(ogMetaGematria(letter)), value(letter, 'sumerian'), `og-meta ${letter}`);
  }
  // It is the column marked as this site's, and the bold one.
  assert.match(MAIN, /data-cipher="sumerian"><a href="#sumerian">Sumerian<\/a><span class="d-block small fw-normal text-muted"> \(this site\)<\/span>/);
  for (const [, cls, id] of MAIN.matchAll(/<td class="([^"]*)" data-cipher="([a-z-]+)">\d+<\/td>/g)) {
    assert.equal(cls.includes('fw-semibold'), id === 'sumerian', `${id} bold`);
  }
});

// ---------- the prose ----------

test('the lead and the site-cipher section quote the engine\'s values', () => {
  const ordinal = (letter) => value(letter, 'english-ordinal');
  const sumerian = (letter) => value(letter, 'sumerian');
  const factor = sumerian('A') / ordinal('A');
  for (const letter of LETTERS) assert.equal(sumerian(letter), factor * ordinal(letter), letter);
  says(`This gematria cipher chart gives the value of every letter from A to Z in the ${WORDS[CIPHERS.length]} English ciphers of the multi-cipher calculator, from English Ordinal (A = ${ordinal('A')} to Z = ${ordinal('Z')}) to English Gematria (Base-${factor}), the table this site's main calculator uses and the calculator lists as Sumerian (A = ${sumerian('A')} to Z = ${sumerian('Z')}).`);
  says(`Each letter is worth its alphabet position times ${factor}, so A = ${sumerian('A')}, B = ${sumerian('B')} and Z = ${sumerian('Z')}.`);
  // The other names the site's own pages use for it.
  says(`English Gematria (Base-${factor}), the table the multi-cipher calculator and many other sites call Sumerian or English Sumerian.`);
  assert.match(readFileSync(join(ROOT, 'src/why-english-gematria.html'), 'utf8'), new RegExp(`English Base-${factor} cipher`));

  // Every Sumerian total is a multiple of six, so only three digital roots occur.
  const roots = new Set(randomWords(3000).map((word) => digitalRoot(Number(englishGematria(word)))));
  assert.deepEqual([...roots].sort(), [3, 6, 9]);
  says(`Every total is a multiple of ${factor}, so a word's digital root can only be ${list([...roots].sort().map(String), 'or')}.`);
  says(`CIPHER is ${englishGematria('CIPHER')} here and ${total('CIPHER', 'english-ordinal')} in English Ordinal.`);
  assert.equal(Number(englishGematria('CIPHER')), factor * total('CIPHER', 'english-ordinal'));
});

test('each cipher section states its own table correctly', () => {
  const v = value;
  for (const cipher of CIPHERS) {
    const id = cipher.id;
    const heading = MAIN.match(new RegExp(`<h3 id="${id}"[^>]*>([\\s\\S]*?)</h3>`))[1];
    const text = visibleText(heading);
    if (['full-reduction'].includes(id)) {
      const values = LETTERS.map((letter) => v(letter, id));
      assert.ok(text.endsWith(`(${Math.min(...values)} to ${Math.max(...values)})`), text);
    } else if (id === 'jewish-latin') {
      assert.ok(text.endsWith(`(${v('A', id)}–${v('I', id)}, ${v('J', id)}–${v('R', id)}, ${v('S', id)}–${v('Z', id)})`), text);
    } else {
      assert.ok(text.endsWith(`(A = ${v('A', id)} to Z = ${v('Z', id)})`), text);
    }
  }

  // Ordinal is the base of most tables, not all: Jewish / Latin is separate.
  says('it is the baseline most of the other tables are built from: Reverse Ordinal mirrors it, Full Reduction shrinks it to single digits (and Reverse Full Reduction does the same to Reverse Ordinal), and Sumerian multiplies it.');

  // Reverse Ordinal mirrors English Ordinal.
  for (const letter of LETTERS) assert.equal(v(letter, 'english-ordinal') + v(letter, 'reverse-ordinal'), 27, letter);
  says(`A letter's Ordinal and Reverse Ordinal values always add to 27 (M is ${v('M', 'english-ordinal')} and ${v('M', 'reverse-ordinal')}), so a word's Reverse Ordinal total is 27 times its letter count minus its Ordinal total.`);
  for (const word of randomWords(1000, 29)) {
    assert.equal(total(word, 'reverse-ordinal'), 27 * word.length - total(word, 'english-ordinal'), word);
    // Reversing the word changes nothing: only the alphabet is reversed.
    assert.equal(total([...word].reverse().join(''), 'reverse-ordinal'), total(word, 'reverse-ordinal'), word);
  }
  says("It reverses the alphabet, not the word, and it adds no information that the Ordinal total and the letter count don't already hold.");

  // Full Reduction.
  const where = (id, n) => LETTERS.filter((letter) => v(letter, id) === n);
  says(`${list(where('full-reduction', 1))} are all 1, and ${list(where('full-reduction', 9))} are both 9. The last run stops one short, at Z = ${v('Z', 'full-reduction')}.`);
  assert.equal(new Set(LETTERS.map((letter) => v(letter, 'full-reduction'))).size, 9);
  says('With only 9 values shared among 26 letters');
  assert.equal(total('ENGLISH', 'english-ordinal'), total('JESUS', 'english-ordinal'));
  says(`ENGLISH and JESUS are both ${total('JESUS', 'english-ordinal')} in English Ordinal, and ${total('ENGLISH', 'full-reduction')} and ${total('JESUS', 'full-reduction')} here.`);

  // Reverse Full Reduction.
  says(`A is ${v('A', 'reverse-full-reduction')} because its Reverse Ordinal value, ${v('A', 'reverse-ordinal')}, reduces to ${digitalRoot(v('A', 'reverse-ordinal'))}.`);
  const pairSums = LETTERS.map((letter) => v(letter, 'full-reduction') + v(letter, 'reverse-full-reduction'));
  const exceptions = LETTERS.filter((_, index) => pairSums[index] !== 9);
  assert.deepEqual(exceptions, where('reverse-full-reduction', 9));
  for (const letter of exceptions) assert.equal(v(letter, 'full-reduction'), 9, letter);
  says(`A letter's two reduced values add to 9, except ${list(exceptions)}, which are 9 in both ciphers.`);
  for (let digit = 1; digit <= 8; digit += 1) assert.equal(where('reverse-full-reduction', digit).length, 3, `digit ${digit}`);
  says(`So each digit from 1 to 8 stands for three letters, and 9 for only ${WORDS[exceptions.length]}.`);
  says('It is easy to miscount by hand, because its values run against the alphabet');
  assert.ok(!MAIN_TEXT.includes('most often miscounted'), 'an unsourced claim is back');

  // Sumerian and 666.
  for (const word of randomWords(3000, 31)) {
    assert.equal(total(word, 'sumerian') === 666, total(word, 'english-ordinal') === 111, word);
  }
  says('Because every total is exactly 6 times the English Ordinal total, a word reaches 666 in this cipher exactly when its English Ordinal total is 111.');

  // Reverse Sumerian mirrors Sumerian.
  for (const letter of LETTERS) {
    assert.equal(v(letter, 'sumerian') + v(letter, 'reverse-sumerian'), 162, letter);
    assert.equal(v(letter, 'reverse-sumerian'), 6 * v(letter, 'reverse-ordinal'), letter);
  }
  says("a letter's Sumerian and Reverse Sumerian values always add to 162");
  // The Atlas has no Reverse Sumerian post; the Sumerian post it links explains the x6 scaling.
  const atlasSeed = readFileSync(join(ROOT, 'sql/seed_english_gematria_cipher_atlas_series.sql'), 'utf8');
  assert.doesNotMatch(atlasSeed, /reverse sumerian/i);
  assert.equal(blogUrlForCipher('reverse-sumerian'), blogUrlForCipher('sumerian'));
  assert.match(atlasSeed, /English Sumerian total = Simple Ordinal total × 6/);
  says('The Cipher Atlas has no post of its own on it; its Sumerian post explains the ×6 scaling the two share, and why scaling adds no information.');

  // Jewish / Latin bands and weights.
  const jl = (letter) => v(letter, 'jewish-latin');
  const sumOf = (first, last) => LETTERS.slice(LETTERS.indexOf(first), LETTERS.indexOf(last) + 1).reduce((sum, letter) => sum + jl(letter), 0);
  says(`A to I count ${jl('A')} to ${jl('I')}, J to R count ${jl('J')} to ${jl('R')} and S to Z count ${jl('S')} to ${jl('Z')}.`);
  says(`S alone (${jl('S')}) outweighs A to I together (${sumOf('A', 'I')}), and Z (${jl('Z')}) outweighs A to R together (${sumOf('A', 'R')}).`);
  assert.ok(jl('S') > sumOf('A', 'I'));
  assert.ok(jl('Z') > sumOf('A', 'R'));
  for (const word of randomWords(2000, 37)) {
    assert.equal(digitalRoot(total(word, 'jewish-latin')), digitalRoot(total(word, 'english-ordinal')), word);
  }
  says('Like the two reductions, its total cannot be worked out from the English Ordinal total, though the two always share a digital root.');
  // Other calculators' names for this table, and the different table some call Jewish.
  assert.match(readFileSync(join(ROOT, 'page-scripts/multi-cipher-engine.mjs'), 'utf8'), /also called English Extended/);
  says('The name is not settled either: some calculators call this table English Extended or Agrippan, and some use the name Jewish for a different table, which gives J, V and W the three largest values and every other letter from K onwards a smaller one than here. Check the letter values before you compare totals from two calculators.');
});

test('the worked example runs CIPHER through every cipher exactly as the engine does', () => {
  const results = calculateAllCiphers('CIPHER');
  const rows = [...section('worked-example').matchAll(/<tr data-cipher="([a-z-]+)">([\s\S]*?)<\/tr>/g)];
  assert.deepEqual(rows.map(([, id]) => id), CIPHERS.map((cipher) => cipher.id));
  for (const [, id, row] of rows) {
    const result = results.find((entry) => entry.cipherId === id);
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => visibleText(cell));
    assert.equal(visibleText(row.match(/<th scope="row">([\s\S]*?)<\/th>/)[1]), nameOf(id));
    // The sum wraps on a phone, so Total and Digital root stay on screen.
    assert.doesNotMatch(row, /text-nowrap/, id);
    assert.deepEqual(cells, [
      result.perLetter.map((entry) => entry.value).join(' + '),
      String(result.total),
      String(result.digitalRoot),
    ], id);
    // The letter values are the chart's own.
    assert.deepEqual(result.perLetter.map((entry) => entry.value), [...'CIPHER'].map((letter) => value(letter, id)), id);
  }

  const t = Object.fromEntries(results.map((result) => [result.cipherId, result.total]));
  const iAndR = [...'CIPHER'].filter((letter) => letter === 'I' || letter === 'R').length;
  assert.equal(t['english-ordinal'] + t['reverse-ordinal'], 27 * 6);
  says(`English Ordinal ${t['english-ordinal']} + Reverse Ordinal ${t['reverse-ordinal']} = ${t['english-ordinal'] + t['reverse-ordinal']}, which is 27 × 6 letters.`);
  assert.equal(t.sumerian, 6 * t['english-ordinal']);
  assert.equal(t['reverse-sumerian'], 6 * t['reverse-ordinal']);
  says(`Sumerian ${t.sumerian} = 6 × ${t['english-ordinal']}, and Reverse Sumerian ${t['reverse-sumerian']} = 6 × ${t['reverse-ordinal']}.`);
  const root = digitalRoot(t['english-ordinal']);
  assert.equal(digitalRoot(t['full-reduction']), root);
  assert.equal(digitalRoot(t['jewish-latin']), root);
  says(`Full Reduction ${t['full-reduction']} and Jewish / Latin ${t['jewish-latin']} both have the digital root ${root}, the same as English Ordinal ${t['english-ordinal']}.`);
  assert.equal(t['reverse-full-reduction'], 9 * 6 - t['full-reduction'] + 9 * iAndR);
  says(`Reverse Full Reduction ${t['reverse-full-reduction']} = 9 × 6 − ${t['full-reduction']} + 9 × ${iAndR}, the ${iAndR} being CIPHER's I and R.`);
  says(`The main calculator gives CIPHER ${englishGematria('CIPHER')}, the Sumerian value.`);
  assert.equal(Number(englishGematria('CIPHER')), t.sumerian);
});

test('the FAITH and HOPE comparison and what it concludes are right', () => {
  const faith = Object.fromEntries(calculateAllCiphers('FAITH').map((r) => [r.cipherId, r.total]));
  const hope = Object.fromEntries(calculateAllCiphers('HOPE').map((r) => [r.cipherId, r.total]));
  const rows = [...section('relationships').matchAll(/<tr data-cipher="([a-z-]+)">([\s\S]*?)<\/tr>/g)];
  assert.deepEqual(rows.map(([, id]) => id), CIPHERS.map((cipher) => cipher.id));
  for (const [, id, row] of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => visibleText(cell));
    assert.deepEqual(cells, [String(faith[id]), String(hope[id]), faith[id] === hope[id] ? 'Yes' : 'No'], id);
  }
  const matching = CIPHERS.filter((cipher) => faith[cipher.id] === hope[cipher.id]).map((cipher) => cipher.id);
  assert.deepEqual(matching, ['english-ordinal', 'full-reduction', 'sumerian']);
  says(`They match in ${WORDS[matching.length]} of the seven ciphers: Ordinal, Full Reduction and Sumerian.`);
  assert.equal(faith.sumerian, 6 * faith['english-ordinal']);
  // The Full Reduction match follows from equal Ordinal totals plus equal losses.
  const faithLoss = reductionLoss('FAITH', 'full-reduction', 'english-ordinal');
  const hopeLoss = reductionLoss('HOPE', 'full-reduction', 'english-ordinal');
  assert.equal(faithLoss, hopeLoss);
  assert.equal(faith['full-reduction'], faith['english-ordinal'] - faithLoss);
  says(`But the Sumerian match (${faith.sumerian}) is the Ordinal match (${faith['english-ordinal']}) multiplied by 6, and the Full Reduction match was far more likely than it looks: once the Ordinal totals are level, the Full Reduction totals match whenever the two words lose the same amount, and FAITH and HOPE both lose ${faithLoss} (${faith['english-ordinal']} − ${faithLoss} = ${faith['full-reduction']}). So this is one fact plus weak support, not three facts.`);
  assert.ok(!MAIN_TEXT.includes('two facts, not three'), 'the Full Reduction match is counted as independent again');

  // "Far more likely": among random words, a level Ordinal total makes a Full
  // Reduction match many times likelier than it is between any two words.
  const words = wellMixedWords(120000, 43, 3, 8);
  let pairs = 0;
  let reductionMatches = 0;
  let level = 0;
  let levelReductionMatches = 0;
  for (let index = 0; index < words.length; index += 2) {
    const [a, b] = [words[index], words[index + 1]];
    const reductionMatch = total(a, 'full-reduction') === total(b, 'full-reduction');
    pairs += 1;
    if (reductionMatch) reductionMatches += 1;
    if (total(a, 'english-ordinal') !== total(b, 'english-ordinal')) continue;
    level += 1;
    if (reductionMatch) levelReductionMatches += 1;
    // Level Ordinal totals: the reductions match exactly when the losses do.
    assert.equal(reductionMatch, reductionLoss(a, 'full-reduction', 'english-ordinal') === reductionLoss(b, 'full-reduction', 'english-ordinal'), `${a} ${b}`);
  }
  assert.ok(level > 200, `only ${level} level pairs`);
  const baseRate = reductionMatches / pairs;
  const levelRate = levelReductionMatches / level;
  assert.ok(levelRate > 5 * baseRate, `Full Reduction: ${levelRate} given level Ordinal totals vs ${baseRate}`);

  const gap = Math.abs(faith['reverse-ordinal'] - hope['reverse-ordinal']);
  assert.equal(gap, 27 * ('FAITH'.length - 'HOPE'.length));
  says(`with equal Ordinal totals and lengths of 5 and 4 letters, their Reverse Ordinal totals had to differ by 27 for each letter of difference, and they do (${faith['reverse-ordinal']} and ${hope['reverse-ordinal']}).`);
  assert.ok(MAIN.includes(`href="/v/${faith.sumerian}">Every word worth ${faith.sumerian}</a>`));
  // The cipher-first advice is in how-to-use's mistakes list, not the research guide.
  says('its common mistakes include switching ciphers until something matches, which is why the cipher comes before the results.');
  assert.match(readFileSync(join(ROOT, 'src/how-to-use-gematria.html'), 'utf8'), /<section id="mistakes"[\s\S]*Switching ciphers until something matches/);
  says('the research guide sets out the full workflow, from the first calculation to publishing an interpretation.');
});

test('the three groups of ciphers are described correctly', () => {
  for (const word of randomWords(2000, 41)) {
    const t = Object.fromEntries(calculateAllCiphers(word).map((r) => [r.cipherId, r.total]));
    const n = word.length;
    // The Ordinal family: one total and the letter count fix the other three.
    assert.equal(t['reverse-ordinal'], 27 * n - t['english-ordinal'], word);
    assert.equal(t.sumerian, 6 * t['english-ordinal'], word);
    assert.equal(t['reverse-sumerian'], 6 * (27 * n - t['english-ordinal']), word);
    // The reductions keep the digital root of the cipher they reduce.
    assert.equal(digitalRoot(t['full-reduction']), digitalRoot(t['english-ordinal']), word);
    assert.equal(digitalRoot(t['reverse-full-reduction']), digitalRoot(t['reverse-ordinal']), word);
    // ...because each is that cipher minus 9 per middle-run letter and 18 per far-run letter.
    const count = (pattern) => [...word].filter((letter) => pattern.test(letter)).length;
    assert.equal(t['full-reduction'], t['english-ordinal'] - 9 * count(/[J-R]/) - 18 * count(/[S-Z]/), word);
    assert.equal(t['reverse-full-reduction'], t['reverse-ordinal'] - 9 * count(/[I-Q]/) - 18 * count(/[A-H]/), word);
  }
  says('The Ordinal family: English Ordinal, Reverse Ordinal, Sumerian and Reverse Sumerian. Given any one of these totals and the number of letters, the other three follow.');
  says('The reductions: Full Reduction and Reverse Full Reduction. Each depends on exactly which letters a word contains, but keeps the digital root of the cipher it reduces. Full Reduction is the English Ordinal total minus 9 for each letter from J to R and 18 for each from S to Z; Reverse Full Reduction is the Reverse Ordinal total minus 9 for each letter from I to Q and 18 for each from A to H. So two words level in the unreduced cipher also match in its reduction whenever they lose the same amount.');
  says("Jewish / Latin, which also depends on the exact letters, and also keeps English Ordinal's digital root.");
  // Same length and Ordinal total, different reductions and Jewish / Latin: the
  // three groups really are separate.
  assert.equal(total('AS', 'english-ordinal'), total('BR', 'english-ordinal'));
  assert.notEqual(total('AS', 'full-reduction'), total('BR', 'full-reduction'));
  assert.notEqual(total('AS', 'jewish-latin'), total('BR', 'jewish-latin'));
});

test('no number is typed into the copy: everything but the date and 666 comes from the data', () => {
  const body = SOURCE.slice(SOURCE.indexOf('<body>'));
  const copy = decode(body
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/\{%[\s\S]*?%\}/g, ' ')
    .replace(/<[^>]+>/g, ' '));
  const numbers = [...copy.matchAll(/\d+/g)].map(([n]) => n);
  assert.deepEqual([...new Set(numbers)].sort(), ['2026', '27', '666'], `typed numbers: ${numbers.join(', ')}`);
  // The date is the byline.
  assert.match(body, /Updated <time datetime="2026-10-27">October 27, 2026<\/time>/);
  // The chart is generated, never written out.
  assert.ok(SOURCE.includes('{%- for row in cipherChart.rows %}'));
});

// ---------- the page around the content ----------

test('the head is the template\'s, with this page\'s own SEO fields', () => {
  // Lines copied verbatim from how-to-use-gematria.html.
  for (const line of [
    '<script src="/early-bootstrap.js"></script>',
    '<script defer src="/site-bundle.js"></script>',
    '<link rel="stylesheet" href="/assets/fonts/fonts.css" />',
    '<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg?v=2" />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />',
    '<link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css" />',
    '<link rel="preload" as="style" href="/api/public-theme-css" data-promote-stylesheet />',
    '<link rel="stylesheet" href="/theme.css" />',
    '<link rel="preload" as="style" href="/theme-deferred.css" data-promote-stylesheet />',
    '<script src="/pwa-register.js" defer></script>',
  ]) {
    assert.ok(TEMPLATE.includes(line), `template lost ${line}`);
    assert.ok(HTML.includes(line), `page is missing ${line}`);
  }
  const ogImage = TEMPLATE.match(/<meta property="og:image" content="([^"]+)"/)[1];
  assert.ok(HTML.includes(`<meta property="og:image" content="${ogImage}" />`));
  assert.ok(HTML.includes(`<meta name="twitter:image" content="${ogImage}" />`));

  const title = decode(HTML.match(/<title>([^<]+)<\/title>/)[1]);
  assert.equal(title, `Gematria Cipher Chart: ${CIPHERS.length} English Ciphers A–Z | Gematria.Today`);
  assert.ok(title.length <= 62, `title is ${title.length} characters`);
  const description = decode(HTML.match(/<meta name="description" content="([^"]+)"/)[1]);
  assert.ok(description.length <= 160, `description is ${description.length} characters`);
  assert.match(description, /^Gematria cipher chart/);
  assert.match(description, new RegExp(`Sumerian \\(A=${value('A', 'sumerian')} to Z=${value('Z', 'sumerian')}\\)`));
  // All seven, with the two reductions named together.
  for (const name of ['Ordinal', 'Reverse Ordinal', 'both reductions', 'Sumerian', 'Reverse Sumerian', 'Jewish / Latin']) {
    assert.ok(description.includes(name), `description leaves out ${name}`);
  }
  assert.match(HTML, /<link rel="canonical" href="https:\/\/gematria\.today\/gematria-cipher-chart\.html" \/>/);
  assert.match(HTML, /<meta property="og:url" content="https:\/\/gematria\.today\/gematria-cipher-chart\.html" \/>/);
  assert.match(HTML, /<meta name="robots" content="index,follow,max-image-preview:large" \/>/);
  assert.match(HTML, /<meta name="last-updated" content="2026-10-27" \/>/);
  assert.match(HTML, /<meta name="author" content="Gematria.Today Editorial Team" \/>/);

  // The primary query leads the h1 and the first paragraph.
  const h1 = visibleText(MAIN.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);
  assert.equal(h1, `Gematria cipher chart: ${WORDS[CIPHERS.length]} English ciphers, A to Z`);
  const lead = visibleText(MAIN.match(/<p class="lead mb-0">([\s\S]*?)<\/p>/)[1]);
  assert.match(lead, /^This gematria cipher chart /);
  assert.match(MAIN, /By the <a href="\/disclaimer.html">Gematria.Today Editorial Team<\/a> &middot; Updated <time datetime="2026-10-27">October 27, 2026<\/time>/);
});

test('the structured data parses, and the FAQ schema repeats the visible answers', () => {
  const blocks = jsonLd(HTML);
  assert.deepEqual(blocks.map((block) => block['@type']), ['BreadcrumbList', 'Article', 'FAQPage']);
  const [breadcrumb, article, faq] = blocks;
  assert.deepEqual(breadcrumb.itemListElement.map((item) => item.item), ['https://gematria.today/', 'https://gematria.today/gematria-cipher-chart.html']);
  assert.equal(article.mainEntityOfPage, 'https://gematria.today/gematria-cipher-chart.html');
  assert.equal(article.dateModified, '2026-10-27');
  assert.equal(article.headline, visibleText(MAIN.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]));

  const visible = [...section('faq').matchAll(/<dt class="h6 mt-3">([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)]
    .map(([, question, answer]) => ({ question: visibleText(question), answer: visibleText(answer) }));
  assert.equal(faq.mainEntity.length, visible.length);
  faq.mainEntity.forEach((entry, index) => {
    assert.equal(entry.name, visible[index].question);
    const text = entry.acceptedAnswer.text.replace(/\.$/, '');
    assert.ok(visible[index].answer.startsWith(text), `FAQ answer ${index + 1} differs from the page:\n  ${entry.acceptedAnswer.text}\n  ${visible[index].answer}`);
  });
  // The FAQ's numbers are the engine's.
  const jl = (letter) => value(letter, 'jewish-latin');
  says(`An English table modelled on Hebrew numerals: A to I count ${jl('A')} to ${jl('I')}, J to R count ${jl('J')} to ${jl('R')} and S to Z count ${jl('S')} to ${jl('Z')}. Some calculators give the name Jewish to a different table`);
  says(`A = ${value('A', 'english-ordinal')}, B = ${value('B', 'english-ordinal')} … Z = ${value('Z', 'english-ordinal')}, each letter's position in the alphabet.`);
  says(`from A = ${value('A', 'reverse-ordinal')} to Z = ${value('Z', 'reverse-ordinal')}.`);

  // No other page's FAQPage asks the same question, so the pages do not compete.
  const mine = new Set(faq.mainEntity.map((entry) => entry.name.toLowerCase()));
  for (const file of readdirSync(join(ROOT, 'src')).filter((name) => name.endsWith('.html') && name !== PAGE)) {
    for (const [, name] of readFileSync(join(ROOT, 'src', file), 'utf8').matchAll(/"@type": "Question",\s*"name": "([^"]+)"/g)) {
      assert.ok(!mine.has(name.toLowerCase()), `${file} already asks "${name}"`);
    }
  }
});

test('the page links the calculators, its sibling pages and every Cipher Atlas post', () => {
  const hrefs = new Set([...MAIN.matchAll(/href="([^"]+)"/g)].map(([, href]) => decode(href)));
  for (const href of [
    '/multi-cipher-calculator.html',
    '/calculator.html',
    '/name-calculator.html',
    '/hebrew-gematria-chart.html',
    '/what-is-gematria.html',
    '/666-gematria.html',
    '/how-to-use-gematria.html',
    '/why-english-gematria.html',
    '/bible-names-gematria.html',
    '/gematria-guide.html',
    '/how-to-use-gematria.html#mistakes',
    '/w/cipher',
    `/calculator.html?query=cipher`,
  ]) {
    assert.ok(hrefs.has(href), `missing link to ${href}`);
  }

  // blog.html reads no series parameter, so links to the series open its first post.
  assert.ok(![...hrefs].some((href) => href.includes('series=')), 'a link uses ?series=, which blog.html ignores');
  const firstAtlasPost = blogUrlForCipher('english-ordinal');
  assert.match(blogUrlForCipher('english-ordinal'), /simple-ordinal/);
  assert.ok(MAIN.includes(`<a href="${firstAtlasPost}">English Gematria Cipher Atlas</a>`));
  assert.ok(MAIN.includes(`<a class="news-inline-link d-block fw-semibold" href="${firstAtlasPost}">The English Gematria Cipher Atlas</a>`));

  // The same atlas posts the multi-cipher calculator links, one per cipher.
  const calculatorPage = readFileSync(join(ROOT, 'src/multi-cipher-calculator.html'), 'utf8');
  for (const cipher of CIPHERS) {
    const url = blogUrlForCipher(cipher.id);
    assert.ok(hrefs.has(url), `${cipher.id} atlas post`);
    assert.ok(calculatorPage.includes(`href="${url}"`), `${url} is not linked from the calculator`);
  }

  // Each link's text says where it goes: one text never leads to two places (WCAG 2.4.9).
  const destinations = new Map();
  for (const [, href, text] of MAIN.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const label = visibleText(text).toLowerCase();
    if (!destinations.has(label)) destinations.set(label, new Set());
    destinations.get(label).add(decode(href));
  }
  for (const [label, targets] of destinations) {
    assert.equal(targets.size, 1, `"${label}" links to ${[...targets].join(', ')}`);
  }
  // Atlas links name the cipher the post is about; Reverse Sumerian's names Sumerian.
  const glossary = readFileSync(join(ROOT, 'src/definitions.html'), 'utf8');
  for (const cipher of CIPHERS) {
    const block = MAIN.slice(MAIN.indexOf(`<dl class="letter-value-grid mb-3" data-cipher="${cipher.id}">`));
    const line = block.slice(block.indexOf('<p class="small text-muted mb-0">'), block.indexOf('</p>'));
    const owner = CIPHERS.find((other) => blogUrlForCipher(other.id) === blogUrlForCipher(cipher.id));
    assert.ok(line.includes(`<a href="${blogUrlForCipher(cipher.id)}">${owner.name} in the Cipher Atlas</a>`), `${cipher.id}: ${line}`);
    // Glossary links carry the glossary's own term for the entry.
    for (const [, anchor, term] of line.matchAll(/<a href="\/definitions\.html#([a-z-]+)">([^<]+) in the glossary<\/a>/g)) {
      const entry = glossary.match(new RegExp(`<dt id="${anchor}">([^<]+)</dt>`));
      assert.ok(entry, `no glossary entry #${anchor}`);
      assert.ok(entry[1].startsWith(term), `${cipher.id}: "${term}" is not "${entry[1]}"`);
    }
  }
  assert.ok(!MAIN.includes('>Reverse Sumerian in the Cipher Atlas<'));

  // Same-page anchors resolve, and so do anchors into other pages.
  for (const href of hrefs) {
    const [path, anchor] = href.split('#');
    if (!path && anchor) {
      assert.match(MAIN, new RegExp(`id="${anchor}"`), href);
    } else if (/^\/[a-z0-9-]+\.html$/.test(path)) {
      const file = join(ROOT, 'src', path);
      // The other new reference pages are built alongside this one.
      if (!existsSync(file) && ['/666-gematria.html', '/what-is-gematria.html', '/hebrew-gematria-chart.html'].includes(path)) continue;
      assert.ok(existsSync(file), `${href} has no page`);
      if (anchor) assert.match(readFileSync(file, 'utf8'), new RegExp(`id="${anchor}"`), href);
    }
  }
});

test('the page has no inline JavaScript', () => {
  for (const [, attrs, body] of HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc\s*=/.test(attrs)) continue;
    assert.match(attrs, /type="application\/ld\+json"/, `inline script: ${body.slice(0, 60)}`);
  }
  assert.doesNotMatch(HTML, /\son[a-z]+\s*=\s*"/i);
  assert.doesNotMatch(HTML, /\b(?:href|src)\s*=\s*"\s*javascript:/i);
  // Same skeleton as the template: skip link, nav, main, footer, bootstrap bundle.
  assert.ok(SOURCE.includes('<a class="skip-link" href="#mainContent">Skip to main content</a>\n{% nav %}'));
  assert.ok(SOURCE.includes('{% footer %}\n    <script src="/assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>'));
});
