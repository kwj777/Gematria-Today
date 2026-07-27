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
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';
import { englishGematria, digitalRoot } from './englishGematria.mjs';
import { isIndexableWord, isPublishableWord, isPublishableRow } from './_words.mjs';
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
  return '';
}

const NAV_HTML = loadPartial('nav.html');
const FOOTER_HTML = loadPartial('footer.html')
  .replaceAll('{{TAGLINE_ROW_GAP}}', '2')
  .replaceAll('{{TAGLINE}}', 'a suite of research tools.')
  .replaceAll('{{QUICK_LINKS}}', '')
  .replaceAll('{{EXTRA_LEGAL_LINKS}}', '');

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

function layout({ title, description, canonical, bodyHtml, noindex = false }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="/early-bootstrap.js"></script>
    <script defer src="/site-bundle.js"></script>
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow'}" />
    <meta property="og:site_name" content="Gematria.Today" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta name="twitter:card" content="summary" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg?v=2" />
    <link rel="stylesheet" href="/assets/fonts/fonts.css" />
    <link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css" />
    <link rel="stylesheet" href="/theme.css" />
    <link rel="stylesheet" href="/theme-deferred.css" />
  </head>
  <body>
    <a class="skip-link" href="#mainContent">Skip to main content</a>
${NAV_HTML}
    <main id="mainContent" class="py-5">
      <div class="container">
${bodyHtml}
      </div>
    </main>
${FOOTER_HTML}
  </body>
</html>
`;
}

// Every generated page ends with a route back into the site. These pages exist
// to receive search traffic; without a call to action they are dead ends.
function callToAction(prefill = '') {
  const href = prefill ? `/calculator.html?word=${encodeURIComponent(prefill)}` : '/calculator.html';
  return `        <div class="content-panel p-4 mt-4">
          <h2 class="h5 mb-2">Calculate your own word</h2>
          <p class="mb-3">Enter any word or phrase to see its English gematria value, digital root, and every word in the database that matches it.</p>
          <a class="btn btn-warning fw-semibold" href="${escapeHtml(href)}">Open the calculator</a>
        </div>`;
}

function relatedList(words, currentWord) {
  const others = words
    .filter((row) => isPublishableWord(row.word))
    .filter((row) => String(row.word).toLowerCase() !== String(currentWord || '').toLowerCase());
  if (others.length === 0) {
    return '<p class="mb-0">No other words in the database share this value yet.</p>';
  }
  const items = others.slice(0, MAX_RELATED).map((row) => {
    const w = String(row.word);
    return `<li><a href="/w/${encodeURIComponent(w)}">${escapeHtml(w)}</a></li>`;
  }).join('\n          ');
  const more = others.length > MAX_RELATED
    ? `<p class="small mb-0">Showing ${MAX_RELATED} of ${others.length}.</p>`
    : '';
  return `<ul class="site-footer-list related-word-list">\n          ${items}\n        </ul>\n        ${more}`;
}

export function renderWordPage(word, value, words, { noindex = false } = {}) {
  const root = digitalRoot(value);
  const baseRoot = isBaseRootValue(value);
  const canonical = `${SITE_ORIGIN}/w/${encodeURIComponent(word)}`;
  const title = `${word} in English Gematria = ${value} | Gematria.Today`;
  const description = `"${word}" has an English gematria value of ${value} (digital root ${root}). See every word in the Gematria.Today database that shares this value.`;

  const bodyHtml = `        <nav aria-label="Breadcrumb" class="small mb-3"><a href="/">Home</a> &middot; <a href="/calculator.html">Calculator</a></nav>
        <h1 class="display-6 fw-bold mb-3">${escapeHtml(word)}</h1>
        <p class="lead">English gematria value <strong>${value}</strong> &middot; digital root <strong>${root}</strong>${baseRoot ? ' &middot; base root' : ''}.</p>
        <p><a href="/v/${value}">See all words worth ${value}</a> &middot; <a href="/calculator.html">Calculate another word</a></p>
${breakdownHtml(word, value)}
        <h2 class="h5 mt-4 mb-2">Words sharing this value</h2>
        ${relatedList(words, word)}
${callToAction(word)}`;

  return layout({ title, description, canonical, bodyHtml, noindex });
}

export function renderValuePage(value, words, { noindex = false } = {}) {
  const root = digitalRoot(value);
  const canonical = `${SITE_ORIGIN}/v/${value}`;
  const count = words.length;
  const title = `Words with English Gematria value ${value} | Gematria.Today`;
  const description = `${count} word${count === 1 ? '' : 's'} in the Gematria.Today database have an English gematria value of ${value} (digital root ${root}).`;

  const bodyHtml = `        <nav aria-label="Breadcrumb" class="small mb-3"><a href="/">Home</a> &middot; <a href="/calculator.html">Calculator</a></nav>
        <h1 class="display-6 fw-bold mb-3">Gematria value ${value}</h1>
        <p class="lead">${count} word${count === 1 ? '' : 's'} share this value &middot; digital root <strong>${root}</strong>${isBaseRootValue(value) ? ' &middot; base root' : ''}.</p>
        <p><a href="/calculator.html">Look up a different word or value</a></p>
        <h2 class="h5 mt-4 mb-2">Words</h2>
        ${relatedList(words, null)}
${callToAction()}`;

  return layout({ title, description, canonical, bodyHtml, noindex });
}

// Netlify v2 functions (export default) must return a Response; returning a
// {statusCode, headers, body} object crashes with NetlifyUserError. Every
// other export-default function in this directory already does this.
function htmlResponse(status, body) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=86400',
    },
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
    if (!route) return htmlResponse(404, layout({
      title: 'Not found | Gematria.Today',
      description: 'That page could not be found.',
      canonical: `${SITE_ORIGIN}/`,
      bodyHtml: '        <h1 class="display-6">Not found</h1>\n        <p><a href="/calculator.html">Go to the calculator</a></p>',
    }));

    // Junk rows exist in the words table; serve them a 404 rather than a thin
    // page, so anything already crawled drops out of the index.
    if (route.kind === 'word' && !isIndexableWord(route.key)) {
      return htmlResponse(404, layout({
        title: 'Not found | Gematria.Today',
        description: 'That page could not be found.',
        canonical: `${SITE_ORIGIN}/`,
        bodyHtml: '        <h1 class="display-6">Not found</h1>\n        <p><a href="/calculator.html">Go to the calculator</a></p>',
      }));
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

    // Only pages for words somebody has actually searched are offered to
    // search engines. The rest still render for anyone who follows a link.
    const noindex = route.kind === 'word'
      ? !isPublishableRow({ word: route.key, search_count: cached.payload?.searchCount || 0 })
      : !words.some(isPublishableRow);

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
    if (error?.statusCode && error.statusCode !== 500) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.statusCode,
        headers: { 'content-type': 'application/json; charset=utf-8', ...(error.headers || {}) },
      });
    }
    console.error('word-page failed', error);
    return htmlResponse(500, layout({
      title: 'Error | Gematria.Today',
      description: 'Something went wrong.',
      canonical: `${SITE_ORIGIN}/`,
      bodyHtml: '        <h1 class="display-6">Something went wrong</h1>\n        <p><a href="/calculator.html">Go to the calculator</a></p>',
    }));
  }
}
