import { ensureAdminSchema, getSqlClient, syncBootstrapAdminUser } from './_admin.mjs';
import { buildCacheKey, withCachedJson } from './_security.mjs';
import { buildModulePublicPaths, loadPublicSiteSettings } from './_site-modules.mjs';

const STATIC_PATHS = Object.freeze([
  '/',
  '/accessibility.html',
  '/calculator.html',
  '/contact.html',
  '/disclaimer.html',
  '/faq.html',
  '/gematria-basics.html',
  '/gematria-account-setup.html',
  '/gematria-guide.html',
  '/gematria-pattern-grouping.html',
  '/gematria-name-analysis.html',
  '/name-calculator.html',
  '/privacy.html',
  '/terms.html',
  '/tools.html',
  '/why-english-gematria.html',
]);

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toUrlEntry(origin, pathname) {
  const normalizedPath = pathname === '/' ? '/' : `/${String(pathname || '').replace(/^\/+/, '')}`;
  return `  <url>\n    <loc>${escapeXml(`${origin}${normalizedPath === '/' ? '/' : normalizedPath}`)}</loc>\n  </url>`;
}

function buildSitemapXml({ siteOrigin, modules }) {
  const modulePaths = buildModulePublicPaths(modules);
  const allPaths = Array.from(new Set([...STATIC_PATHS, ...modulePaths]));

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allPaths.map((path) => toUrlEntry(siteOrigin, path)).join('\n')}\n</urlset>\n`;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { allow: 'GET' },
      body: 'Method not allowed',
    };
  }

  try {
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);

    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'sitemap-xml' }),
      route: 'sitemap-xml',
      ttlSeconds: 300,
      compute: async () => {
        const settings = await loadPublicSiteSettings(sql);
        return { xml: buildSitemapXml(settings) };
      },
    });

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/xml; charset=UTF-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=120',
        'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
      },
      body: cacheResult.payload.xml,
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 500,
      headers: { 'content-type': 'text/plain; charset=UTF-8' },
      body: error.message || 'Failed to generate sitemap.xml',
    };
  }
}
