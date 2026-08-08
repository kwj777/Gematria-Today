// Sitemaps for the generated word and value pages.
//
// Deliberately separate from the static sitemap.xml, which is hand-maintained
// and carries <lastmod> values kept in sync by update-sitemap-lastmod.mjs.
// These are generated from the database so they stay current as words are
// added, and robots.txt advertises the index.
//
// Served as an index plus fixed-size chunks. The first version built a single
// sitemap over every word: one request sorted all 30k+ rows and wrote a
// multi-megabyte JSON cache entry, which timed out and returned 502 to Search
// Console. Each chunk now touches PAGE_SIZE rows with LIMIT/OFFSET.
import { getSqlClient } from './_auth.mjs';
import { assertEndpointEnabled, buildCacheKey, documentSecurityHeaders, withCachedJson } from './_security.mjs';
import { isPublishableWord, MIN_SEARCHES_FOR_INDEX, MIN_SHARED_VALUE_WORDS } from './_words.mjs';

const SITE_ORIGIN = 'https://gematria.today';
const PAGE_SIZE = 5000;
// Sitemaps are capped at 50,000 URLs each by the protocol; stay well under.
const MAX_PAGES = 40;
// Bump when the shape or filtering of cached payloads changes, so existing
// entries are not served until their TTL lapses.
const CACHE_VERSION = 4;

// isPublishableWord is JavaScript and cannot run inside the query, so the SQL
// below pre-filters on the one rule that removes almost all of the junk: a real
// word starts with a letter, which bare numbers ("276"), punctuation ("*"),
// fragments ("-ol") and raw markup ("<er>annoy</er>") all fail. It is
// deliberately *looser* than the JS rule, never tighter -- over-counting a
// value group by a blocked word is harmless, under-counting would drop pages
// the word-page route considers indexable and put the two out of step.
const LOOKS_LIKE_A_WORD = '^[A-Za-z]';

export function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemapIndex(pageCount, origin = SITE_ORIGIN) {
  const pages = Math.max(1, Math.min(Number(pageCount) || 1, MAX_PAGES));
  const entries = Array.from({ length: pages }, (_, i) =>
    `  <sitemap>\n    <loc>${escapeXml(`${origin}/sitemap-words/${i + 1}`)}</loc>\n  </sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function buildUrlSet(locs, origin = SITE_ORIGIN) {
  const body = locs
    .map((loc) => `  <url>\n    <loc>${escapeXml(`${origin}${loc}`)}</loc>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// Page 1 carries the value pages (there are relatively few distinct values);
// the remaining pages carry words, PAGE_SIZE at a time.
// Filtering here, not only in the compute step, matters: cached payloads live
// for six hours, so a filter applied only on cache miss keeps serving junk
// that was cached before the filter existed.
export function pageLocs({ page, values, words }) {
  if (page === 1) return values.map((value) => `/v/${encodeURIComponent(String(value))}`);
  return words.filter(isPublishableWord).map((word) => `/w/${encodeURIComponent(String(word))}`);
}

// Netlify v2 functions must return a Response, not a {statusCode, body} object.
function xmlResponse(status, body) {
  return new Response(body, {
    status,
    // netlify.toml's [[headers]] block never reaches a function response.
    headers: documentSecurityHeaders({
      'content-type': 'application/xml; charset=UTF-8',
      'cache-control': 'public, max-age=21600',
    }),
  });
}

export default async function onRequest(request) {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'sitemap-words-xml' });
    const sql = getSqlClient();
    // v2 functions get the original request URL, not the rewrite target, so
    // ?page= never arrives. Read the path first; keep the query as a fallback.
    const requested = new URL(request.url);
    const params = requested.searchParams;
    const pageFromPath = requested.pathname.match(/\/sitemap-words\/(\d+)\/?$/);
    const pageParam = pageFromPath ? pageFromPath[1] : params.get('page');
    const wantsIndex = !pageParam;

    if (wantsIndex) {
      const cached = await withCachedJson(sql, {
        cacheKey: buildCacheKey({ route: 'sitemap-words-xml', v: CACHE_VERSION, part: 'index' }),
        route: 'sitemap-words-xml',
        ttlSeconds: 21600,
        compute: async () => {
          const rows = await sql`
            WITH candidates AS (
              SELECT word, search_count, gematria_value,
                     COUNT(*) OVER (PARTITION BY gematria_value) AS value_word_count
              FROM words
              WHERE word ~ ${LOOKS_LIKE_A_WORD}
            )
            SELECT COUNT(*)::int AS total FROM candidates
            WHERE search_count >= ${MIN_SEARCHES_FOR_INDEX}
              AND value_word_count >= ${MIN_SHARED_VALUE_WORDS}
          `;
          const total = Number(rows[0]?.total || 0);
          // +1 for the value-pages sitemap on page 1.
          return { pages: Math.min(MAX_PAGES, 1 + Math.ceil(total / PAGE_SIZE)) };
        },
      });
      return xmlResponse(200, buildSitemapIndex(cached.payload?.pages || 1));
    }

    const page = Math.max(1, Math.min(Number.parseInt(pageParam, 10) || 1, MAX_PAGES));

    const cached = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'sitemap-words-xml', v: CACHE_VERSION, part: String(page) }),
      route: 'sitemap-words-xml',
      ttlSeconds: 21600,
      compute: async () => {
        if (page === 1) {
          // Value pages earn their place on the size of the list they render,
          // matching the /v/ branch of word-page.mjs.
          const rows = await sql`
            SELECT gematria_value FROM words
            WHERE word ~ ${LOOKS_LIKE_A_WORD}
            GROUP BY gematria_value
            HAVING COUNT(*) >= ${MIN_SHARED_VALUE_WORDS}
            ORDER BY gematria_value ASC LIMIT ${PAGE_SIZE}
          `;
          return { values: rows.map((row) => Number(row.gematria_value)), words: [] };
        }
        const offset = (page - 2) * PAGE_SIZE;
        const rows = await sql`
          WITH candidates AS (
            SELECT word, search_count, gematria_value,
                   COUNT(*) OVER (PARTITION BY gematria_value) AS value_word_count
            FROM words
            WHERE word ~ ${LOOKS_LIKE_A_WORD}
          )
          SELECT word FROM candidates
          WHERE search_count >= ${MIN_SEARCHES_FOR_INDEX}
            AND value_word_count >= ${MIN_SHARED_VALUE_WORDS}
          ORDER BY word ASC LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `;
        return { values: [], words: rows.map((row) => row.word) };
      },
    });

    const data = cached.payload || { values: [], words: [] };
    return xmlResponse(200, buildUrlSet(pageLocs({ page, values: data.values || [], words: data.words || [] })));
  } catch (error) {
    console.error('sitemap-words-xml failed', error);
    return new Response('Failed to build words sitemap', {
      status: 500,
      headers: documentSecurityHeaders({ 'content-type': 'text/plain; charset=utf-8' }),
    });
  }
}
