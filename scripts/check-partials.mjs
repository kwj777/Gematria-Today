#!/usr/bin/env node
// The nav and footer are injected at build time from src/_includes. This check
// replaces the old sync-partials.mjs: instead of copying chrome into every page
// and detecting drift afterwards, it asserts that no page has re-inlined a copy,
// and that every page still renders the chrome it is supposed to.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { hasFooter, FOOTER_SECTION_BY_FILE } from './lib/page-chrome.mjs';

const rootDir = process.cwd();
const srcDir = join(rootDir, 'src');
const siteDir = join(rootDir, '_site');

const problems = [];

// 1. Sources must use the shortcodes, never an inlined copy of the chrome.
const pages = readdirSync(srcDir).filter((name) => name.endsWith('.html')).sort();

for (const fileName of pages) {
  const source = readFileSync(join(srcDir, fileName), 'utf8');

  if (/<nav class="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm sticky-top"/.test(source)) {
    problems.push(`${fileName}: inlines the nav instead of using {% nav %}`);
  } else if (!source.includes('{% nav %}')) {
    problems.push(`${fileName}: no {% nav %} shortcode`);
  }

  if (/<footer class="site-footer/.test(source)) {
    problems.push(`${fileName}: inlines the footer instead of using {% footer %}`);
  } else if (hasFooter(fileName) && !source.includes('{% footer %}')) {
    problems.push(`${fileName}: mapped to a footer section but has no {% footer %} shortcode`);
  } else if (!hasFooter(fileName) && source.includes('{% footer %}')) {
    problems.push(`${fileName}: renders a footer but is not in FOOTER_SECTION_BY_FILE`);
  }
}

// 2. Every page in the footer map must actually exist.
for (const fileName of Object.keys(FOOTER_SECTION_BY_FILE)) {
  if (!pages.includes(fileName)) {
    problems.push(`${fileName}: listed in FOOTER_SECTION_BY_FILE but not present in src/`);
  }
}

// 3. The build output must contain the rendered chrome -- catches a shortcode
//    that silently produced nothing.
if (existsSync(siteDir)) {
  for (const fileName of pages) {
    const built = join(siteDir, fileName);
    if (!existsSync(built)) {
      problems.push(`${fileName}: not present in _site/`);
      continue;
    }
    const html = readFileSync(built, 'utf8');
    if (!/<nav class="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm sticky-top"/.test(html)) {
      problems.push(`${fileName}: built output has no nav`);
    }
    if (hasFooter(fileName) && !/<footer class="site-footer/.test(html)) {
      problems.push(`${fileName}: built output has no footer`);
    }
  }
} else {
  problems.push('_site/ not found. Run `npm run build` first.');
}

if (problems.length > 0) {
  console.error('Page chrome problems:');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

console.log(`Nav and footer are injected from src/_includes in all ${pages.length} pages.`);
