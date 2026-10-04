import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digitalRoot, englishGematria } from '../netlify/functions/englishGematria.mjs';

// The page sat at ~2 visits a month with "gematria" absent from its title, so
// it could not rank for the queries it exists to answer. These pin the fix and
// re-check every number the new copy quotes -- copy drifts, arithmetic does not.
const PAGE = readFileSync(new URL('../src/name-calculator.html', import.meta.url).pathname, 'utf8');
const NAV = readFileSync(new URL('../src/_includes/nav.html', import.meta.url).pathname, 'utf8');

function jsonLd(type) {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(PAGE))) {
    const parsed = JSON.parse(match[1]);
    if (parsed['@type'] === type) return parsed;
  }
  return null;
}

function metaContent(pattern) {
  return PAGE.match(pattern)?.[1] || '';
}

// ---------- the query the page targets ----------

test('the title names gematria, not just "Name Calculator"', () => {
  const title = metaContent(/<title>([^<]*)<\/title>/);
  assert.match(title, /gematria/i, `title does not mention gematria: "${title}"`);
  assert.match(title, /name/i);
});

test('the title stays inside what a search result will show', () => {
  const title = metaContent(/<title>([^<]*)<\/title>/);
  assert.ok(title.length <= 60, `title is ${title.length} chars and will be truncated`);
});

test('the meta description is present, targeted, and not truncation bait', () => {
  const description = metaContent(/<meta name="description" content="([^"]*)"/);
  assert.match(description, /gematria/i);
  assert.match(description, /name/i);
  assert.ok(description.length <= 160, `description is ${description.length} chars`);
  assert.ok(description.length >= 70, `description is only ${description.length} chars`);
});

test('the social tags carry the same title and description as the page', () => {
  const title = metaContent(/<title>([^<]*)<\/title>/);
  const description = metaContent(/<meta name="description" content="([^"]*)"/);
  for (const property of ['og:title', 'twitter:title']) {
    assert.ok(PAGE.includes(`content="${title}"`), `${property} does not match the title`);
  }
  for (const property of ['og:description', 'twitter:description']) {
    assert.ok(PAGE.includes(`content="${description}"`), `${property} does not match the description`);
  }
});

test('the h1 matches what the page is trying to rank for', () => {
  const h1 = metaContent(/<h1[^>]*>([^<]*)<\/h1>/);
  assert.match(h1, /gematria/i, `h1 does not mention gematria: "${h1}"`);
});

test('the lead says what the tool does rather than how it is laid out', () => {
  // It used to end "...side by side in a shared site layout", which describes
  // the HTML to a reader who came here to ask about a name.
  assert.ok(!PAGE.includes('in a shared site layout'));
});

// ---------- structured data ----------

test('every JSON-LD block on the page is valid JSON', () => {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  let blocks = 0;
  while ((match = re.exec(PAGE))) {
    blocks += 1;
    assert.doesNotThrow(() => JSON.parse(match[1]), `JSON-LD block ${blocks} is malformed`);
  }
  assert.equal(blocks, 3, 'expected BreadcrumbList, FAQPage, and WebApplication');
});

test('the FAQPage block carries every question', () => {
  const faq = jsonLd('FAQPage');
  assert.ok(faq, 'no FAQPage block');
  assert.equal(faq.mainEntity.length, 5);
  for (const entry of faq.mainEntity) {
    assert.equal(entry['@type'], 'Question');
    assert.ok(entry.name.length > 10, `question too short: ${entry.name}`);
    assert.ok(entry.acceptedAnswer.text.length > 40, `answer too short for: ${entry.name}`);
  }
});

test('every FAQ question in the markup also appears in the structured data', () => {
  // Google drops FAQ rich results when the marked-up answer is not visible on
  // the page, so the two have to stay in step.
  const visible = [...PAGE.matchAll(/<dt class="h6 mt-3">([\s\S]*?)<\/dt>/g)]
    .map((match) => match[1].replace(/<[^>]*>/g, '').replace(/&rsquo;/g, "'").trim());
  const marked = jsonLd('FAQPage').mainEntity.map((entry) => entry.name);
  assert.equal(visible.length, marked.length, 'visible question count differs from the structured data');
  for (const question of visible) {
    assert.ok(marked.includes(question), `"${question}" is on the page but not in the FAQPage block`);
  }
});

test('the WebApplication block describes a free browser tool', () => {
  const app = jsonLd('WebApplication');
  assert.ok(app, 'no WebApplication block');
  assert.equal(app.url, 'https://gematria.today/name-calculator.html');
  assert.equal(app.isAccessibleForFree, true);
  assert.equal(app.offers.price, '0');
  assert.match(app.name, /gematria/i);
});

// ---------- every number the copy quotes ----------

test('the worked JOHN example is arithmetically right', () => {
  assert.ok(PAGE.includes('J=60 + O=90 + H=48 + N=84 = <strong>282</strong>'));
  for (const [letter, value] of [['J', 60], ['O', 90], ['H', 48], ['N', 84]]) {
    assert.equal(englishGematria(letter), String(value), `${letter} is not ${value}`);
  }
  assert.equal(englishGematria('JOHN'), '282');
});

test('the JOHN/SARAH collision the FAQ cites is real', () => {
  assert.ok(PAGE.includes('both come to 282'));
  assert.equal(englishGematria('JOHN'), englishGematria('SARAH'));
  assert.equal(englishGematria('SARAH'), '282');
});

test('the shared digital root the FAQ cites is real', () => {
  assert.ok(PAGE.includes('digital root of 3'));
  assert.equal(digitalRoot(282), 3);
});

test('the FAQ quotes the digital-root odds for this cipher, not for a nine-root one', () => {
  // Totals are multiples of six, so their digital root is always 3, 6 or 9.
  for (let sum = 1; sum <= 3000; sum += 1) {
    assert.ok([3, 6, 9].includes(digitalRoot(6 * sum)), `6 x ${sum} reduces to ${digitalRoot(6 * sum)}`);
  }
  assert.ok(!PAGE.includes('nine possible roots'));
  assert.ok(!PAGE.includes('one unrelated pair in nine'));
  assert.equal(
    PAGE.split('its digital root can only be 3, 6 or 9, and roughly one unrelated pair in three will share one').length - 1,
    2,
    'the visible answer and the FAQPage structured data should both say it',
  );
});

test('the cipher range quoted in the FAQ matches the engine', () => {
  assert.ok(PAGE.includes('A=6, B=12, C=18'));
  assert.equal(englishGematria('A'), '6');
  assert.equal(englishGematria('B'), '12');
  assert.equal(englishGematria('C'), '18');
  assert.equal(englishGematria('Z'), '156');
});

test('the FAQ claim that punctuation is ignored holds', () => {
  assert.equal(englishGematria("O'Brien"), englishGematria('OBrien'));
  assert.equal(englishGematria('Mary-Jane'), englishGematria('MaryJane'));
});

// ---------- internal anchor text ----------

test('the nav describes the tool in the words people search', () => {
  assert.match(NAV, /nav-mega-item__desc">[^<]*gematria[^<]*<\/span>\s*<\/a>/i);
});
