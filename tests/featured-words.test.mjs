import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { FEATURED_GROUPS, FEATURED_WORDS, featuredWordPath, getFeaturedWord } from '../netlify/functions/_featured-words.mjs';
import { isPublishableWord } from '../netlify/functions/_words.mjs';
import { renderValuePage, renderWordPage } from '../netlify/functions/word-page.mjs';
import { pageLocs } from '../netlify/functions/sitemap-words-xml.mjs';
import { STATIC_PATHS } from '../netlify/functions/sitemap-xml.mjs';

test('every featured word is publishable, in a known group, unique, and has a note', () => {
  const groups = new Set(FEATURED_GROUPS.map((group) => group.id));
  const seen = new Set();
  for (const entry of FEATURED_WORDS) {
    assert.ok(isPublishableWord(entry.word), entry.word);
    assert.ok(groups.has(entry.group), `${entry.word} has unknown group ${entry.group}`);
    assert.ok(!seen.has(entry.word.toLowerCase()), `${entry.word} is listed twice`);
    seen.add(entry.word.toLowerCase());
    assert.ok(entry.note.length > 20 && entry.note.length < 240, `${entry.word} note length`);
  }
});

test('featured words are found whatever the casing', () => {
  assert.equal(getFeaturedWord('JESUS')?.word, 'Jesus');
  assert.equal(getFeaturedWord(' holy spirit ')?.word, 'Holy Spirit');
  assert.equal(getFeaturedWord('dull-pated'), null);
});

test('a featured word page shows its note, links its value siblings, and canonicalises to one URL', () => {
  const html = renderWordPage('JESUS', 444, [{ word: 'Jesus' }, { word: 'Messiah' }]);
  assert.match(html, /<link rel="canonical" href="https:\/\/gematria\.today\/w\/jesus" \/>/);
  assert.match(html, /<meta name="robots" content="index,follow" \/>/);
  assert.match(html, /<h1[^>]*>Jesus<\/h1>/);
  assert.ok(html.includes(getFeaturedWord('jesus').note));
  assert.ok(html.includes('<a href="/w/messiah">Messiah</a>'));
  assert.ok(html.includes('<a href="/w/lucifer">Lucifer</a>'));
  // The stored row is 'Messiah'; the link goes to the canonical, not the casing.
  assert.ok(!html.includes('href="/w/Messiah"'));
  assert.ok(html.includes('href="/bible-names-gematria.html"'));
});

test('value pages link a featured word at its canonical URL, whatever casing its row has', () => {
  const html = renderValuePage(444, [{ word: 'Jesus' }, { word: 'GOSPEL' }, { word: 'Kale' }]);
  assert.ok(html.includes('<a href="/w/jesus">Jesus</a>'));
  assert.ok(html.includes('<a href="/w/gospel">GOSPEL</a>'));
  // An ordinary, unsearched word is listed without a link.
  assert.ok(html.includes('<li>Kale</li>'));
});

test('an ordinary word page is unchanged by the featured list', () => {
  const html = renderWordPage('light', 336, [{ word: 'light' }]);
  assert.ok(!html.includes('>About light<'));
  assert.ok(!html.includes('Bible names list'));
  assert.match(html, /<link rel="canonical" href="https:\/\/gematria\.today\/w\/light" \/>/);
});

test('the words sitemap lists every featured word once, under its canonical path', () => {
  const first = pageLocs({ page: 1, values: [444], words: [] });
  for (const entry of FEATURED_WORDS) {
    assert.ok(first.includes(featuredWordPath(entry.word)), entry.word);
  }
  assert.ok(first.includes('/v/444'));
  // The table's own copy of a featured word is left off the later pages.
  assert.deepEqual(pageLocs({ page: 2, values: [], words: ['Jesus', 'light'] }), ['/w/light']);
});

test('the Bible names page is in the static sitemap and links every featured word', async () => {
  assert.ok(STATIC_PATHS.includes('/bible-names-gematria.html'));
  const sitemap = await fs.readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
  assert.ok(sitemap.includes('<loc>https://gematria.today/bible-names-gematria.html</loc>'));
  const source = await fs.readFile(new URL('../src/bible-names-gematria.html', import.meta.url), 'utf8');
  assert.ok(source.includes('{{ entry.href }}'));
  // Counts come from the list at build time, never typed into the copy.
  assert.ok(!source.includes(String(FEATURED_WORDS.length)), 'hard-coded count of featured words');
  assert.ok(source.includes('{{ bibleNames.count }} Bible names'));
});
