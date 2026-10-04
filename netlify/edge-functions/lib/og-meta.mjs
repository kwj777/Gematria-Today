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
