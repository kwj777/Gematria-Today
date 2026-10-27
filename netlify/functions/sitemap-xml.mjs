import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getSqlClient } from './_admin.mjs';
import { buildCacheKey, withCachedJson, withTimeBudget } from './_security.mjs';
import {
  buildModulePublicPaths,
  DEFAULT_SITE_MODULES,
  DEFAULT_SITE_ORIGIN,
  loadPublicSiteSettings,
  normalizeSiteModules,
} from './_site-modules.mjs';

// Well under Netlify's synchronous function timeout.
export const DATABASE_TIME_BUDGET_MS = 3000;

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
  '/bible-names-gematria.html',
  '/what-is-gematria.html',
  '/gematria-cipher-chart.html',
  '/hebrew-gematria-chart.html',
  '/666-gematria.html',
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

// /sitemap.xml is served by this function (the rewrite is forced), but the
// tracked sitemap.xml is still where each page's <lastmod> is kept:
// scripts/update-sitemap-lastmod.mjs derives it from commit history and lint
// fails when it drifts. netlify.toml bundles the file with this function.
export function parseLastmods(xml = '') {
  const lastmods = new Map();
  for (const [, inner] of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = inner.match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1];
    const lastmod = inner.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1];
    if (!loc || !lastmod) continue;
    try {
      lastmods.set(new URL(loc).pathname, lastmod);
    } catch {
      // Not an absolute URL; nothing to key it by.
    }
  }
  return lastmods;
}

export function loadTrackedLastmods() {
  for (const base of [process.cwd(), join(process.cwd(), '..'), '/var/task']) {
    try {
      return parseLastmods(readFileSync(join(base, 'sitemap.xml'), 'utf8'));
    } catch {
      // Try the next location.
    }
  }
  return new Map();
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

export function buildSitemapXml({ siteOrigin, modules, posts = [], lastmods = new Map() }) {
  // A sitemap lists pages. The blog RSS feed is a module path too (robots.txt
  // needs it), but it is not a page to index.
  const modulePaths = buildModulePublicPaths(modules).filter((path) => !path.endsWith('.xml'));
  const allPaths = Array.from(new Set([...STATIC_PATHS, ...modulePaths]));
  const postEntries = normalizeSiteModules(modules).blog ? buildBlogPostPaths(posts) : [];
  const entries = [
    ...allPaths.map((path) => toUrlEntry(siteOrigin, path, lastmods.get(path))),
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
    // Crawlers fetch this cold, often on a fresh instance. It needs only the
    // module switches, so it skips the admin schema and bootstrap work other
    // endpoints do on a cold start, and a database slower than the budget
    // gets the default output below rather than a gateway timeout.
    const sql = getSqlClient();
    const cacheResult = await withTimeBudget(withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'sitemap-xml' }),
      route: 'sitemap-xml',
      ttlSeconds: 300,
      compute: async () => {
        // Only the module switches come from the database; every <loc> is on
        // DEFAULT_SITE_ORIGIN, where each page's canonical points. The stored
        // public_site_url is the email link base and may name another host.
        const { modules } = await loadPublicSiteSettings(sql);
        const posts = modules?.blog === false ? [] : await loadSitemapPosts(sql);
        return {
          xml: buildSitemapXml({ siteOrigin: DEFAULT_SITE_ORIGIN, modules, posts, lastmods: loadTrackedLastmods() }),
        };
      },
    }), DATABASE_TIME_BUDGET_MS, 'sitemap-xml settings');

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
    // A database blip should not turn the sitemap into an error for whichever
    // crawler asks. Serve every page with the default modules -- what the
    // tracked sitemap.xml lists -- and retry the real settings shortly.
    console.error('sitemap-xml failed; serving the default sitemap', error);
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/xml; charset=UTF-8',
        'cache-control': 'public, max-age=60',
      },
      body: buildSitemapXml({
        siteOrigin: DEFAULT_SITE_ORIGIN,
        modules: DEFAULT_SITE_MODULES,
        lastmods: loadTrackedLastmods(),
      }),
    };
  }
}
