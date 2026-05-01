import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const GA_MEASUREMENT_ID = 'G-E611H84D6Y';
const BOOTSTRAP_SRC = 'analytics-bootstrap.js';
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'secure', 'tests', 'docs', 'sql']);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const absolute = join(dir, entry);
    const st = statSync(absolute);
    if (st.isDirectory()) {
      walk(absolute, acc);
      continue;
    }
    if (entry.toLowerCase().endsWith('.html')) {
      acc.push(absolute);
    }
  }
  return acc;
}

const files = walk(ROOT);
const missing = [];
let scanned = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  // Skip files that are not real HTML pages (e.g. third-party verification tokens).
  if (!/<head[\s>]/i.test(source)) continue;
  scanned += 1;

  const hasInlineSnippet = source.includes(GA_MEASUREMENT_ID);
  const hasBootstrap = source.includes(BOOTSTRAP_SRC);
  if (!hasInlineSnippet && !hasBootstrap) {
    missing.push(relative(ROOT, file).split(sep).join('/'));
  }
}

if (missing.length > 0) {
  console.error('Google Analytics snippet missing from the following HTML files:');
  for (const file of missing) {
    console.error(` - ${file}`);
  }
  console.error(
    `\nEvery deployed HTML page must reference the GA measurement ID ${GA_MEASUREMENT_ID} ` +
      `or include <script defer src="/${BOOTSTRAP_SRC}"></script>.`
  );
  process.exit(1);
}

console.log(`Google Analytics snippet present in all ${scanned} HTML pages.`);
