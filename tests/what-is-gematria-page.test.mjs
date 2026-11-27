import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { digitalRoot, englishGematria } from '../netlify/functions/englishGematria.mjs';
import { englishGematria as edgeEnglishGematria } from '../netlify/edge-functions/lib/og-meta.mjs';
import { CIPHERS } from '../page-scripts/multi-cipher-engine.mjs';
import { FOOTER_SECTION_BY_FILE, loadPartials, renderFooter, renderNav } from '../scripts/lib/page-chrome.mjs';

// what-is-gematria.html is an evergreen explainer that hand-writes numbers
// into prose: a worked example, cipher totals, Hebrew and Greek sums, counts of
// letters and ciphers. Prose does not recompute itself, so every number is
// asserted twice -- that the copy still says it, and that the arithmetic (the
// site's own engines where they exist) agrees.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const PAGE = read('src/what-is-gematria.html');
const TEMPLATE = read('src/how-to-use-gematria.html');
const HEAD = PAGE.slice(0, PAGE.indexOf('</head>'));
const BODY = PAGE.slice(PAGE.indexOf('<body>'));
const MAIN = PAGE.slice(PAGE.indexOf('<main'), PAGE.indexOf('</main>'));
const CANONICAL = 'https://gematria.today/what-is-gematria.html';

// Built in parallel; the integrator wires them into the nav and sitemap.
const SIBLING_PAGES = ['/hebrew-gematria-chart.html', '/666-gematria.html', '/gematria-cipher-chart.html'];

function assertCopyContains(snippet) {
  assert.ok(
    PAGE.includes(snippet),
    `src/what-is-gematria.html no longer contains the pinned copy:\n  ${snippet}\nIf you changed the wording, update this test and recheck the arithmetic.`,
  );
}

const ENTITIES = {
  '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”',
  '&times;': '×', '&minus;': '−', '&rarr;': '→', '&hellip;': '…', '&middot;': '·', '&amp;': '&', '&quot;': '"', '&#39;': "'",
};

function textOf(html) {
  const decoded = html.replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, (entity) => {
    assert.ok(entity in ENTITIES, `unknown entity ${entity}; add it to the decoder`);
    return ENTITIES[entity];
  });
  return decoded.replace(/\s+/g, ' ').replace(/ ([.,;:?!])/g, '$1').trim();
}

function metaContent(attribute, name) {
  const match = HEAD.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)" />`));
  assert.ok(match, `missing <meta ${attribute}="${name}">`);
  return match[1];
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

function cipherValue(cipherId, word) {
  const cipher = CIPHERS.find((entry) => entry.id === cipherId);
  assert.ok(cipher, `unknown cipher ${cipherId}`);
  let total = 0;
  for (const char of word.toUpperCase()) {
    const index = char.charCodeAt(0) - 64;
    if (index >= 1 && index <= 26) total += cipher.valueFor(index);
  }
  return total;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Blog posts as the seed files insert them: slug and status, in order. Only
// published posts are served by public-posts.mjs, so only those may be linked.
function seededPosts(path) {
  return read(path).split(/^INSERT INTO posts/m).slice(1).map((body) => {
    const values = body.slice(body.indexOf('VALUES ('));
    const slug = [...values.matchAll(/^ {2}'([a-z0-9-]+)',$/gm)].map((match) => match[1]).find((value) => !value.startsWith('post-'));
    const status = values.match(/^ {2}'(published|draft)',$/m);
    assert.ok(slug && status, `could not read a post block in ${path}`);
    return { slug, status: status[1], body };
  });
}

// Standard Hebrew values (mispar hechrachi), in alphabet order. Letter names
// follow src/hebrew-gematria-chart.html. Final forms
// count as their base letter here; mispar gadol gives them 500-900 instead.
const HEBREW_ALPHABET = [
  ['aleph', 'א', 1], ['bet', 'ב', 2], ['gimel', 'ג', 3], ['dalet', 'ד', 4], ['he', 'ה', 5], ['vav', 'ו', 6],
  ['zayin', 'ז', 7], ['chet', 'ח', 8], ['tet', 'ט', 9], ['yod', 'י', 10], ['kaf', 'כ', 20], ['lamed', 'ל', 30],
  ['mem', 'מ', 40], ['nun', 'נ', 50], ['samekh', 'ס', 60], ['ayin', 'ע', 70], ['pe', 'פ', 80], ['tsadi', 'צ', 90],
  ['qof', 'ק', 100], ['resh', 'ר', 200], ['shin', 'ש', 300], ['tav', 'ת', 400],
];
const HEBREW_FINALS = [['ך', 'כ', 500], ['ם', 'מ', 600], ['ן', 'נ', 700], ['ף', 'פ', 800], ['ץ', 'צ', 900]];
const HEBREW_VALUE = new Map(HEBREW_ALPHABET.map(([, letter, value]) => [letter, value]));
for (const [final, base] of HEBREW_FINALS) HEBREW_VALUE.set(final, HEBREW_VALUE.get(base));

function hebrewValue(word) {
  let total = 0;
  for (const letter of word) {
    assert.ok(HEBREW_VALUE.has(letter), `no Hebrew value for ${letter}`);
    total += HEBREW_VALUE.get(letter);
  }
  return total;
}

// Greek alphabetic numerals, archaic signs included: stigma/digamma 6,
// koppa 90, sampi 900.
const GREEK_NUMERALS = [
  ['α', 1], ['β', 2], ['γ', 3], ['δ', 4], ['ε', 5], ['ϛ', 6], ['ζ', 7], ['η', 8], ['θ', 9],
  ['ι', 10], ['κ', 20], ['λ', 30], ['μ', 40], ['ν', 50], ['ξ', 60], ['ο', 70], ['π', 80], ['ϟ', 90],
  ['ρ', 100], ['σ', 200], ['τ', 300], ['υ', 400], ['φ', 500], ['χ', 600], ['ψ', 700], ['ω', 800], ['ϡ', 900],
];
const GREEK_VALUE = new Map([...GREEK_NUMERALS, ['ς', 200]]);
const greekLetters = (word) => [...word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()];

function greekValue(word) {
  return greekLetters(word).reduce((total, letter) => {
    assert.ok(GREEK_VALUE.has(letter), `no Greek value for ${letter}`);
    return total + GREEK_VALUE.get(letter);
  }, 0);
}

// ---------- head ----------

test('the head copies the template line for line and sets its own SEO tags', () => {
  const pageSpecific = /<title>|name="description"|name="robots"|rel="canonical"|name="author"|name="last-updated"|property="og:(?:title|description|url)"|name="twitter:(?:title|description)"/;
  const templateHead = TEMPLATE.slice(0, TEMPLATE.indexOf('<script type="application/ld+json">'));
  let shared = 0;
  for (const line of templateHead.split('\n')) {
    if (!line.trim() || pageSpecific.test(line)) continue;
    assert.ok(HEAD.includes(`${line}\n`), `head is missing the template line:\n  ${line}`);
    shared += 1;
  }
  assert.ok(shared >= 30, `only ${shared} shared head lines checked`);

  const title = HEAD.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal(title, 'What Is Gematria? Meaning and How It Works | Gematria.Today');
  assert.ok(title.length <= 60, `title is ${title.length} characters`);

  const description = metaContent('name', 'description');
  assert.ok(description.length <= 160, `description is ${description.length} characters`);
  assert.ok(description.startsWith('What is gematria?'));

  assert.equal(metaContent('name', 'robots'), 'index,follow,max-image-preview:large');
  assert.ok(HEAD.includes(`<link rel="canonical" href="${CANONICAL}" />`));
  assert.equal(metaContent('name', 'author'), 'Gematria.Today Editorial Team');
  assert.equal(metaContent('name', 'last-updated'), '2026-10-27');
  assert.equal(metaContent('property', 'og:url'), CANONICAL);
  assert.equal(metaContent('property', 'og:title'), metaContent('name', 'twitter:title'));
  assert.equal(metaContent('property', 'og:description'), metaContent('name', 'twitter:description'));
  assert.ok(metaContent('property', 'og:description').length <= 200);

  const templateImage = TEMPLATE.match(/<meta property="og:image" content="([^"]+)" \/>/)[1];
  assert.equal(metaContent('property', 'og:image'), templateImage);
  assert.equal(metaContent('name', 'twitter:image'), templateImage);
});

test('the primary query leads the title, the h1, the first paragraph and the description', () => {
  const h1s = [...PAGE.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1s.length, 1);
  assert.equal(textOf(h1s[0][1]), 'What is gematria? Meaning, history and how it works');

  const lead = MAIN.match(/<p class="lead mb-0">([\s\S]*?)<\/p>/);
  assert.ok(lead, 'the hero has no lead paragraph');
  assert.ok(textOf(lead[1]).startsWith('What is gematria? It is the practice of giving each letter a number'));

  // The secondary queries each get a heading of their own.
  assertCopyContains('<h2 class="h4 mb-3">Gematria meaning: a short definition</h2>');
  assertCopyContains('<h2 class="h4 mb-3">How does gematria work?</h2>');
  assertCopyContains('<h2 class="h4 mb-3">Where the word gematria comes from</h2>');
});

// ---------- body skeleton ----------

test('the body follows the template skeleton and carries no inline script', () => {
  const order = [
    '<a class="skip-link" href="#mainContent">Skip to main content</a>',
    '{% nav %}',
    '<main id="mainContent" class="py-5">',
    '<nav aria-label="Breadcrumb" class="mb-3">',
    '<section class="hero-panel hero-panel--compact p-4 p-lg-5 mb-4">',
    '<address class="small text-muted mb-3 fst-normal">By the <a href="/disclaimer.html">Gematria.Today Editorial Team</a> &middot; Updated <time datetime="2026-10-27">October 27, 2026</time>',
    '<h2 class="h4 mb-3">Where to go next</h2>',
    '</main>',
    '{% footer %}',
    '<script src="/assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>',
  ];
  let cursor = 0;
  for (const marker of order) {
    const at = BODY.indexOf(marker, cursor);
    assert.ok(at >= 0, `missing or out of order: ${marker}`);
    cursor = at + marker.length;
  }
  assertCopyContains('<li class="breadcrumb-item"><a href="/index.html">Home</a></li>');
  assertCopyContains('<li class="breadcrumb-item active" aria-current="page">What Is Gematria?</li>');

  for (const [, attributes, content] of PAGE.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const isData = /\btype="application\/ld\+json"/.test(attributes);
    const isExternal = /\bsrc="[^"]+"/.test(attributes) && !content.trim();
    assert.ok(isData || isExternal, `inline script found: <script${attributes}>`);
  }
  assert.doesNotMatch(PAGE, /\son[a-z]+\s*=\s*"/i);
  assert.doesNotMatch(PAGE, /\b(?:href|src)\s*=\s*"\s*javascript:/i);
});

test('headings descend one level at a time, and every in-page anchor has a target', () => {
  const levels = [...BODY.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels[0], 1);
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index] <= levels[index - 1] + 1, `heading jumps from h${levels[index - 1]} to h${levels[index]}`);
  }
  const ids = new Set([...PAGE.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  assert.equal(ids.size, [...PAGE.matchAll(/\sid="([^"]+)"/g)].length, 'duplicate id');
  for (const [, target] of PAGE.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(target), `#${target} has no target`);
  }
});

test('with the real nav and footer in place, ids stay unique and headings still descend in order', async () => {
  // The checks above read the source, where {% nav %} and {% footer %} are
  // still shortcodes. Render them the way eleventy.config.mjs does. Until the
  // integrator maps this page in FOOTER_SECTION_BY_FILE, borrow the footer of
  // how-to-use-gematria.html, a 'learn' page like this one.
  const partials = await loadPartials(fileURLToPath(new URL('..', import.meta.url)));
  const footerFile = FOOTER_SECTION_BY_FILE['what-is-gematria.html'] ? 'what-is-gematria.html' : 'how-to-use-gematria.html';
  const rendered = PAGE
    .replace('{% nav %}', renderNav(partials.nav, 'what-is-gematria.html'))
    .replace('{% footer %}', renderFooter(partials.footer, footerFile));
  assert.doesNotMatch(rendered, /\{%/);

  const ids = [...rendered.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate id: ${ids.filter((id, index) => ids.indexOf(id) !== index)}`);
  for (const [, target] of rendered.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(target), `#${target} has no target`);

  const body = rendered.slice(rendered.indexOf('<body>'));
  const levels = [...body.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels.indexOf(1), levels.lastIndexOf(1), 'more than one h1');
  const fromH1 = levels.slice(levels.indexOf(1));
  for (let index = 1; index < fromH1.length; index += 1) {
    assert.ok(fromH1[index] <= fromH1[index - 1] + 1, `heading jumps from h${fromH1[index - 1]} to h${fromH1[index]}`);
  }
  for (const [, attributes, content] of rendered.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const isData = /\btype="application\/ld\+json"/.test(attributes);
    const isExternal = /\bsrc="[^"]+"/.test(attributes) && !content.trim();
    assert.ok(isData || isExternal, `inline script in the rendered page: <script${attributes}>`);
  }
});

// ---------- structured data ----------

test('the breadcrumb and article structured data describe this page', () => {
  const blocks = jsonLdBlocks(HEAD);
  assert.deepEqual(blocks.map((block) => block['@type']), ['BreadcrumbList', 'Article', 'FAQPage']);

  const [breadcrumb, article] = blocks;
  assert.deepEqual(breadcrumb.itemListElement.map((item) => [item.position, item.name, item.item]), [
    [1, 'Home', 'https://gematria.today/'],
    [2, 'What Is Gematria?', CANONICAL],
  ]);

  assert.equal(article.headline, textOf(PAGE.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]));
  assert.equal(article.datePublished, '2026-10-27');
  assert.equal(article.dateModified, '2026-10-27');
  assert.equal(article.mainEntityOfPage, CANONICAL);
  assert.equal(article.image, metaContent('property', 'og:image'));
  assert.equal(article.author.name, metaContent('name', 'author'));
});

test('the FAQ structured data matches the visible questions and answers word for word', () => {
  const faq = jsonLdBlocks(HEAD).find((block) => block['@type'] === 'FAQPage');
  const section = MAIN.slice(MAIN.indexOf('<section id="faq"'), MAIN.indexOf('<section id="sources"'));
  const visible = [...section.matchAll(/<dt class="h6 mt-3">([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)]
    .map(([, question, answer]) => [textOf(question), textOf(answer)]);
  const marked = faq.mainEntity.map((entry) => {
    assert.equal(entry['@type'], 'Question');
    assert.equal(entry.acceptedAnswer['@type'], 'Answer');
    return [entry.name, entry.acceptedAnswer.text];
  });
  assert.ok(visible.length >= 5, `only ${visible.length} visible questions`);
  assert.deepEqual(marked, visible);
});

// ---------- the worked example ----------

test('the GEMATRIA worked example adds up in the site cipher and its edge mirror', () => {
  const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  let sum = 0;
  for (const letter of 'GEMATRIA') {
    const position = letter.charCodeAt(0) - 64;
    const value = position * 6;
    assert.equal(englishGematria(letter), String(value));
    assertCopyContains(`<tr><th scope="row">${letter}</th><td>${ordinal(position)}</td><td class="text-end">${value}</td></tr>`);
    sum += value;
  }
  assert.equal(sum, 444);
  assert.equal(englishGematria('gematria'), '444');
  assert.equal(Number(edgeEnglishGematria('gematria')), 444);
  assertCopyContains('<tr><th scope="row" colspan="2">Total</th><td class="text-end fw-bold">444</td></tr>');
  assertCopyContains('<code>G 42 + E 30 + M 78 + A 6 + T 120 + R 108 + I 54 + A 6 = 444</code>');
  assertCopyContains('GEMATRIA is 42 + 30 + 78 + 6 + 120 + 108 + 54 + 6 = 444.');

  // Letter table claims in the prose.
  assert.equal(englishGematria('A'), '6');
  assert.equal(englishGematria('B'), '12');
  assert.equal(englishGematria('Z'), '156');
  assertCopyContains('A&nbsp;=&nbsp;6, B&nbsp;=&nbsp;12, and so on up to Z&nbsp;=&nbsp;156');

  // The words said to share the value, and the link to that value's page.
  for (const word of ['english', 'gospel', 'jesus']) assert.equal(englishGematria(word), '444', word);
  assertCopyContains('ENGLISH, GOSPEL and JESUS also total 444');
  assertCopyContains('GEMATRIA, JESUS, ENGLISH and GOSPEL all total 444 here.');
  assertCopyContains('<a href="/v/444">/v/444</a>');
  assertCopyContains('<a href="/w/gematria">/w/gematria</a>');

  // Digital root of the example, step by step, and the claim that only 3, 6
  // and 9 occur.
  const digits = (n) => String(n).split('').map(Number);
  const steps = [444];
  while (steps.at(-1) > 9) steps.push(digits(steps.at(-1)).reduce((a, b) => a + b, 0));
  assert.deepEqual(steps, [444, 12, 3]);
  assert.equal(digitalRoot(444), steps.at(-1));
  assertCopyContains(steps.slice(0, -1).map((n, i) => `${i ? '' : `${n} &rarr; `}${digits(n).join('+')} = ${steps[i + 1]}`).join(' &rarr; '));
  const roots = new Set();
  for (let sumOfOrdinals = 1; sumOfOrdinals <= 3000; sumOfOrdinals += 1) roots.add(digitalRoot(6 * sumOfOrdinals));
  assert.deepEqual([...roots].sort(), [3, 6, 9]);
  assertCopyContains('In this cipher only 3, 6 and 9 can occur');
});

// ---------- ciphers ----------

test('the seven-cipher table quotes the multi-cipher engine', () => {
  assert.equal(CIPHERS.length, 7);
  for (const claim of ['the seven English ciphers of the multi-cipher calculator', 'Same word, seven totals, but fewer independent ones.', 'runs any word through all seven', 'With seven ciphers']) {
    assertCopyContains(claim);
  }

  const rows = [
    ['English Ordinal', 'english-ordinal', 74],
    ['Reverse Ordinal', 'reverse-ordinal', 142],
    ['Full Reduction', 'full-reduction', 38],
    ['Reverse Full Reduction', 'reverse-full-reduction', 52],
    ['English Gematria / Sumerian (this site)', 'sumerian', 444],
    ['Reverse Sumerian', 'reverse-sumerian', 852],
    ['Jewish / Latin', 'jewish-latin', 353],
  ];
  assert.deepEqual(rows.map(([, id]) => id).sort(), CIPHERS.map((cipher) => cipher.id).sort());
  for (const [name, id, total] of rows) {
    assert.equal(cipherValue(id, 'GEMATRIA'), total, `${name} of GEMATRIA`);
    assert.match(PAGE, new RegExp(`<tr><th scope="row">${escapeRegExp(name)}</th><td>[^<]*</td><td class="text-end">${total}</td></tr>`), name);
  }

  // The letter-value column of that table.
  const valueOf = (id, index) => CIPHERS.find((cipher) => cipher.id === id).valueFor(index);
  assert.deepEqual([valueOf('english-ordinal', 1), valueOf('english-ordinal', 26)], [1, 26]);
  assert.deepEqual([valueOf('reverse-ordinal', 1), valueOf('reverse-ordinal', 26)], [26, 1]);
  assert.deepEqual([valueOf('sumerian', 1), valueOf('sumerian', 26)], [6, 156]);
  assert.deepEqual([valueOf('reverse-sumerian', 1), valueOf('reverse-sumerian', 26)], [156, 6]);
  for (let index = 1; index <= 26; index += 1) {
    assert.ok(valueOf('full-reduction', index) >= 1 && valueOf('full-reduction', index) <= 9);
    assert.equal(valueOf('reverse-full-reduction', index), valueOf('full-reduction', 27 - index));
  }
  assert.equal(valueOf('full-reduction', 10), 1, 'reduction repeats after I');
  assert.deepEqual([1, 9, 10, 18, 19, 26].map((index) => valueOf('jewish-latin', index)), [1, 9, 10, 90, 100, 800]);
  assertCopyContains('<td>A&nbsp;=&nbsp;1 &hellip; Z&nbsp;=&nbsp;26</td>');
  assertCopyContains('<td>1&ndash;9, 10&ndash;90, 100&ndash;800</td>');

  assertCopyContains('GEMATRIA totals 444 in this site&rsquo;s cipher and 74 in English Ordinal');
});

const WORDS = ['gematria', 'jesus', 'english', 'gospel', 'cross', 'light', 'earth', 'heart', 'devil', 'listen', 'silent', 'peace', 'bread'];
const matchingCiphers = (a, b) => new Set(CIPHERS.filter((cipher) => cipherValue(cipher.id, a) === cipherValue(cipher.id, b)).map((cipher) => cipher.id));

test('the claims about how the seven ciphers relate hold in the engine', () => {
  const ordinal = (word) => cipherValue('english-ordinal', word);
  const letters = (word) => word.replace(/[^a-z]/gi, '').length;

  // Two x6 pairs: Ordinal / Sumerian and Reverse Ordinal / Reverse Sumerian.
  for (const word of WORDS) {
    assert.equal(cipherValue('sumerian', word), 6 * ordinal(word), word);
    assert.equal(cipherValue('reverse-sumerian', word), 6 * cipherValue('reverse-ordinal', word), word);
    assert.equal(cipherValue('reverse-ordinal', word), 27 * letters(word) - ordinal(word), word);
  }
  for (let index = 1; index <= 26; index += 1) {
    assert.equal(CIPHERS.find((cipher) => cipher.id === 'reverse-ordinal').valueFor(index), 27 - CIPHERS.find((cipher) => cipher.id === 'english-ordinal').valueFor(index));
  }
  const gOrd = ordinal('GEMATRIA');
  const gRev = cipherValue('reverse-ordinal', 'GEMATRIA');
  assertCopyContains(`(${gOrd}&nbsp;&times;&nbsp;6&nbsp;=&nbsp;${cipherValue('sumerian', 'GEMATRIA')})`);
  assertCopyContains(`as do Reverse Ordinal and Reverse Sumerian (${gRev}&nbsp;&times;&nbsp;6&nbsp;=&nbsp;${cipherValue('reverse-sumerian', 'GEMATRIA')}), so each pair gives the same matches`);
  assertCopyContains(`(for GEMATRIA, 27&nbsp;&times;&nbsp;${letters('GEMATRIA')}&nbsp;&minus;&nbsp;${gOrd}&nbsp;=&nbsp;${gRev})`);
  assertCopyContains('Each letter&rsquo;s Reverse Ordinal value is 27 minus its English Ordinal value');

  // An English Ordinal match carries into the reversed ciphers exactly when
  // the words have the same number of letters.
  for (let a = 0; a < WORDS.length; a += 1) {
    for (let b = a + 1; b < WORDS.length; b += 1) {
      if (ordinal(WORDS[a]) !== ordinal(WORDS[b])) continue;
      const matches = matchingCiphers(WORDS[a], WORDS[b]);
      const sameLength = letters(WORDS[a]) === letters(WORDS[b]);
      assert.equal(matches.has('reverse-ordinal'), sameLength, `${WORDS[a]} / ${WORDS[b]}`);
      assert.equal(matches.has('reverse-sumerian'), sameLength, `${WORDS[a]} / ${WORDS[b]}`);
    }
  }
  assert.ok(matchingCiphers('jesus', 'cross').has('reverse-ordinal'), 'an equal-length pair keeps its match');
  assert.ok(!matchingCiphers('gematria', 'jesus').has('reverse-ordinal'), 'a different-length pair loses it');
  assertCopyContains('also match in Reverse Ordinal whenever they have the same number of letters');

  // The reductions and Jewish / Latin are not fixed by the Ordinal total and
  // the length: each has a pair with both equal and its own totals different.
  for (const [id, a, b] of [['full-reduction', 'jesus', 'cross'], ['reverse-full-reduction', 'peace', 'bread'], ['jewish-latin', 'jesus', 'cross']]) {
    assert.equal(ordinal(a), ordinal(b), `${a} / ${b}`);
    assert.equal(letters(a), letters(b), `${a} / ${b}`);
    assert.notEqual(cipherValue(id, a), cipherValue(id, b), `${id}: ${a} / ${b}`);
  }
  assertCopyContains('The two reductions and Jewish / Latin depend on exactly which letters a word contains, so they reshuffle matches.');

  // Anagrams match in every cipher.
  for (const [a, b] of [['earth', 'heart'], ['listen', 'silent']]) {
    assert.equal(matchingCiphers(a, b).size, CIPHERS.length, `${a} / ${b}`);
  }
  assertCopyContains('Anagrams match in every cipher, but other matches can hold in some ciphers and fail in others');
});

test('the GEMATRIA and JESUS comparison is what the engine gives, in all seven ciphers', () => {
  const rows = [
    ['English Gematria / Sumerian', 'sumerian'],
    ['English Ordinal', 'english-ordinal'],
    ['Reverse Ordinal', 'reverse-ordinal'],
    ['Reverse Sumerian', 'reverse-sumerian'],
    ['Full Reduction', 'full-reduction'],
    ['Reverse Full Reduction', 'reverse-full-reduction'],
    ['Jewish / Latin', 'jewish-latin'],
  ];
  assert.deepEqual(rows.map(([, id]) => id).sort(), CIPHERS.map((cipher) => cipher.id).sort());
  for (const [name, id] of rows) {
    const gematria = cipherValue(id, 'GEMATRIA');
    const jesus = cipherValue(id, 'JESUS');
    const match = gematria === jesus ? 'Yes' : 'No';
    assertCopyContains(`<tr><th scope="row">${name}</th><td class="text-end">${gematria}</td><td class="text-end">${jesus}</td><td>${match}</td></tr>`);
  }
  const numberWord = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  assertCopyContains(`GEMATRIA and JESUS compared in ${numberWord[rows.length]} ciphers.`);

  // The pair matches only in the x6 pair, and in none of the rest.
  const pair = matchingCiphers('gematria', 'jesus');
  assert.deepEqual([...pair].sort(), ['english-ordinal', 'sumerian']);
  assertCopyContains(`For GEMATRIA and JESUS the match holds in English Ordinal and its &times;6 copy, which are really one table, and in none of the other ${numberWord[CIPHERS.length - pair.size]} ciphers.`);
});

test('every pair of the four 444 words matches where the copy says, and nowhere else', () => {
  const four = ['gematria', 'jesus', 'english', 'gospel'];
  for (const word of four) assert.equal(englishGematria(word), '444', word);
  assertCopyContains('GEMATRIA, JESUS, ENGLISH and GOSPEL all total 444 here.');

  // Every pair shares English Ordinal and Sumerian; the copy names the only
  // extra matches.
  const extras = {
    'gematria/english': ['full-reduction', 38],
    'jesus/english': ['reverse-full-reduction', 34],
  };
  for (let a = 0; a < four.length; a += 1) {
    for (let b = a + 1; b < four.length; b += 1) {
      const key = `${four[a]}/${four[b]}`;
      const matches = matchingCiphers(four[a], four[b]);
      const expected = ['english-ordinal', 'sumerian'];
      if (extras[key]) {
        const [id, total] = extras[key];
        expected.push(id);
        assert.equal(cipherValue(id, four[a]), total, key);
        assert.equal(cipherValue(id, four[b]), total, key);
      }
      assert.deepEqual([...matches].sort(), expected.sort(), key);
    }
  }
  assertCopyContains('GEMATRIA and ENGLISH also match in Full Reduction (38), and JESUS and ENGLISH in Reverse Full Reduction (34).');
});

test('the value-space and anagram claims are arithmetic', () => {
  const min = Number(englishGematria('AAAAA'));
  const max = Number(englishGematria('ZZZZZ'));
  assert.equal(min, 30);
  assert.equal(max, 780);
  assert.equal((max - min) / 6 + 1, 126);
  for (let index = 1; index <= 26; index += 1) {
    assert.equal(Number(englishGematria(String.fromCharCode(64 + index))) % 6, 0);
  }
  assertCopyContains('a five-letter word can reach only 126 totals, from 30 to 780, and anagrams always match');
  for (const [a, b] of [['earth', 'heart'], ['alter', 'later'], ['listen', 'silent']]) {
    assert.equal(englishGematria(a), englishGematria(b));
  }
});

// ---------- Hebrew and Greek ----------

test('the Hebrew examples and letter ranges add up', () => {
  assert.equal(HEBREW_ALPHABET.length, 22);
  const valueOf = (name) => HEBREW_ALPHABET.find(([letterName]) => letterName === name)[2];
  const indexOf = (name) => HEBREW_ALPHABET.findIndex(([letterName]) => letterName === name);
  const slice = (from, to) => HEBREW_ALPHABET.slice(indexOf(from), indexOf(to) + 1).map(([, , value]) => value);
  assert.deepEqual(slice('aleph', 'tet'), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(slice('yod', 'tsadi'), [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.deepEqual(slice('qof', 'tav'), [100, 200, 300, 400]);
  assert.equal(valueOf('tav'), 400);
  assertCopyContains('aleph to tet stand for 1 to 9, yod to tsadi for 10 to 90, and qof to tav for 100 to 400');
  assertCopyContains('(<em>mispar hechrachi</em>)');
  assert.doesNotMatch(PAGE, /hechrechi|tsade\b/, 'use the transliterations of /hebrew-gematria-chart.html');
  assertCopyContains('run from 1 to 400 across 22 letters');
  assertCopyContains('number the letters 1 to 22 in order');
  assertCopyContains('The 22 Hebrew letters and their traditional values.');

  assert.equal(HEBREW_FINALS.length, 5);
  assert.deepEqual(HEBREW_FINALS.map(([, , gadol]) => gadol), [500, 600, 700, 800, 900]);
  assertCopyContains('give the five final letter forms 500 to 900');

  assert.equal(hebrewValue('השטן'), 364);
  assert.deepEqual([...'השטן'].map((letter) => HEBREW_VALUE.get(letter)), [5, 300, 9, 50]);
  assertCopyContains('(<span lang="he" dir="rtl">השטן</span>), totals 364');
  assertCopyContains('(<em>hasatan</em> = 364)');

  assert.equal(hebrewValue('אליעזר'), 318);
  assertCopyContains('Eliezer (<span lang="he" dir="rtl">אליעזר</span>), whose name totals 318');
  assertCopyContains('The 318 men Abraham leads in Genesis 14:14');
  assertCopyContains('(Eliezer = 318)');

  assertCopyContains('<span lang="he" dir="rtl">גימטריה</span>, <em>gimatriya</em>');
});

test('the Greek examples and numeral ranges add up', () => {
  // 24 classical letters plus three archaic signs fill every slot 1-9, 10-90, 100-900.
  const values = GREEK_NUMERALS.map(([, value]) => value);
  const slots = [];
  for (const scale of [1, 10, 100]) for (let digit = 1; digit <= 9; digit += 1) slots.push(digit * scale);
  assert.deepEqual(values, slots);
  const archaic = GREEK_NUMERALS.filter(([letter]) => ['ϛ', 'ϟ', 'ϡ'].includes(letter)).map(([, value]) => value);
  assert.deepEqual(archaic, [6, 90, 900]);
  assert.equal(GREEK_NUMERALS.length - archaic.length, 24);
  assert.equal(GREEK_VALUE.get('α'), 1);
  assert.equal(GREEK_VALUE.get('ω'), 800);
  assertCopyContains('Greek runs from alpha&nbsp;=&nbsp;1 to omega&nbsp;=&nbsp;800, with three older signs for 6, 90 and 900');
  assertCopyContains('alpha&nbsp;=&nbsp;1 to omega&nbsp;=&nbsp;800, with archaic signs for 6, 90 and 900');

  assert.equal(greekValue('φμε'), 545);
  assert.deepEqual(greekLetters('φμε').map((letter) => GREEK_VALUE.get(letter)), [500, 40, 5]);
  assertCopyContains('&ldquo;I love her whose number is 545&rdquo; (<span lang="grc">φμε</span>: 500&nbsp;+&nbsp;40&nbsp;+&nbsp;5)');

  assert.equal(greekValue('Ἰησοῦς'), 888);
  assert.deepEqual(greekLetters('Ἰησοῦς').map((letter) => GREEK_VALUE.get(letter)), [10, 8, 200, 70, 400, 200]);
  assertCopyContains('<span lang="grc">Ἰησοῦς</span>, totals 888 (10&nbsp;+&nbsp;8&nbsp;+&nbsp;200&nbsp;+&nbsp;70&nbsp;+&nbsp;400&nbsp;+&nbsp;200)');
  assertCopyContains('the system behind the 545 and 888 examples above');
});

test('dates, references and series lengths are pinned to their sources', () => {
  // Not arithmetic, so pinned to the copy and, where the repo holds the
  // source, checked against it.
  for (const claim of [
    'buried in 79&nbsp;CE',
    '(complete edition 1533)',
    '(Cologne, 1533)',
    '<cite>The Kabbalah Unveiled</cite> (1887)',
    '(London, 1887)',
    '(<cite>Cheiro&rsquo;s Book of Numbers</cite>, 1926)',
    'In the late nineteenth century, S.&nbsp;L. MacGregor Mathers',
    'in the early twentieth, numerologists such as Cheiro',
    'Sargon&nbsp;II of Assyria, from the eighth century BCE',
    'some, such as Abraham Abulafia, made it central to their method',
    'which it gives as 666 (616 in a few early manuscripts)',
    '(Yoma 20a)',
    '(Nedarim 32a)',
    'Revelation 13:18',
    'The Baraita of the 32 Rules',
    'Pirkei Avot, chapter 3',
    '<cite>Encyclopaedia Judaica</cite>, &ldquo;Gematria&rdquo;',
  ]) {
    assertCopyContains(claim);
  }

  // The FAQ answer (visible and in JSON-LD) agrees with the history section
  // on how much the Talmud uses gematria.
  assertCopyContains('The Talmud uses it sparingly.');
  assertCopyContains('the Talmud uses it occasionally, and medieval commentators and Kabbalists applied it extensively.');
  assert.doesNotMatch(PAGE, /rabbinic readers applied it/);

  const atlas = seededPosts('sql/seed_english_gematria_cipher_atlas_series.sql');
  assert.equal(atlas.length, 8);
  assert.equal(atlas[0].slug, 'english-gematria-cipher-atlas-simple-ordinal');
  assert.match(atlas[0].body, /'Post 1 of 8\./);
  assertCopyContains(`the eight-part <a href="/blog/${atlas[0].slug}">English Gematria Cipher Atlas</a>, starting with Simple Ordinal`);
});

// ---------- links ----------

test('every link goes somewhere real', () => {
  const posts = [
    ...seededPosts('sql/seed_english_gematria_history_series.sql'),
    ...seededPosts('sql/seed_english_gematria_cipher_atlas_series.sql'),
  ];
  assert.ok(posts.some((post) => post.status === 'draft'), 'the history series is no longer seeded as drafts; links to it may be allowed');
  const published = new Set(posts.filter((post) => post.status === 'published').map((post) => post.slug));
  const hrefs = [...MAIN.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 30);

  for (const href of hrefs) {
    if (href.startsWith('#')) continue;
    if (href.startsWith('https://')) {
      assert.match(href, /^https:\/\/www\.sefaria\.org\/(?:Yoma\.20a|Nedarim\.32a)$/, `unexpected external link ${href}`);
      assert.match(MAIN, new RegExp(`href="${escapeRegExp(href)}" rel="noopener"`));
      continue;
    }
    assert.ok(href.startsWith('/'), `relative link ${href}`);

    const blog = href.match(/^\/blog\/([a-z0-9-]+)$/);
    if (blog) {
      // Posts are opened by their slug column, never by the post- id.
      assert.ok(!blog[1].startsWith('post-'), `${href} uses the post id, not the slug`);
      assert.ok(published.has(blog[1]), `${blog[1]} is not a published blog post (drafts are not served)`);
      continue;
    }
    const value = href.match(/^\/v\/(\d+)$/);
    if (value) {
      assert.equal(Number(value[1]) % 6, 0, `${href} is not a value this cipher can produce`);
      assert.equal(englishGematria('gematria'), value[1]);
      continue;
    }
    const word = href.match(/^\/w\/([a-z]+)$/);
    if (word) {
      assert.ok(Number(englishGematria(word[1])) > 0, href);
      continue;
    }

    const [path, fragment] = href.split('?')[0].split('#');
    const file = `src${path}`;
    if (SIBLING_PAGES.includes(path) && !existsSync(new URL(`../${file}`, import.meta.url))) continue;
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${href} points at a page that does not exist`);
    if (fragment) assert.ok(read(file).includes(`id="${fragment}"`), `${href}: no #${fragment} on that page`);
  }

  for (const required of [
    ...SIBLING_PAGES,
    '/calculator.html', '/name-calculator.html', '/multi-cipher-calculator.html', '/how-to-use-gematria.html',
    '/why-english-gematria.html', '/bible-names-gematria.html', '/definitions.html', '/gematria-guide.html', '/blog.html',
  ]) {
    assert.ok(hrefs.some((href) => href.split(/[?#]/)[0] === required), `no link to ${required}`);
  }
});

// ---------- reading time and stance ----------

test('the reading-time estimate fits the word count', () => {
  const words = textOf(MAIN).split(' ').filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
  const claimed = Number(PAGE.match(/~(\d+) min read/)[1]);
  assert.ok(words >= 900, `only ${words} words`);
  assert.ok(
    claimed >= Math.floor(words / 250) && claimed <= Math.ceil(words / 200),
    `${words} words is not a ~${claimed} minute read`,
  );
});

test('the copy keeps to the site stance: interpretation, not evidence or prediction', () => {
  assertCopyContains('It is not a method of proof or prediction, and this site does not present it as one.');
  assertCopyContains('<strong>Prove or predict anything.</strong>');
  assertCopyContains('The question is not settled');
  for (const phrase of [/hidden truth/i, /secret code/i, /unlock/i, /proves that/i, /will reveal/i, /nine buckets/i, /one in nine/i]) {
    assert.doesNotMatch(textOf(MAIN), phrase);
  }
});
