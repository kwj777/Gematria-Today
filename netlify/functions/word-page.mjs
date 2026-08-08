// Server-rendered, indexable pages for the words table.
//
// The site has 30,000+ words in the database and 25 URLs in the sitemap.
// Calculator results are query-parameter driven, so none of that data is
// addressable or indexable. These routes give every word and every gematria
// value a real URL, and cross-link them so the whole set is crawlable once any
// one page is reached.
//
//   /w/:word   -> one word: value, digital root, base-root, words that match it
//   /v/:value  -> every word with that gematria value
import { getSqlClient } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, documentSecurityHeaders, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';
import { englishGematria, digitalRoot } from './englishGematria.mjs';
import { isIndexableWord, isPublishableWord, hasEnoughSearches, hasEnoughSharedWords } from './_words.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export { isIndexableWord };

const SITE_ORIGIN = 'https://gematria.today';
const MAX_RELATED = 200;

// The real nav and footer, bundled via included_files in netlify.toml. Without
// these the generated pages were chrome-less dead ends: a visitor arriving from
// search had no branding and no way into the site.
function loadPartial(name) {
  for (const base of [process.cwd(), join(process.cwd(), '..'), '/var/task']) {
    try {
      return readFileSync(join(base, 'src', '_includes', name), 'utf8').replace(/\n+$/, '');
    } catch {
      // try the next candidate
    }
  }
  // Returning '' silently would ship chrome-less pages again -- the exact
  // regression the site-shell work fixed -- with nothing in the logs to say so.
  console.error(`word-page: could not load src/_includes/${name}; pages will render without it`);
  return '';
}

const NAV_HTML = loadPartial('nav.html');
const FOOTER_HTML = loadPartial('footer.html')
  .replaceAll('{{TAGLINE_ROW_GAP}}', '2')
  // Same tagline the built tools pages use. It read "a suite of research
  // tools." here, which is the home page's, and gave the generated pages away.
  .replaceAll('{{TAGLINE}}', 'research tools and calculators.')
  .replaceAll('{{QUICK_LINKS}}', '')
  .replaceAll('{{EXTRA_LEGAL_LINKS}}', '');

// No social platform renders image/svg+xml in a share card, and these pages
// exist to be shared. Every other share surface on the site -- badge-share,
// blog-post-share, the three OG edge functions -- already rasterizes through
// Netlify's image CDN; this one pointed straight at the SVG.
const OGP_IMAGE_WIDTH = 1200;
const OGP_IMAGE_FORMAT = 'jpg';
const SHARE_IMAGE = `${SITE_ORIGIN}/.netlify/images?url=${encodeURIComponent(`${SITE_ORIGIN}/assets/calculator-hero-constellation.svg`)}&w=${OGP_IMAGE_WIDTH}&fm=${OGP_IMAGE_FORMAT}`;
const SHARE_IMAGE_ALT = 'Constellation artwork representing linked words and numbers.';

// A=6, L=72, A=6 -> 84. Unique to every word, and the one thing a gematria
// page should obviously show. Its absence was most of why these read as thin.
export function letterBreakdown(word) {
  return String(word)
    .toUpperCase()
    .split('')
    .filter((char) => char >= 'A' && char <= 'Z')
    .map((char) => ({ letter: char, value: (char.charCodeAt(0) - 64) * 6 }));
}

function breakdownHtml(word, total) {
  const letters = letterBreakdown(word);
  if (letters.length === 0) return '';
  const cells = letters
    .map(({ letter, value }) => `<div class="letter-value-grid__cell" role="cell"><span class="letter-value-grid__letter">${escapeHtml(letter)}</span><span class="letter-value-grid__value">${value}</span></div>`)
    .join('\n          ');
  const sum = letters.map(({ letter, value }) => `${escapeHtml(letter)}&nbsp;${value}`).join(' + ');
  return `        <h2 class="h5 mt-4 mb-2">How ${escapeHtml(word)} adds up</h2>
        <div class="letter-value-grid mb-3" role="table" aria-label="Letter values for ${escapeHtml(word)}">
          ${cells}
        </div>
        <p class="small text-muted">${sum} = <strong>${total}</strong></p>`;
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Netlify v2 functions receive the ORIGINAL request URL, not the rewrite
// target, so query parameters injected by a redirect (?kind=...&key=...) never
// arrive. /b/:username works that way only because badge-share is a v1
// `handler`, which does see the rewritten URL. Parse the real path first and
// treat the query as a fallback so this works under either runtime.
export function parseRoute(input) {
  let pathname = '';
  let params = new URLSearchParams();

  if (input instanceof URLSearchParams) {
    params = input;
  } else if (input instanceof URL) {
    pathname = input.pathname;
    params = input.searchParams;
  } else if (typeof input === 'string') {
    try {
      const url = new URL(input, 'https://gematria.today');
      pathname = url.pathname;
      params = url.searchParams;
    } catch {
      pathname = input.split('?')[0];
    }
  }

  const wordMatch = pathname.match(/\/w\/([^/]+)\/?$/);
  if (wordMatch) {
    const key = decodeURIComponent(wordMatch[1]).trim();
    if (key) return { kind: 'word', key };
  }

  const valueMatch = pathname.match(/\/v\/(\d+)\/?$/);
  if (valueMatch) return { kind: 'value', key: valueMatch[1] };

  const kind = String(params.get('kind') || '').trim();
  const key = String(params.get('key') || '').trim();
  if (!key) return null;
  if (kind === 'word') return { kind: 'word', key };
  if (kind === 'value') return /^\d+$/.test(key) ? { kind: 'value', key } : null;
  return null;
}

export function isBaseRootValue(total) {
  return (Number(total) - 6) % 54 === 0;
}

// JSON-LD is embedded in a <script>, so the only character that can break out
// of it is '<'. JSON.stringify handles quoting; this handles the escape hatch.
function jsonLdScript(data) {
  return `    <script type="application/ld+json">
${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}
    </script>`;
}

function breadcrumbJsonLd(trail) {
  return jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  });
}

// `canonical: null` omits the canonical link entirely. Error pages used to
// point theirs at the home page, which is a mixed signal at best.
function layout({ title, description, canonical, bodyHtml, noindex = false, breadcrumb = null }) {
  const robots = noindex || !canonical ? 'noindex,follow' : 'index,follow';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="/early-bootstrap.js"></script>
    <script defer src="/site-bundle.js"></script>
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
${canonical ? `    <link rel="canonical" href="${escapeHtml(canonical)}" />\n` : ''}    <meta name="robots" content="${robots}" />
    <meta property="og:site_name" content="Gematria.Today" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
${canonical ? `    <meta property="og:url" content="${escapeHtml(canonical)}" />\n` : ''}    <meta property="og:image" content="${escapeHtml(SHARE_IMAGE)}" />
    <meta property="og:image:alt" content="${SHARE_IMAGE_ALT}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(SHARE_IMAGE)}" />
    <meta name="twitter:image:alt" content="${SHARE_IMAGE_ALT}" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg?v=2" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Gematria.Today" />
    <meta name="theme-color" content="#2d547c" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="stylesheet" href="/assets/fonts/fonts.css" />
    <link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css" />
    <link rel="preload" as="style" href="/api/public-theme-css" data-promote-stylesheet />
    <noscript><link rel="stylesheet" href="/api/public-theme-css" /></noscript>
    <link rel="stylesheet" href="/theme.css" />
    <link rel="stylesheet" href="/theme-deferred.css" />
${breadcrumb ? `${breadcrumbJsonLd(breadcrumb)}\n` : ''}  </head>
  <body>
    <a class="skip-link" href="#mainContent">Skip to main content</a>
${NAV_HTML}
    <main id="mainContent" class="py-5">
      <div class="container">
${bodyHtml}
      </div>
    </main>
${FOOTER_HTML}
    <script defer src="/assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  </body>
</html>
`;
}

// Every generated page ends with a route back into the site. These pages exist
// to receive search traffic; without a call to action they are dead ends.
function callToAction(prefill = '') {
  // The calculator reads ?query=, not ?word=, so the prefill was silently
  // dropped and the CTA always opened an empty calculator.
  const href = prefill ? `/calculator.html?query=${encodeURIComponent(prefill)}` : '/calculator.html';
  return `        <div class="content-panel p-4 mt-4">
          <h2 class="h5 mb-2">Calculate your own word</h2>
          <p class="mb-3">Enter any word or phrase to see its English gematria value, digital root, and every word in the database that matches it.</p>
          <a class="btn btn-warning fw-semibold" href="${escapeHtml(href)}">Open the calculator</a>
        </div>`;
}

// Words that survive the junk filter, minus the page's own word. Both the
// visible list and the counts in the title/lead come from this, so a value page
// can't claim "12 words" above a list of 11.
export function publishableRelated(words, currentWord) {
  return words
    .filter((row) => isPublishableWord(row.word))
    .filter((row) => String(row.word).toLowerCase() !== String(currentWord || '').toLowerCase())
    .map((row) => String(row.word));
}

function relatedList(others, { value, emptyMessage }) {
  if (others.length === 0) {
    return `<p class="mb-0">${escapeHtml(emptyMessage)}</p>`;
  }
  const items = others.slice(0, MAX_RELATED).map((word) =>
    `<li><a href="/w/${encodeURIComponent(word)}">${escapeHtml(word)}</a></li>`
  ).join('\n          ');
  // Past the cap the remaining words used to be unreachable: the only thing
  // on the page was a passive "Showing 200 of N." with nowhere to go.
  const more = others.length > MAX_RELATED
    ? `<p class="small mt-3 mb-0">Showing the first ${MAX_RELATED} of ${others.length}. <a href="/calculator.html?query=${encodeURIComponent(String(value))}">See the full list in the calculator</a>.</p>`
    : '';
  return `<ul class="related-word-list">\n          ${items}\n        </ul>\n        ${more}`;
}

// /w/light, /w/Light and /w/LIGHT all render, so without this each casing
// self-canonicalized and competed as its own indexable URL. The calculator
// builds permalinks from whatever the user typed, so mixed casing is normal.
export function canonicalWordForm(word, words = []) {
  const stored = words
    .map((row) => String(row.word ?? row))
    .find((candidate) => candidate.toLowerCase() === String(word).toLowerCase());
  return stored || String(word).toLowerCase();
}

export function renderWordPage(word, value, words, { noindex = false } = {}) {
  const root = digitalRoot(value);
  const baseRoot = isBaseRootValue(value);
  const canonicalWord = canonicalWordForm(word, words);
  const canonical = `${SITE_ORIGIN}/w/${encodeURIComponent(canonicalWord)}`;
  const title = `${word} in English Gematria = ${value} | Gematria.Today`;
  const description = `"${word}" has an English gematria value of ${value} (digital root ${root}). See every word in the Gematria.Today database that shares this value.`;
  const others = publishableRelated(words, word);

  const bodyHtml = `        <nav aria-label="Breadcrumb" class="small mb-3"><a href="/">Home</a> &middot; <a href="/calculator.html">Calculator</a></nav>
        <h1 class="display-6 fw-bold mb-3">${escapeHtml(word)}</h1>
        <p class="lead">English gematria value <strong>${value}</strong> &middot; digital root <strong>${root}</strong>${baseRoot ? ' &middot; base root' : ''}.</p>
        <p><a href="/v/${value}">See all words worth ${value}</a> &middot; <a href="/calculator.html">Calculate another word</a></p>
${breakdownHtml(word, value)}
        <h2 class="h5 mt-4 mb-2">Words sharing this value</h2>
        ${relatedList(others, { value, emptyMessage: 'No other words in the database share this value yet.' })}
${callToAction(word)}`;

  return layout({
    title,
    description,
    canonical,
    bodyHtml,
    noindex,
    breadcrumb: [
      { name: 'Home', item: `${SITE_ORIGIN}/` },
      { name: 'Calculator', item: `${SITE_ORIGIN}/calculator.html` },
      { name: word, item: canonical },
    ],
  });
}

export function renderValuePage(value, words, { noindex = false } = {}) {
  const root = digitalRoot(value);
  const canonical = `${SITE_ORIGIN}/v/${value}`;
  // Count what the page actually lists: `words.length` counted junk rows that
  // the list itself filters out, so the two disagreed.
  const listed = publishableRelated(words, null);
  const count = listed.length;
  const title = `Words with English Gematria value ${value} | Gematria.Today`;
  const description = `${count} word${count === 1 ? '' : 's'} in the Gematria.Today database have an English gematria value of ${value} (digital root ${root}).`;

  const bodyHtml = `        <nav aria-label="Breadcrumb" class="small mb-3"><a href="/">Home</a> &middot; <a href="/calculator.html">Calculator</a></nav>
        <h1 class="display-6 fw-bold mb-3">Gematria value ${value}</h1>
        <p class="lead">${count} word${count === 1 ? '' : 's'} share this value &middot; digital root <strong>${root}</strong>${isBaseRootValue(value) ? ' &middot; base root' : ''}.</p>
        <p><a href="/calculator.html">Look up a different word or value</a></p>
        <h2 class="h5 mt-4 mb-2">Words</h2>
        ${relatedList(listed, { value, emptyMessage: 'No words in the database have this value yet — be the first to add one by calculating a word.' })}
${callToAction()}`;

  return layout({
    title,
    description,
    canonical,
    bodyHtml,
    noindex,
    breadcrumb: [
      { name: 'Home', item: `${SITE_ORIGIN}/` },
      { name: 'Calculator', item: `${SITE_ORIGIN}/calculator.html` },
      { name: `Value ${value}`, item: canonical },
    ],
  });
}

// Netlify v2 functions (export default) must return a Response; returning a
// {statusCode, headers, body} object crashes with NetlifyUserError. Every
// other export-default function in this directory already does this.
function htmlResponse(status, body) {
  return new Response(body, {
    status,
    // netlify.toml's [[headers]] block never reaches a function response, so
    // these pages carry the site security headers themselves.
    headers: documentSecurityHeaders({
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=86400',
    }),
  });
}

// One place for the not-found body so the three callers can't drift.
function errorPage({ title, heading, body, status }) {
  return htmlResponse(status, layout({
    title: `${title} | Gematria.Today`,
    description: body,
    // No canonical on an error page: layout() turns that into noindex too.
    canonical: null,
    bodyHtml: `        <h1 class="display-6 fw-bold mb-3">${escapeHtml(heading)}</h1>
        <p class="lead">${escapeHtml(body)}</p>
${callToAction()}`,
  }));
}

function notFoundPage() {
  return errorPage({
    status: 404,
    title: 'Not found',
    heading: 'That page could not be found',
    body: 'We don’t have a page for that word or value. Try calculating it instead.',
  });
}

export default async function onRequest(request) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'word-page' });
    const sql = getSqlClient();

    await applyRateLimit(sql, request, {
      scope: 'word-page-ip',
      key: getClientIp(request),
      limit: 120,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many word page requests.',
    });

    const route = parseRoute(request.url);
    if (!route) return notFoundPage();

    // Junk rows exist in the words table; serve them a 404 rather than a thin
    // page, so anything already crawled drops out of the index.
    if (route.kind === 'word' && !isIndexableWord(route.key)) {
      return notFoundPage();
    }

    const value = route.kind === 'word'
      ? Number(englishGematria(route.key))
      : Number(route.key);

    const cached = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'word-page', kind: route.kind, key: route.key.toLowerCase() }),
      route: 'word-page',
      ttlSeconds: 600,
      compute: async () => {
        const words = await sql`
          SELECT word, search_count
          FROM words
          WHERE gematria_value = ${value}
          ORDER BY LOWER(word) ASC
        `;
        const self = await sql`
          SELECT search_count FROM words WHERE LOWER(word) = ${String(route.key).toLowerCase()} LIMIT 1
        `;
        return {
          words: words.map((row) => ({ word: row.word, search_count: row.search_count })),
          searchCount: Number(self[0]?.search_count || 0),
        };
      },
    });

    const words = cached.payload?.words || [];

    // /v/999999999999 used to render a live-looking page announcing "0 words
    // share this value". Nothing is there, so say so with a 404.
    if (route.kind === 'value' && publishableRelated(words, null).length === 0) {
      return notFoundPage();
    }

    // Only pages that clear both halves of the gate in _words.mjs -- repeated
    // demand for the word, and enough sibling words to make the page more than
    // its own letter sum -- are offered to search engines. Everything else
    // still renders in full for anyone who follows a link; the page is fine,
    // it just isn't something to put in front of a search engine.
    const sharedWordCount = publishableRelated(words, null).length;
    const noindex = route.kind === 'word'
      ? !(isPublishableWord(route.key)
        && hasEnoughSearches({ search_count: cached.payload?.searchCount || 0 })
        && hasEnoughSharedWords(sharedWordCount))
      // A value page is a genuine aggregation -- every word in the database
      // worth 336 -- so it earns indexing on the size of that list alone,
      // without needing any one of those words to have been searched.
      : !hasEnoughSharedWords(sharedWordCount);

    await logRequestAudit(sql, request, {
      route: 'word-page',
      action: route.kind,
      outcome: 'success',
      metadata: { key: route.key, value },
    });

    const html = route.kind === 'word'
      ? renderWordPage(route.key, value, words, { noindex })
      : renderValuePage(value, words, { noindex });

    return htmlResponse(200, html);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    if (status !== 500) {
      // These are pages a person can land on -- a rate limit while clicking
      // through word links, or a disabled endpoint -- and they used to return
      // a bare {"error":"..."} JSON blob with no way back into the site.
      if (status === 404) return withExtraHeaders(notFoundPage(), error.headers);
      if (status === 429) {
        return withExtraHeaders(errorPage({
          status,
          title: 'Too many requests',
          heading: 'You’re browsing faster than we can keep up',
          body: 'Give it a minute and try again — the calculator is still available in the meantime.',
        }), error.headers);
      }
      return withExtraHeaders(errorPage({
        status,
        title: 'Unavailable',
        heading: 'This page is temporarily unavailable',
        body: 'Word and value pages are offline right now. The calculator still works.',
      }), error.headers);
    }
    console.error('word-page failed', error);
    return errorPage({
      status: 500,
      title: 'Error',
      heading: 'Something went wrong',
      body: 'We couldn’t build this page. Try the calculator instead.',
    });
  }
}

// Preserves retry-after and friends from a thrown error onto the rendered page.
function withExtraHeaders(response, extraHeaders) {
  if (!extraHeaders) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
