#!/usr/bin/env node
// One-shot migration: move the public pages into src/ and replace their inlined
// nav/footer blocks with Eleventy shortcodes. Kept in the tree so the move is
// reproducible and reviewable, not a pile of hand edits.
import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { shouldProcess, hasFooter } from './lib/page-chrome.mjs';

const rootDir = process.cwd();
const srcDir = join(rootDir, 'src');

const NAV_BLOCK_RE = /^[ \t]*<nav class="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm sticky-top"[^>]*>[\s\S]*?<\/nav>\n/m;
const FOOTER_BLOCK_RE = /^[ \t]*<footer class="site-footer[^"]*"[^>]*>[\s\S]*?<\/footer>\n/m;

await mkdir(srcDir, { recursive: true });

const entries = await readdir(rootDir, { withFileTypes: true });
const pages = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter(shouldProcess)
  .sort();

const migrated = [];
const problems = [];

for (const fileName of pages) {
  const source = await readFile(join(rootDir, fileName), 'utf8');

  if (!NAV_BLOCK_RE.test(source)) {
    problems.push(`${fileName}: no nav block`);
    continue;
  }
  if (hasFooter(fileName) && !FOOTER_BLOCK_RE.test(source)) {
    problems.push(`${fileName}: expected a footer block but found none`);
    continue;
  }

  // The captured blocks include their leading indentation and trailing
  // newline; the shortcode returns the partial with its own indentation, so
  // we supply only the newline here.
  let template = source.replace(NAV_BLOCK_RE, '{% nav %}\n');
  if (hasFooter(fileName)) {
    template = template.replace(FOOTER_BLOCK_RE, '{% footer %}\n');
  }

  await writeFile(join(srcDir, fileName), template);
  await unlink(join(rootDir, fileName));
  migrated.push(fileName);
}

if (problems.length > 0) {
  console.error('Migration problems:');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

console.log(`Migrated ${migrated.length} page(s) into src/.`);
