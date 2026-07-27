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

const SITE_ORIGIN = 'https://gematria.today';
const MAX_RELATED = 200;

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

// The words table is populated from lookups and contains entries that should
// never be offered to a search engine: bare numbers (0, 45, 276), punctuation
// (*), fragments (-ol), digit strings ("2 5 0 62 4"), and Wordnik markup that
// was stored raw (<er>annoy</er>). Publishing tens of thousands of URLs where
// a slice are junk pages is an active ranking risk, not just untidy.
const MARKUP_OR_WILDCARD = /[<>{}|*\\/\[\]^~`"]/;

export function isIndexableWord(word) {
  const value = String(word ?? '').trim();
  if (!value || value.length > 64) return false;
  // Must read as a word: begins with a letter, not a digit or punctuation.
  if (!/^[A-Za-z]/.test(value)) return false;
  if (MARKUP_OR_WILDCARD.test(value)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) return false;
  return true;
}

export function isBaseRootValue(total) {
  return (Number(total) - 6) % 54 === 0;
}

function layout({ title, description, canonical, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta name="robots" content="index,follow" />
    <meta property="og:site_name" content="Gematria.Today" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta name="twitter:card" content="summary" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg?v=2" />
    <link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css" />
    <link rel="stylesheet" href="/theme.css" />
  </head>
  <body>
    <a class="skip-link" href="#mainContent">Skip to main content</a>
    <main id="mainContent" class="py-5">
      <div class="container">
${bodyHtml}
      </div>
    </main>
  </body>
</html>
`;
}

function relatedList(words, currentWord) {
  const others = words
    .filter((row) => isIndexableWord(row.word))
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
  return `<ul class="columns-list">\n          ${items}\n        </ul>\n        ${more}`;
}

export function renderWordPage(word, value, words) {
  const root = digitalRoot(value);
  const baseRoot = isBaseRootValue(value);
  const canonical = `${SITE_ORIGIN}/w/${encodeURIComponent(word)}`;
  const title = `${word} in English Gematria = ${value} | Gematria.Today`;
  const description = `"${word}" has an English gematria value of ${value} (digital root ${root}). See every word in the Gematria.Today database that shares this value.`;

  const bodyHtml = `        <nav aria-label="Breadcrumb" class="small mb-3"><a href="/">Home</a> &middot; <a href="/calculator.html">Calculator</a></nav>
        <h1 class="display-6 fw-bold mb-3">${escapeHtml(word)}</h1>
        <p class="lead">English gematria value <strong>${value}</strong> &middot; digital root <strong>${root}</strong>${baseRoot ? ' &middot; base root' : ''}.</p>
        <p><a href="/v/${value}">See all words worth ${value}</a> &middot; <a href="/calculator.html">Calculate another word</a></p>
        <h2 class="h5 mt-4 mb-2">Words sharing this value</h2>
        ${relatedList(words, word)}`;

  return layout({ title, description, canonical, bodyHtml });
}

export function renderValuePage(value, words) {
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
        ${relatedList(words, null)}`;

  return layout({ title, description, canonical, bodyHtml });
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
          SELECT word
          FROM words
          WHERE gematria_value = ${value}
          ORDER BY LOWER(word) ASC
        `;
        return { words: words.map((row) => ({ word: row.word })) };
      },
    });

    const words = cached.payload?.words || [];

    await logRequestAudit(sql, request, {
      route: 'word-page',
      action: route.kind,
      outcome: 'success',
      metadata: { key: route.key, value },
    });

    const html = route.kind === 'word'
      ? renderWordPage(route.key, value, words)
      : renderValuePage(value, words);

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
