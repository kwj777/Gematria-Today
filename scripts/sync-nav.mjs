import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const mode = process.argv.includes('--check') ? 'check' : 'write';
const rootDir = process.cwd();
const partialPath = join(rootDir, 'partials', 'nav.html');

// Pages that should use the consolidated public-site nav.
// Admin pages have their own nav and are intentionally excluded.
const EXCLUDED_FILES = new Set([
  'follow.it-verification-code.html',
  'offline.html',
  'unsupported-browser.html',
]);
const EXCLUDED_PREFIXES = ['admin'];

// Maps an HTML filename to the href that should be marked active.
// Pages not listed get no active link (e.g. policy pages, account-recovery).
// The Calculator / Name Calculator / GemaBot pages don't appear directly in
// the nav, so we mark the Tools link active when the user is on one of them.
const ACTIVE_LINK_BY_FILE = {
  'blog.html': '/blog.html',
  'contact.html': '/contact.html',
  'faq.html': '/faq.html',
  'definitions.html': '/definitions.html',
  'gematria-basics.html': '/gematria-basics.html',
  'gematria-guide.html': '/gematria-guide.html',
  'searchbot.html': '/searchbot.html',
  'tools.html': '/tools.html',
  'calculator.html': '/calculator.html',
  'multi-cipher-calculator.html': '/multi-cipher-calculator.html',
  'name-calculator.html': '/name-calculator.html',
  'ai-agent.html': '/ai-agent.html',
  'member.html': '/member.html',
};

const NAV_BLOCK_RE = /(^[ \t]*)<nav class="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm sticky-top"[^>]*>[\s\S]*?<\/nav>\n/m;

function shouldProcess(fileName) {
  if (!fileName.endsWith('.html')) return false;
  if (EXCLUDED_FILES.has(fileName)) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => fileName.startsWith(prefix))) return false;
  return true;
}

function applyActiveState(nav, activeHref) {
  if (!activeHref) return nav;

  let result = nav;

  // Mark the matching <a> as active. Supports nav-link (top-level),
  // dropdown-item (Bootstrap dropdowns), nav-mega-item (Tools mega-menu),
  // and nav-mega-footer (Tools "Compare tools →" footer link, used to carry
  // the active state on /tools.html since the dropdown toggle is now a
  // <button> with no href).
  const escapedHref = activeHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkRegex = new RegExp(`(<a class="(?:nav-link|dropdown-item|nav-mega-item|nav-mega-footer)(?!\\s+active)[^"]*)("(?:[^>]*?\\s)?href="${escapedHref}")`);
  const matched = result.replace(linkRegex, (_, classOpen, hrefPart) => `${classOpen} active${hrefPart} aria-current="page"`);
  if (matched === result) {
    throw new Error(`Could not find link with href="${activeHref}" to mark active`);
  }
  return matched;
}

async function loadPartial() {
  const partial = await readFile(partialPath, 'utf8');
  // Strip trailing newline; we will re-add it when stamping in.
  return partial.replace(/\n+$/, '');
}

async function listHtmlFiles() {
  const entries = await readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(shouldProcess)
    .sort();
}

const partialSource = await loadPartial();

const drifted = [];
const missingNav = [];

for (const fileName of await listHtmlFiles()) {
  const pageFile = join(rootDir, fileName);
  const original = await readFile(pageFile, 'utf8');

  if (!NAV_BLOCK_RE.test(original)) {
    missingNav.push(fileName);
    continue;
  }

  const desiredNav = applyActiveState(partialSource, ACTIVE_LINK_BY_FILE[fileName] || null);
  const updated = original.replace(NAV_BLOCK_RE, (match, leadingIndent) => {
    // Re-indent the partial to match the source file (partial is already
    // 4-space indented, which matches all current pages).
    void leadingIndent;
    return `${desiredNav}\n`;
  });

  if (updated === original) continue;

  drifted.push(fileName);
  if (mode === 'write') {
    await writeFile(pageFile, updated);
    console.log(`Synced nav in ${fileName}`);
  }
}

if (missingNav.length > 0) {
  console.error('Pages without a recognized <nav> block (update sync-nav.mjs):');
  for (const fileName of missingNav) console.error(` - ${fileName}`);
  process.exit(1);
}

if (mode === 'check') {
  if (drifted.length > 0) {
    console.error('Nav markup has drifted from partials/nav.html:');
    for (const fileName of drifted) console.error(` - ${fileName}`);
    console.error('\nRun `npm run sync-nav` to update.');
    process.exit(1);
  }
  console.log(`Nav markup matches partials/nav.html in all pages.`);
} else {
  console.log(`Synced ${drifted.length} file(s).`);
}
