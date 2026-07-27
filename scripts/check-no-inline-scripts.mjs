#!/usr/bin/env node
/**
 * Enforce that no HTML page reintroduces inline JavaScript so the CSP
 * script-src directive can stay free of 'unsafe-inline'.
 *
 * Rejects:
 *  - <script>...</script> with no src and a JS type (or no type)
 *  - on*="..." event handler attributes
 *  - javascript: URLs in href/src
 *
 * Allowed:
 *  - <script src="..."></script>
 *  - <script type="application/ld+json">...</script> (data, not JS)
 *  - <script type="application/json">...</script>
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Checks run against the build output -- that is what actually ships.
// Run `npm run build` first (npm run lint does).
const ROOT = join(process.cwd(), '_site');
if (!existsSync(ROOT)) {
  console.error('_site/ not found. Run \`npm run build\` first.');
  process.exit(1);
}
const EXCLUDE_DIRS = new Set(['.git', 'node_modules']);

function walkHtml(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const absolute = join(dir, entry);
    const st = statSync(absolute);
    if (st.isDirectory()) {
      walkHtml(absolute, acc);
      continue;
    }
    if (entry.endsWith('.html')) acc.push(absolute);
  }
  return acc;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const EVENT_HANDLER_RE = /\son[a-z]+\s*=\s*"[^"]*"/gi;
const JS_URL_RE = /\b(?:href|src)\s*=\s*"\s*javascript:/gi;

function isDataScript(attrs) {
  const m = attrs.match(/\btype\s*=\s*"([^"]+)"/i);
  if (!m) return false;
  const t = m[1].toLowerCase();
  return (
    t === 'application/ld+json' ||
    t === 'application/json' ||
    t === 'text/template' ||
    t === 'text/plain'
  );
}

const files = walkHtml(ROOT);
const violations = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);

  SCRIPT_RE.lastIndex = 0;
  let match;
  while ((match = SCRIPT_RE.exec(source)) !== null) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (isDataScript(attrs)) continue;
    if (body.trim() === '') continue;
    violations.push(`${rel}: inline <script> block (move it to an external .js file)`);
  }

  if (EVENT_HANDLER_RE.test(source)) {
    violations.push(`${rel}: inline event handler attribute (use addEventListener in an external script)`);
  }

  if (JS_URL_RE.test(source)) {
    violations.push(`${rel}: javascript: URL`);
  }
}

if (violations.length) {
  console.error('Inline script policy violations:\n');
  for (const v of violations) console.error(`- ${v}`);
  console.error(
    '\nCSP script-src no longer allows \'unsafe-inline\'; inline JS will be blocked at runtime.',
  );
  process.exit(1);
}

console.log(`Inline-script check passed for ${files.length} HTML files.`);
