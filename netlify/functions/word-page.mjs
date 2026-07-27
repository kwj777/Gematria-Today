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
import { getSqlClient, jsonResponse } from './_auth.mjs';
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

// /w/light -> {kind:'word', key:'light'}; /v/336 -> {kind:'value', key:'336'}
export function parseRoute(pathname = '') {
  const clean = String(pathname).split('?')[0].split('#')[0];
  const wordMatch = clean.match(/\/w\/([^/]+)\/?$/);
  if (wordMatch) {
    const key = decodeURIComponent(wordMatch[1]).trim();
    return key ? { kind: 'word', key } : null;
  }
  const valueMatch = clean.match(/\/v\/(\d+)\/?$/);
  if (valueMatch) return { kind: 'value', key: valueMatch[1] };
  return null;
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
  const others = words.filter((row) => String(row.word).toLowerCase() !== String(currentWord || '').toLowerCase());
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

function htmlResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=86400',
    },
    body,
  };
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

    const route = parseRoute(new URL(request.url).pathname);
    if (!route) return htmlResponse(404, layout({
      title: 'Not found | Gematria.Today',
      description: 'That page could not be found.',
      canonical: `${SITE_ORIGIN}/`,
      bodyHtml: '        <h1 class="display-6">Not found</h1>\n        <p><a href="/calculator.html">Go to the calculator</a></p>',
    }));

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

    const words = cached.value?.words || cached.words || [];

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
      return jsonResponse(error.statusCode, { error: error.message }, error.headers || {});
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
