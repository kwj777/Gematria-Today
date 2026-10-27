// Shared by the OG edge functions (calculator-og, name-calculator-og, blog-og).
//
// Plain JavaScript rather than TypeScript so the Node test suite can import it
// directly -- CI runs Node 20, which cannot load the .ts edge functions. This
// file lives in a subdirectory so Netlify does not treat it as an edge
// function of its own.

export function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Every value below is spliced in with a replacer *function*. A replacement
// *string* expands $&, $`, $' and $1 -- so a shared link with ?query=$` copied
// the whole document head, scripts included, into the <title> and meta tags,
// and ?query=$& data-x=1 injected attributes into the matched tag.
export function replaceMetaContent(html, selector, newValue) {
  const attrMatch = String(selector).match(/meta\[(property|name)="([^"]+)"\]/);
  if (!attrMatch) {
    return html;
  }
  const [, attrName, attrValue] = attrMatch;
  const pattern = new RegExp(`(<meta\\s[^>]*${attrName}="${attrValue}"[^>]*\\scontent=")([^"]*)(")`);
  const escaped = escapeAttr(newValue);
  return html.replace(pattern, (_match, before, _previous, after) => `${before}${escaped}${after}`);
}

export function replaceTitle(html, title) {
  const escaped = escapeAttr(title);
  return html.replace(/(<title[^>]*>)[^<]*(<\/title>)/, (_match, open, close) => `${open}${escaped}${close}`);
}

export function replaceCanonical(html, href) {
  const escaped = escapeAttr(href);
  return html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, (_match, before, after) => `${before}${escaped}${after}`);
}

// Base-6 English gematria, matching englishGematria(), digitalRoot() and
// isBaseRootValue() in netlify/functions/englishGematria.mjs. Share cards
// recompute every number from the words themselves: a total, digital root or
// base-root flag read off the URL let anyone mint a site-branded "result" for
// any value they liked. Letters are read the same way as gematriaLetters():
// NFKC first, then ASCII A-Z only, so ß, ligatures and full-width letters
// count here exactly as they do on the calculator.
export function getPerLetterValues(input) {
  return Array.from(String(input ?? '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase())
    .map((char) => ({ letter: char, value: (char.charCodeAt(0) - 64) * 6 }));
}

export function englishGematria(input) {
  return getPerLetterValues(input).reduce((sum, { value }) => sum + value, 0);
}

export function digitalRoot(value) {
  let root = Math.abs(Math.trunc(Number(value) || 0));
  while (root >= 10) {
    root = String(root).split('').reduce((sum, digit) => sum + Number(digit), 0);
  }
  return root;
}

export function isBaseRootValue(total) {
  return Number(total - 6) % 54 === 0;
}

// A post's body is fetched and drawn in the browser, so the HTML a crawler
// receives for blog.html?post=<slug> used to hold only the loading placeholder.
// Google can render JavaScript, but it does so later, on a separate budget, and
// gives up on pages that fetch their content from an API it has to queue too.
// Putting the post into the first response makes the words on the page the
// post's words from the first fetch. blog-2.js replaces this article with its
// own rendering once it loads, so readers see no difference.
//
// innerHTML never runs a <script>, but HTML in a response does, so anything
// that could execute is removed here rather than trusted to the client's
// rendering path. Posts are written by editors, so this is a backstop, not a
// sanitiser for untrusted input.
const EXECUTABLE_ELEMENTS = /<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi;
const EXECUTABLE_TAGS = /<\/?(?:script|style|iframe|object|embed|template|base|meta|link)\b[^>]*>/gi;
// A tag, with quoted attribute values allowed to contain '>'.
const TAG_TOKEN = /(<(?:[^>"']|"[^"]*"|'[^']*')*>)/g;
const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"'`]+)/gi;
const JAVASCRIPT_URL_ATTR = /(\s(?:href|src|action|formaction|xlink:href)\s*=\s*["']?)\s*javascript:/gi;

function stripExecutableMarkupOnce(html) {
  // Attributes only exist inside tags. Run over the text as well, the handler
  // pattern deleted gematria prose such as "one = 204</a>", closing tag included.
  return html
    .replace(EXECUTABLE_ELEMENTS, '')
    .replace(EXECUTABLE_TAGS, '')
    .split(TAG_TOKEN)
    .map((token) => (token.startsWith('<')
      ? token.replace(EVENT_HANDLER_ATTR, '').replace(JAVASCRIPT_URL_ATTR, '$1#')
      : token))
    .join('');
}

// One pass can assemble what it removes: "<scr<script></script>ipt>" leaves
// "<script>". Every pass that changes anything makes the string shorter, so
// repeating until nothing changes always ends.
export function stripExecutableMarkup(html) {
  let current = String(html ?? '');
  for (;;) {
    const next = stripExecutableMarkupOnce(current);
    if (next === current) return next;
    current = next;
  }
}

// The admin editor can prepend a generated SVG hero wrapped in these markers.
// blog-2.js strips it before rendering (stripAutoGeneratedHeroMarkup), so the
// first response must too, or crawlers index an image readers never see.
const AUTO_GENERATED_HERO = /<!--\s*auto-generated-hero\s*-->[\s\S]*?<!--\s*\/auto-generated-hero\s*-->\s*/gi;

const BLOG_PLACEHOLDER_PATTERN =
  /<article class="blog-post-card p-4 p-lg-5 news-placeholder-panel">[\s\S]*?<\/article>/;

export function injectPostArticle(html, { title, bodyHtml }) {
  const body = stripExecutableMarkup(String(bodyHtml ?? '').replace(AUTO_GENERATED_HERO, ''));
  if (!body.trim()) {
    return html;
  }
  const article = `<article class="content-panel p-4 p-lg-5 blog-post-card"><h1 class="blog-post-title h2 mb-3">${escapeAttr(title)}</h1><div class="blog-post-body d-grid gap-3">${body}</div></article>`;
  return html.replace(BLOG_PLACEHOLDER_PATTERN, () => article);
}
