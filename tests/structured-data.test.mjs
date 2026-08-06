import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every JSON-LD block the site publishes, parsed. A malformed block is invisible
// until a search engine silently drops the whole page's structured data, so the
// only way to notice is to check. Runs against src/ rather than _site/ so it
// works without a build.
const SRC = new URL('../src/', import.meta.url).pathname;
const PAGES = readdirSync(SRC).filter((name) => name.endsWith('.html'));

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html))) blocks.push(match[1]);
  return blocks;
}

test('every JSON-LD block on every page is valid JSON', () => {
  let checked = 0;
  for (const page of PAGES) {
    const html = readFileSync(join(SRC, page), 'utf8');
    for (const [index, raw] of jsonLdBlocks(html).entries()) {
      checked += 1;
      assert.doesNotThrow(
        () => JSON.parse(raw),
        `src/${page} JSON-LD block ${index + 1} is not valid JSON`,
      );
    }
  }
  assert.ok(checked > 0, 'expected to find JSON-LD blocks to check');
});

test('every JSON-LD node declares a @type', () => {
  for (const page of PAGES) {
    const html = readFileSync(join(SRC, page), 'utf8');
    for (const raw of jsonLdBlocks(html)) {
      const parsed = JSON.parse(raw);
      const nodes = parsed['@graph'] || (Array.isArray(parsed) ? parsed : [parsed]);
      for (const node of nodes) {
        assert.ok(node['@type'], `src/${page} has a JSON-LD node without @type: ${JSON.stringify(node).slice(0, 80)}`);
      }
    }
  }
});

test('a SearchAction target actually contains the placeholder its query-input names', () => {
  // The home page declared `query-input: "required name=search_term_string"`
  // against a bare target URL with no {search_term_string} in it, so the action
  // described a search it had no way to perform.
  let found = 0;
  for (const page of PAGES) {
    const html = readFileSync(join(SRC, page), 'utf8');
    for (const raw of jsonLdBlocks(html)) {
      const parsed = JSON.parse(raw);
      const nodes = parsed['@graph'] || (Array.isArray(parsed) ? parsed : [parsed]);
      for (const node of nodes) {
        const action = node.potentialAction;
        if (!action || action['@type'] !== 'SearchAction') continue;
        found += 1;
        const nameMatch = String(action['query-input'] || '').match(/name=(\S+)/);
        assert.ok(nameMatch, `src/${page} SearchAction has no named query-input`);
        const target = typeof action.target === 'string' ? action.target : action.target?.urlTemplate;
        assert.ok(target, `src/${page} SearchAction has no target URL`);
        assert.ok(
          target.includes(`{${nameMatch[1]}}`),
          `src/${page} SearchAction target "${target}" never uses {${nameMatch[1]}}`,
        );
      }
    }
  }
  assert.equal(found, 1, 'expected exactly one SearchAction on the site');
});
