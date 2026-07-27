#!/usr/bin/env node
// Keeps shared page chrome in sync from partials/. Replaces the earlier
// sync-nav.mjs, which owned the <nav> only -- the footer had no equivalent and
// had fragmented into 8 variants across 25 pages before this script took it on.
//
// Each partial declares its own block regex, its exclusions, and any per-page
// slots. Adding a third partial means adding one entry to PARTIALS.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const mode = process.argv.includes('--check') ? 'check' : 'write';
const rootDir = process.cwd();

// Pages that should use the consolidated public-site chrome.
// Admin pages have their own nav and are intentionally excluded.
const EXCLUDED_FILES = new Set([
  'follow.it-verification-code.html',
  'offline.html',
  'unsupported-browser.html',
]);
const EXCLUDED_PREFIXES = ['admin'];

// ---------------------------------------------------------------------------
// nav
// ---------------------------------------------------------------------------

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

function applyActiveState(nav, activeHref) {
  if (!activeHref) return nav;

  // Mark the matching <a> as active. Supports nav-link (top-level),
  // dropdown-item (Bootstrap dropdowns), nav-mega-item (Tools mega-menu),
  // and nav-mega-footer (Tools "Compare tools →" footer link, used to carry
  // the active state on /tools.html since the dropdown toggle is now a
  // <button> with no href).
  const escapedHref = activeHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkRegex = new RegExp(`(<a class="(?:nav-link|dropdown-item|nav-mega-item|nav-mega-footer)(?!\\s+active)[^"]*)("(?:[^>]*?\\s)?href="${escapedHref}")`);
  const marked = nav.replace(linkRegex, (_, classOpen, hrefPart) => `${classOpen} active${hrefPart} aria-current="page"`);
  if (marked === nav) {
    throw new Error(`Could not find link with href="${activeHref}" to mark active`);
  }
  return marked;
}

// ---------------------------------------------------------------------------
// footer
// ---------------------------------------------------------------------------

// Each section of the site gets its own footer tagline. This is the only thing
// that varied across most of the pre-existing footer variants.
const FOOTER_TAGLINES = {
  home: 'a suite of research tools.',
  tools: 'research tools and calculators.',
  learn: 'gematria, explained from the basics up.',
  legal: 'policies, disclosures, and support.',
  member: 'your member workspace.',
};

const FOOTER_SECTION_BY_FILE = {
  '404.html': 'home',
  'index.html': 'home',
  'badge.html': 'tools',
  'calculator.html': 'tools',
  'gematria-name-analysis.html': 'tools',
  'gematria-pattern-grouping.html': 'tools',
  'gematria-results.html': 'tools',
  'multi-cipher-calculator.html': 'tools',
  'name-calculator.html': 'tools',
  'tools.html': 'tools',
  'blog.html': 'learn',
  'definitions.html': 'learn',
  'faq.html': 'learn',
  'gematria-basics.html': 'learn',
  'gematria-guide.html': 'learn',
  'why-english-gematria.html': 'learn',
  'accessibility.html': 'legal',
  'contact.html': 'legal',
  'disclaimer.html': 'legal',
  'privacy.html': 'legal',
  'terms.html': 'legal',
  'account-recovery.html': 'member',
  'gematria-account-setup.html': 'member',
  'member.html': 'member',
};

// The home page carries an extra quick-links row; account-recovery carries an
// extra legal-row link back to the dashboard. Both were already in the markup
// before this script existed and are preserved deliberately.
const FOOTER_QUICK_LINKS = {
  'index.html': [
    ['/calculator.html', 'Calculator'],
    ['/blog.html', 'Blog'],
    ['/faq.html', 'FAQ'],
    ['/tools.html', 'Tools'],
  ],
};

const FOOTER_EXTRA_LEGAL_LINKS = {
  'account-recovery.html': [['/member.html', 'Dashboard']],
};

function renderFooter(partial, fileName) {
  const section = FOOTER_SECTION_BY_FILE[fileName];
  if (!section) {
    throw new Error(`No footer section mapped for ${fileName} (add it to FOOTER_SECTION_BY_FILE)`);
  }
  const tagline = FOOTER_TAGLINES[section];
  if (!tagline) {
    throw new Error(`Unknown footer section "${section}" for ${fileName}`);
  }

  const quickLinks = FOOTER_QUICK_LINKS[fileName];
  const quickLinksBlock = quickLinks
    ? [
      '          <nav aria-label="Quick links" class="d-flex flex-wrap align-items-baseline gap-2 site-footer-quick-links">',
      ...quickLinks.map(([href, label]) => `            <a href="${href}">${label}</a>`),
      '          </nav>',
      '',
    ].join('\n')
    : '';

  const extraLegal = FOOTER_EXTRA_LEGAL_LINKS[fileName];
  const extraLegalBlock = extraLegal
    ? `${extraLegal.map(([href, label]) => `          <a href="${href}">${label}</a>`).join('\n')}\n`
    : '';

  return partial
    // The quick-links row needs a wider gap when it is present.
    .replaceAll('{{TAGLINE_ROW_GAP}}', quickLinks ? '3' : '2')
    .replaceAll('{{TAGLINE}}', tagline)
    .replaceAll('{{QUICK_LINKS}}', quickLinksBlock)
    .replaceAll('{{EXTRA_LEGAL_LINKS}}', extraLegalBlock);
}

// ---------------------------------------------------------------------------

const PARTIALS = [
  {
    name: 'nav',
    partialPath: join(rootDir, 'partials', 'nav.html'),
    blockRe: /(^[ \t]*)<nav class="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm sticky-top"[^>]*>[\s\S]*?<\/nav>\n/m,
    // Every non-excluded page must carry the nav.
    required: () => true,
    render: (partial, fileName) => applyActiveState(partial, ACTIVE_LINK_BY_FILE[fileName] || null),
  },
  {
    name: 'footer',
    partialPath: join(rootDir, 'partials', 'footer.html'),
    blockRe: /(^[ \t]*)<footer class="site-footer[^"]*"[^>]*>[\s\S]*?<\/footer>\n/m,
    // Several pages (forum, searchbot, premium-research, ai-agent) deliberately
    // ship without the site footer, so absence is only an error for pages that
    // have been assigned a footer section.
    required: (fileName) => Boolean(FOOTER_SECTION_BY_FILE[fileName]),
    render: renderFooter,
  },
];

function shouldProcess(fileName) {
  if (!fileName.endsWith('.html')) return false;
  if (EXCLUDED_FILES.has(fileName)) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => fileName.startsWith(prefix))) return false;
  return true;
}

async function loadPartial(path) {
  const partial = await readFile(path, 'utf8');
  // Strip trailing newline; we re-add it when stamping in.
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

const sources = new Map();
for (const partial of PARTIALS) {
  sources.set(partial.name, await loadPartial(partial.partialPath));
}

const drifted = [];
const missing = [];
const renderErrors = [];
const files = await listHtmlFiles();

for (const fileName of files) {
  const pageFile = join(rootDir, fileName);
  const original = await readFile(pageFile, 'utf8');
  let updated = original;

  for (const partial of PARTIALS) {
    const present = partial.blockRe.test(updated);
    if (!present) {
      if (partial.required(fileName)) missing.push(`${fileName} (${partial.name})`);
      continue;
    }

    let desired;
    try {
      desired = partial.render(sources.get(partial.name), fileName);
    } catch (error) {
      renderErrors.push(`${fileName} (${partial.name}): ${error.message}`);
      continue;
    }
    updated = updated.replace(partial.blockRe, () => `${desired}\n`);
  }

  if (updated === original) continue;

  drifted.push(fileName);
  if (mode === 'write') {
    await writeFile(pageFile, updated);
    console.log(`Synced partials in ${fileName}`);
  }
}

if (renderErrors.length > 0) {
  console.error('Could not render a partial for these pages:');
  for (const entry of renderErrors) console.error(` - ${entry}`);
  process.exit(1);
}

if (missing.length > 0) {
  console.error('Pages missing a required partial block (update scripts/sync-partials.mjs):');
  for (const entry of missing) console.error(` - ${entry}`);
  process.exit(1);
}

if (mode === 'check') {
  if (drifted.length > 0) {
    console.error('Page chrome has drifted from partials/:');
    for (const fileName of drifted) console.error(` - ${fileName}`);
    console.error('\nRun `npm run sync:partials` to update.');
    process.exit(1);
  }
  console.log(`Nav and footer markup match partials/ in all ${files.length} pages.`);
} else {
  console.log(`Synced ${drifted.length} file(s).`);
}
