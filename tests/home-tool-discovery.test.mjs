import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The name calculator sat at ~2 visits a month while the homepage carried a
// "Compare names" card that was a plain <div> and a hero that invited a name
// and then routed every visitor to the word calculator. These pin the routes
// open: a page with no entry point tells you nothing about demand.
const HOME = readFileSync(new URL('../src/index.html', import.meta.url).pathname, 'utf8');
const HOME_SCRIPT = readFileSync(new URL('../home-page.js', import.meta.url).pathname, 'utf8');

function featureCards(html) {
  const cards = [];
  const re = /<(a|div)\s+class="feature-card-icon"([^>]*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = re.exec(html))) {
    const [, tag, attrs, body] = match;
    cards.push({
      tag,
      href: attrs.match(/href="([^"]*)"/)?.[1] || null,
      title: body.match(/class="feature-card-icon__title">([^<]*)</)?.[1] || '',
    });
  }
  return cards;
}

// ---------- the homepage reaches the name calculator at all ----------

test('the homepage links to the name calculator', () => {
  assert.ok(
    HOME.includes('href="/name-calculator.html"'),
    'src/index.html has no link to the name calculator',
  );
});

// ---------- feature cards ----------

test('every feature card is a link, not an inert div', () => {
  const cards = featureCards(HOME);
  assert.equal(cards.length, 3, 'expected three feature cards');
  for (const card of cards) {
    assert.equal(card.tag, 'a', `the "${card.title}" card is a <${card.tag}>, so it goes nowhere`);
    assert.ok(card.href, `the "${card.title}" card has no href`);
  }
});

test('the Compare names card points at the name calculator', () => {
  const card = featureCards(HOME).find((entry) => entry.title === 'Compare names');
  assert.ok(card, 'the Compare names card is missing');
  assert.equal(card.href, '/name-calculator.html');
});

test('each feature card leads somewhere different', () => {
  const hrefs = featureCards(HOME).map((card) => card.href);
  assert.equal(new Set(hrefs).size, hrefs.length, `duplicate card destinations: ${hrefs.join(', ')}`);
});

// ---------- hero ----------

test('the hero offers a name route beside the word calculator', () => {
  assert.ok(HOME.includes('id="heroQuickCalcDeepLink"'), 'the word calculator route is missing');
  assert.ok(HOME.includes('id="heroQuickCalcNameLink"'), 'the name calculator route is missing');
});

test('the hero label promising "a word or name" is backed by both routes', () => {
  // If the label ever stops mentioning names, the second route needs revisiting
  // rather than silently becoming a non-sequitur.
  assert.match(HOME, /heroQuickCalcLabel"[^>]*>[^<]*name/i);
  assert.ok(HOME.includes('Compare as a name'));
});

test('the word calculator route starts inert, having nothing to show yet', () => {
  const tag = HOME.match(/<a[^>]*id="heroQuickCalcDeepLink"[^>]*>/)?.[0] || '';
  assert.match(tag, /aria-disabled="true"/);
  assert.match(tag, /tabindex="-1"/);
});

test('the name route works with no JavaScript at all', () => {
  // It shipped inert-until-typed, copying the word calculator, and in
  // production it rendered but never activated -- a link to a page that exists
  // should not depend on a script running for the click to work. The word
  // calculator still needs its query; /name-calculator.html does not.
  const tag = HOME.match(/<a[^>]*id="heroQuickCalcNameLink"[^>]*>/)?.[0] || '';
  assert.ok(tag, 'the name route is missing');
  assert.ok(!tag.includes('aria-disabled="true"'), 'the name route still ships disabled');
  assert.ok(!tag.includes('tabindex="-1"'), 'the name route is unreachable by keyboard');
  assert.match(tag, /href="\/name-calculator\.html"/, 'the name route has no working static href');
});

test('the name route is not left inert by the shared link styling', () => {
  // .hero-quick-calc__deep-link sets opacity 0.5 / pointer-events none and
  // relies on JS to add data-active. The variant has to opt out of both or the
  // static href above is unclickable anyway.
  assert.match(
    HOME,
    /\.hero-quick-calc__deep-link--name \{[^}]*pointer-events: auto[^}]*\}/,
    'the name variant never re-enables pointer events',
  );
});

test('the script only enhances the name route, never disables it', () => {
  // Any of these reintroduces the production failure: a stale or failed script
  // would leave the link permanently unclickable.
  const heroBlock = HOME_SCRIPT.slice(HOME_SCRIPT.indexOf('initializeHeroQuickCalc'));
  assert.ok(
    !/nameLink\.setAttribute\('aria-disabled'/.test(heroBlock),
    'the script disables the name route',
  );
  assert.ok(
    !/nameLink\.setAttribute\('tabindex'/.test(heroBlock),
    'the script removes the name route from the tab order',
  );
});

test('the phone empty-state rule hides the whole action row', () => {
  // It used to hide .hero-quick-calc__deep-link by class. With two links in a
  // flex row, hiding only the children leaves the row's gap as a blank band.
  assert.ok(
    HOME.includes('.hero-quick-calc[data-state="empty"] .hero-quick-calc__actions { display: none; }'),
    'the empty-state rule still targets the individual link',
  );
});

test('the hero styles the name route as the quieter of the two', () => {
  // Gold has to stay the primary action; the name route is additive, not a
  // competing call to action.
  assert.ok(HOME.includes('.hero-quick-calc__deep-link--name'));
});

// ---------- the handoff into the name calculator ----------

test('the hero splits what was typed across the three name fields', () => {
  // Landing on a prefilled, already-rendered result is the whole point; a bare
  // link to an empty form would waste the click.
  assert.match(HOME_SCRIPT, /name\$\{index \+ 1\}/);
  assert.ok(HOME_SCRIPT.includes('/name-calculator.html?'));
});

test('the hero caps the handoff at the three fields the calculator has', () => {
  assert.match(HOME_SCRIPT, /NAME_CALCULATOR_FIELDS = 3/);
  assert.match(HOME_SCRIPT, /slice\(0, NAME_CALCULATOR_FIELDS\)/);
});

test('Enter still goes to the word calculator', () => {
  // The proven path keeps the keyboard shortcut; the name route is a click.
  assert.match(HOME_SCRIPT, /if \(event\.key !== 'Enter'\) return;/);
  assert.match(HOME_SCRIPT, /window\.location\.assign\(deepLink\.getAttribute\('href'\)/);
});

// ---------- tracking, so the experiment is measurable ----------

test('both new routes carry tracking attributes', () => {
  // Without these there is no way to tell whether the cards or the hero moved
  // the needle, which is the only reason for shipping them.
  assert.ok(HOME.includes('data-track-action="home_feature_card_click"'));
  assert.ok(HOME.includes('data-track-source="home_feature_card_compare_names"'));
  assert.ok(HOME.includes('data-track-action="home_hero_quick_calc_name_link_click"'));
});
