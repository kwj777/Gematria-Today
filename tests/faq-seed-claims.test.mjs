import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CIPHERS } from '../page-scripts/multi-cipher-engine.mjs';

// /faq.html and SiteSeeker answer from the rows sql/seed_faqs.sql seeds. Those
// rows promised a multi-cipher main calculator, a guest-readable forum with
// voting, an export button, an interactive pattern-grouping tool, premium-only
// multiples-of-six search and self-serve account deletion -- none of which the
// code does. Each test pins what the FAQ now says against the code it describes.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const FAQ_SEED = read('../sql/seed_faqs.sql').replaceAll("''", "'");

function functionBody(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `no function ${name}`);
  const end = source.indexOf('\nasync function ', start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

function faqAnswer(id) {
  const start = FAQ_SEED.indexOf(`'${id}',`);
  assert.notEqual(start, -1, `no seeded FAQ ${id}`);
  const end = FAQ_SEED.indexOf('\n  )', start);
  return FAQ_SEED.slice(start, end);
}

test('the FAQ says the main calculator uses one cipher and the multi-cipher page shows seven', () => {
  const calculator = read('../page-scripts/calculator-1.js');
  assert.ok(!/multi-cipher-engine/.test(calculator), 'the main calculator does not compute other ciphers');
  assert.match(calculator, /\/\.netlify\/functions\/englishGematria/);
  assert.equal(CIPHERS.length, 7);

  const overview = faqAnswer('seed-faq-calculator-vs-name-calculator-vs-pattern-grouping');
  assert.ok(!overview.includes('several English ciphers'));
  assert.ok(overview.includes('returns its English Gematria value'));
  assert.ok(overview.includes('shows the same input under seven ciphers side by side'));

  const ciphers = faqAnswer('seed-faq-which-ciphers-supported');
  assert.ok(ciphers.includes('use one cipher, English Gematria'));
  for (const cipher of CIPHERS) {
    const name = cipher.name.replace(' (Pythagorean)', '');
    assert.ok(ciphers.includes(name), `the cipher list is missing ${cipher.name}`);
  }
  assert.ok(ciphers.includes('Database matches are available only for the English Gematria (Sumerian) value.'));

  const results = faqAnswer('seed-faq-reading-calculator-results');
  assert.ok(!results.includes('under each cipher'));
});

test('database matching is only offered for the Sumerian (English Gematria) value', () => {
  const multiCipher = read('../page-scripts/multi-cipher-calculator-1.js');
  assert.match(multiCipher, /const isSumerian = r\.cipherId === 'sumerian';/);
  assert.match(multiCipher, /isSumerian\s*\?\s*`<a href="\/gematria-results\.html\?gematria=/);
});

test('the forum FAQs match a forum that needs sign-in and has no voting', () => {
  const forum = read('../netlify/functions/member-forum.mjs');
  const handler = forum.slice(forum.indexOf('export async function handler'));
  assert.match(handler, /getAuthenticatedMember\(event, \{ requireAuth: true \}\)/);
  assert.ok(handler.indexOf('requireAuth: true') < handler.indexOf("event.httpMethod === 'GET'"), 'reads are behind sign-in too');
  assert.match(forum, /const REPUTATION_POINTS = \{\s*thread: 10,\s*reply: 4,\s*\};/);
  assert.ok(!/vote/i.test(forum), 'no voting exists');

  const guests = faqAnswer('seed-faq-guest-forum-access');
  assert.ok(!guests.includes('readable without signing in'));
  assert.ok(!/voting/i.test(guests));
  assert.ok(guests.includes('No. The forum is for signed-in members'));

  const reputation = faqAnswer('seed-faq-forum-reputation-overview');
  assert.ok(!/upvote/i.test(reputation));
  assert.ok(reputation.includes('each thread you start earns 10 points and each reply 4'));
  assert.ok(reputation.includes('there is no voting'));
  assert.match(forum, /if \(points >= 200\) badges\.push\('Sage'\);\s*else if \(points >= 50\) badges\.push\('Trusted'\);/);
  assert.ok(reputation.includes('Reaching 50 points earns the Trusted badge and 200 the Sage badge'));
});

test('the forum FAQ and reputation page say a moderator deleting a post takes its points back', () => {
  const forum = read('../netlify/functions/member-forum.mjs');
  const deleteThread = functionBody(forum, 'moderateThread').split("mode === 'delete'")[1];
  assert.match(deleteThread, /revokeReputation\(sql, rows\[0\]\.author_user_id, \{ points: REPUTATION_POINTS\.thread, threadCount: 1 \}\)/);
  assert.match(deleteThread, /revokeReputation\(sql, replyAuthor\.author_user_id, \{ points: REPUTATION_POINTS\.reply \* total, replyCount: total \}\)/);
  assert.match(functionBody(forum, 'moderateReply'), /revokeReputation\(sql, rows\[0\]\.author_user_id, \{ points: REPUTATION_POINTS\.reply, replyCount: 1 \}\)/);
  assert.match(functionBody(forum, 'revokeReputation'), /GREATEST\(points - \$\{points\}, 0\)/, 'a score stops at zero');

  const reputation = faqAnswer('seed-faq-forum-reputation-overview');
  assert.ok(!/never deducted/i.test(reputation));
  assert.ok(reputation.includes('When a moderator deletes a thread or reply, the points it earned are taken back'));
  assert.ok(reputation.includes('deleting a thread also takes back the points for every reply in it'));

  const page = read('../src/forum-reputation-scale.html');
  assert.ok(!/never deducted|rather than by subtracting/i.test(page));
  assert.ok(page.includes('when a moderator deletes a thread or reply, the points it earned are taken back'));
  assert.ok(page.includes('Deleting a thread also takes back the points for every reply in it, whoever posted them'));
  assert.ok(page.includes('Your score never drops below zero'));
});

test('the FAQ does not promise an export of saved searches and notes that the member page lacks', () => {
  const member = read('../page-scripts/member-1.js');
  const exportFunctions = [...member.matchAll(/function (download\w+)\(/g)].map((match) => match[1]);
  assert.deepEqual(exportFunctions, ['downloadChatSession'], 'only chat sessions can be downloaded');

  const exportAnswer = faqAnswer('seed-faq-export-saved-research');
  assert.ok(!exportAnswer.includes('exportable from the member page'));
  assert.ok(exportAnswer.includes('Saved searches and notes have no export button yet'));
  assert.ok(exportAnswer.includes('can be downloaded as HTML, Markdown, plain text or JSON'));
});

test('the FAQ calls Pattern Grouping a lesson, not an interactive tool', () => {
  const page = read('../src/gematria-pattern-grouping.html');
  assert.ok(!/<(input|select|textarea|form)\b/i.test(page), 'the page has no controls to build clusters with');

  const grouping = faqAnswer('seed-faq-base-root-word-grouping');
  assert.ok(!grouping.includes('lets you build clusters interactively'));
  const digitalRoot = faqAnswer('seed-faq-digital-root');
  assert.ok(!digitalRoot.includes('surfaces these alignments automatically'));
  assert.ok(digitalRoot.includes('its digital root can only be 3, 6 or 9'));
});

test('the premium FAQ does not sell the multiples-of-six search that is free for everyone', () => {
  const search = read('../netlify/functions/searchByGematria.mjs');
  assert.ok(!/membership|premium|requireAuth/i.test(search), 'the shared-value search has no premium gate');
  const calculator = read('../page-scripts/calculator-1.js');
  assert.match(calculator, /function requestWordsByGematria[\s\S]*?\/\.netlify\/functions\/searchByGematria/);

  const premium = faqAnswer('seed-faq-premium-vs-free');
  assert.ok(!premium.includes('the ability to search the database by exact English gematria multiples of six'));
  assert.ok(premium.includes('is free for everyone in the calculator'));
  assert.ok(!premium.includes('read public forum threads'));
});

test('the FAQ does not describe a self-serve account deletion that does not exist', () => {
  const member = read('../page-scripts/member-1.js');
  assert.ok(!/delete.{0,20}account|account.{0,20}delet/i.test(member), 'the member page has no delete-account control');

  const retention = faqAnswer('seed-faq-data-retention-after-cancellation');
  assert.ok(!retention.includes('If you fully delete your account'));
  assert.ok(retention.includes('There is no self-serve account deletion yet'));
});
