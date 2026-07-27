// Sitemap for the generated word and value pages.
//
// Deliberately separate from the static sitemap.xml, which is hand-maintained
// and carries <lastmod> values kept in sync by update-sitemap-lastmod.mjs.
// This one is generated from the database so it stays current as words are
// added, and robots.txt advertises both.
import { getSqlClient } from './_auth.mjs';
import { assertEndpointEnabled, buildCacheKey, withCachedJson } from './_security.mjs';

const SITE_ORIGIN = 'https://gematria.today';
// Sitemaps are capped at 50,000 URLs by the protocol.
const MAX_URLS = 45000;

export function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildWordsSitemap(words, values, origin = SITE_ORIGIN) {
  const entries = [
    ...values.map((value) => `${origin}/v/${encodeURIComponent(String(value))}`),
    ...words.map((word) => `${origin}/w/${encodeURIComponent(String(word))}`),
  ].slice(0, MAX_URLS);

  const body = entries
    .map((loc) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export default async function onRequest() {
  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'sitemap-words-xml' });
    const sql = getSqlClient();

    const cached = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'sitemap-words-xml' }),
      route: 'sitemap-words-xml',
      ttlSeconds: 21600,
      compute: async () => {
        const wordRows = await sql`
          SELECT word FROM words ORDER BY search_count DESC, LOWER(word) ASC LIMIT ${MAX_URLS}
        `;
        const valueRows = await sql`
          SELECT DISTINCT gematria_value FROM words ORDER BY gematria_value ASC
        `;
        return {
          words: wordRows.map((row) => row.word),
          values: valueRows.map((row) => Number(row.gematria_value)),
        };
      },
    });

    const data = cached.value || cached;
    const xml = buildWordsSitemap(data.words || [], data.values || []);

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/xml; charset=UTF-8',
        'cache-control': 'public, max-age=21600',
      },
      body: xml,
    };
  } catch (error) {
    console.error('sitemap-words-xml failed', error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: 'Failed to build words sitemap',
    };
  }
}
