import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Published pages that describe what the site does -- who receives personal
// data, how the assistants work, what the cookie banner offers, which ciphers
// differ, what premium adds -- checked against the code that does it.
const ROOT = new URL('../', import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function sourceFiles(dir, extensions = ['.js', '.mjs']) {
  const files = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const path = join(dir, entry);
    if (statSync(join(ROOT, path)).isDirectory()) {
      files.push(...sourceFiles(path, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      files.push(path);
    }
  }
  return files;
}

const SERVER_AND_PAGE_CODE = [
  ...sourceFiles('netlify'),
  ...sourceFiles('page-scripts'),
  'member-oauth.js',
].map((path) => [path, read(path)]);

function codeUses(pattern) {
  return SERVER_AND_PAGE_CODE.filter(([, source]) => pattern.test(source)).map(([path]) => path);
}

const PRIVACY = read('src/privacy.html');
const processors = PRIVACY.slice(PRIVACY.indexOf('<h2 id="processors">'), PRIVACY.indexOf('<h2 id="international">'));

test('the privacy policy lists the recipients the code actually sends personal data to', () => {
  assert.ok(codeUses(/https:\/\/api\.sendgrid\.com\/v3\/mail\/send/).includes('netlify/functions/_email.mjs'));
  assert.match(processors, /<strong>Transactional email<\/strong> &mdash; Twilio SendGrid/);

  assert.ok(codeUses(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/).includes('netlify/functions/_oauth.mjs'));
  assert.match(processors, /<strong>Sign-in<\/strong> &mdash; Google, if you choose &ldquo;Continue with Google&rdquo;/);
  assert.match(read('src/member.html'), /Continue with Google/, 'the policy quotes the button label');

  assert.ok(codeUses(/https:\/\/api\.follow\.it\/subscription-form\//).includes('page-scripts/member-1.js'));
  assert.match(processors, /<strong>Blog subscriptions<\/strong> &mdash; follow\.it/);

  for (const [label, pattern] of [
    ['Netlify', /api\.netlify\.com/],
    ['Stripe', /api\.stripe\.com/],
    ['Wordnik', /api\.wordnik\.com/],
  ]) {
    assert.ok(codeUses(pattern).length > 0, `${label} is no longer used; update the policy`);
    assert.ok(processors.includes(label), `${label} is missing from the processor list`);
  }
});

test('the legal pages do not claim a large-language-model provider the site does not use', () => {
  const llmHosts = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.|api\.groq\.com|huggingface\.co|openrouter\.ai/i;
  assert.deepEqual(codeUses(llmHosts), [], 'an LLM provider is now in use; disclose it in the privacy policy');

  assert.ok(!processors.includes('AI model providers'));
  assert.match(PRIVACY, /Neither sends your prompts to an outside AI or large-language-model provider\./);
  for (const page of ['src/terms.html', 'src/disclaimer.html']) {
    const source = read(page);
    assert.ok(!/generate responses using large language models/.test(source), `${page} still says the assistants use LLMs`);
    assert.match(source, /they do not use large language models|They do not use large language models/);
  }
});

test('the privacy policy names the jsDelivr CDN only for the admin back office that loads it', () => {
  assert.ok(!processors.includes('Bootstrap CDN'));
  const publicPages = readdirSync(join(ROOT, 'src')).filter((name) => name.endsWith('.html'));
  for (const name of publicPages) {
    assert.ok(!read(join('src', name)).includes('cdn.jsdelivr.net'), `src/${name} loads from jsDelivr`);
  }
  assert.match(read('admin-theme.js'), /https:\/\/cdn\.jsdelivr\.net\/npm\/bootswatch/);
  assert.match(processors, /Only the administrator back office loads optional theme stylesheets from the jsDelivr CDN\./);

  // The Terms list the same providers; they must not contradict the policy.
  const terms = read('src/terms.html');
  const thirdParty = terms.slice(terms.indexOf('<h2 id="third-party">'), terms.indexOf('<h2', terms.indexOf('<h2 id="third-party">') + 1));
  assert.ok(!thirdParty.includes('Bootstrap CDN'), 'terms.html still names Bootstrap CDN');
  assert.ok(!/content-delivery networks \(jsDelivr/.test(thirdParty), 'terms.html presents jsDelivr as a site-wide CDN');
  assert.match(thirdParty, /a content-delivery network used only by the administrator back office \(jsDelivr\)/);
  for (const label of ['Twilio SendGrid', 'follow.it']) {
    assert.ok(thirdParty.includes(label), `${label} is missing from the Terms third-party list`);
  }
});

test('the accessibility statement describes the cookie banner Customize controls that exist', () => {
  const banner = read('cookie-consent.js');
  assert.match(banner, /id="cookieConsentCustomize"[^>]*aria-expanded="false" aria-controls="cookieConsentOptions"/);
  assert.match(banner, /id="cookieConsentAnalytics"/);
  assert.match(banner, /id="cookieConsentAdvertising"/);
  assert.match(banner, /analyticsBox\.focus\(\)/);
  assert.match(banner, /event\.key !== 'Escape'/);

  // Only Decline all and Accept all share the filled primary-button styling;
  // Customize is deliberately an outlined, transparent secondary button.
  const css = read('theme-deferred.css');
  const rule = (selector) => css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))[1];
  assert.match(rule('.cookie-consent-btn--accept'), /background: #[0-9a-f]{6};/);
  assert.match(rule('.cookie-consent-btn--decline'), /background: #[0-9a-f]{6};/);
  assert.match(rule('.cookie-consent-btn--customize'), /background: transparent;/);

  const statement = read('src/accessibility.html');
  assert.ok(!statement.includes('granular per-category controls are not yet exposed'));
  assert.ok(!/Customize,? and Accept all are equal-weight/.test(statement), 'Customize is not styled as an equal-weight button');
  assert.match(statement, /Decline all and Accept all are equal-weight buttons; Customize is a secondary disclosure button that reports whether it is expanded; opening it reveals separate Analytics and Advertising checkboxes/);
});

test('why-english-gematria does not call Sumerian a different cipher from Base-6', () => {
  const page = read('src/why-english-gematria.html');
  assert.ok(!page.includes('Full Reduction, Sumerian, and more) reassign the letter values outright'));
  assert.match(page, /where Base-6 itself is listed as Sumerian/);
  assert.match(read('src/multi-cipher-calculator.html'), /Sumerian<\/strong><\/a> — ordinal × 6/);
});

test('the premium page does not sell the exact-value lookup the free calculator already has', () => {
  const page = read('src/premium-research.html');
  assert.ok(!page.includes('search the Gematria.Today database by exact gematria multiples of 6, and'));
  assert.ok(!page.includes('the shared-value search and the live site stats on this page need a premium'));
  assert.match(page, /the same lookup is free for everyone in the <a href="\/calculator\.html">calculator<\/a>/);
  assert.match(read('page-scripts/calculator-1.js'), /Gematria values must be positive multiples of 6/);
});
