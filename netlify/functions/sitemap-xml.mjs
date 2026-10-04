import { ensureAdminSchema, getSqlClient, syncBootstrapAdminUser } from './_admin.mjs';
import { buildCacheKey, withCachedJson } from './_security.mjs';
import { buildModulePublicPaths, loadPublicSiteSettings, normalizeSiteModules } from './_site-modules.mjs';

export const STATIC_PATHS = Object.freeze([
  '/',
  '/accessibility.html',
  '/calculator.html',
  '/contact.html',
  '/definitions.html',
  '/disclaimer.html',
  '/faq.html',
  '/gematria-basics.html',
  '/gematria-account-setup.html',
  '/gematria-guide.html',
  '/gematria-pattern-grouping.html',
  '/gematria-name-analysis.html',
  '/gematria-results.html',
  '/how-to-use-gematria.html',
  '/multi-cipher-calculator.html',
  '/name-calculator.html',
  '/privacy.html',
  '/terms.html',
  '/tools.html',
  '/why-english-gematria.html',
]);

export function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toUrlEntry(origin, pathname, lastmod = '') {
  const normalizedPath = pathname === '/' ? '/' : `/${String(pathname || '').replace(/^\/+/, '')}`;
  const lastmodLine = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : '';
  return `  <url>\n    <loc>${escapeXml(`${origin}${normalizedPath === '/' ? '/' : normalizedPath}`)}</loc>${lastmodLine}\n  </url>`;
}

function toLastmodDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

// Blog posts render client-side at blog.html?post=<slug>, which is the
// canonical every post page declares (blog-post-share, blog-og). Nothing else
// links to them in crawlable HTML, so without these entries a post could only
// be found through RSS. /blog/<slug> is a redirect to this URL and is left out.
export function buildBlogPostPaths(posts = []) {
  const seen = new Set();
  const entries = [];
  for (const post of posts) {
    const slug = String(post?.slug || '').trim();
    if (!slug || seen.has(slug.toLowerCase())) continue;
    seen.add(slug.toLowerCase());
    entries.push({
      path: `/blog.html?post=${encodeURIComponent(slug)}`,
      lastmod: toLastmodDate(post.lastModified),
    });
  }
  return entries;
}

export function buildSitemapXml({ siteOrigin, modules, posts = [] }) {
  const modulePaths = buildModulePublicPaths(modules);
  const allPaths = Array.from(new Set([...STATIC_PATHS, ...modulePaths]));
  const postEntries = normalizeSiteModules(modules).blog ? buildBlogPostPaths(posts) : [];
  const entries = [
    ...allPaths.map((path) => toUrlEntry(siteOrigin, path)),
    ...postEntries.map(({ path, lastmod }) => toUrlEntry(siteOrigin, path, lastmod)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

// Mirrors what /api/public-posts serves to the public (published or blank
// status, plus scheduled drafts whose time has come), minus posts the admin
// hid from the blog -- the same exclusion the RSS feed makes.
export async function loadSitemapPosts(sql) {
  const rows = await sql`
    SELECT slug, GREATEST(updated_at, published_at, created_at) AS last_modified
    FROM posts
    WHERE (
      COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
      OR (
        COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
        AND scheduled_publish_at IS NOT NULL
        AND scheduled_publish_at <= NOW()
      )
    )
      AND COALESCE(hide_from_blog, FALSE) = FALSE
      AND BTRIM(COALESCE(slug, '')) <> ''
    ORDER BY COALESCE(published_at, created_at) DESC
  `;
  return rows.map((row) => ({ slug: row.slug, lastModified: row.last_modified }));
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
        const posts = settings.modules?.blog === false ? [] : await loadSitemapPosts(sql);
        return { xml: buildSitemapXml({ ...settings, posts }) };
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
