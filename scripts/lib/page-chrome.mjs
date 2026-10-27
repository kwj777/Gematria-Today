// Shared definition of the site chrome (nav + footer) and its per-page slots.
// Used by .eleventy.js to render pages and by scripts/check-partials.mjs to
// verify no stale copies remain in the tree.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  'how-to-use-gematria.html': '/how-to-use-gematria.html',
  'bible-names-gematria.html': '/bible-names-gematria.html',
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
  community: 'discussion, reputation, and community.',
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
  'how-to-use-gematria.html': 'learn',
  'bible-names-gematria.html': 'learn',
  'why-english-gematria.html': 'learn',
  'accessibility.html': 'legal',
  'contact.html': 'legal',
  'disclaimer.html': 'legal',
  'privacy.html': 'legal',
  'terms.html': 'legal',
  'searchbot.html': 'tools',
  'account-recovery.html': 'member',
  'gematria-account-setup.html': 'member',
  'member.html': 'member',
  'premium-research.html': 'member',
  'forum.html': 'community',
  'forum-reputation-scale.html': 'community',
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

export {
  EXCLUDED_FILES,
  EXCLUDED_PREFIXES,
  ACTIVE_LINK_BY_FILE,
  FOOTER_SECTION_BY_FILE,
  FOOTER_TAGLINES,
  applyActiveState,
  renderFooter,
};

export function shouldProcess(fileName) {
  if (!fileName.endsWith('.html')) return false;
  if (EXCLUDED_FILES.has(fileName)) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => fileName.startsWith(prefix))) return false;
  return true;
}

export function hasFooter(fileName) {
  return Boolean(FOOTER_SECTION_BY_FILE[fileName]);
}

export async function loadPartials(rootDir) {
  const read = async (name) => (await readFile(join(rootDir, name), 'utf8')).replace(/\n+$/, '');
  return {
    nav: await read(join('src', '_includes', 'nav.html')),
    footer: await read(join('src', '_includes', 'footer.html')),
  };
}

export function renderNav(partial, fileName) {
  return applyActiveState(partial, ACTIVE_LINK_BY_FILE[fileName] || null);
}
