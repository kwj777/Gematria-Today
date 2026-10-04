import { ensureAdminSchema, getSqlClient, syncBootstrapAdminUser } from './_admin.mjs';
import { buildCacheKey, withCachedJson } from './_security.mjs';
import { DEFAULT_SITE_MODULES, DEFAULT_SITE_ORIGIN, loadPublicSiteSettings } from './_site-modules.mjs';

// The read-only content endpoints that public pages render from: blog posts and
// the blog index (public-posts), the FAQ (public-faqs), every page's theme
// stylesheet (public-theme-css) and badges (public-badge). Google's renderer
// will not fetch a URL robots.txt blocks, fetch/XHR included, so under a bare
// `Disallow: /api/` those pages render as their fallback or error state. The
// longer Allow wins over `Disallow: /api/` for Google and Bing.
export const BASE_ALLOWS = Object.freeze([
  '/api/public-',
]);

// account-recovery and premium-research are deliberately absent. Both carry
// <meta name="robots" content="noindex,..."> and are linked from indexable
// pages; a Disallow stops Google fetching them, so it never reads the noindex
// and can index the bare URL anyway ("Indexed, though blocked by robots.txt").
// Same reasoning as /definition -- see tests/search-index-gate.test.mjs.
export const BASE_DISALLOWS = Object.freeze([
  '/admin',
  '/admin.html',
  '/api/',
  '/.netlify/functions/',
]);

export function buildRobotsTxt({ siteOrigin, modules }) {
  const disabledModulePaths = [];

  if (modules.blog === false) {
    disabledModulePaths.push('/blog.html', '/blog.xml', '/blog/');
  }
  if (modules.membership === false) {
    disabledModulePaths.push('/member.html');
  }
  if (modules.gemabot === false) {
    disabledModulePaths.push('/ai-agent.html');
  }
  if (modules.knowbot === false) {
    disabledModulePaths.push('/searchbot.html');
  }
  if (modules.forum === false) {
    disabledModulePaths.push('/forum.html');
  }

  const allowLines = BASE_ALLOWS.map((path) => `Allow: ${path}`).join('\n');
  const disallowLines = Array.from(new Set([...BASE_DISALLOWS, ...disabledModulePaths]))
    .map((path) => `Disallow: ${path}`)
    .join('\n');

  return `User-agent: *\nAllow: /\n${allowLines}\n${disallowLines}\n\nSitemap: ${siteOrigin}/sitemap.xml\nSitemap: ${siteOrigin}/sitemap-words.xml\n`;
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
      cacheKey: buildCacheKey({ route: 'robots-txt' }),
      route: 'robots-txt',
      ttlSeconds: 300,
      compute: async () => {
        const settings = await loadPublicSiteSettings(sql);
        return { text: buildRobotsTxt(settings) };
      },
    });

    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/plain; charset=UTF-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=120',
        'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
      },
      body: cacheResult.payload.text,
    };
  } catch (error) {
    // Google reads a 5xx robots.txt as "disallow everything" and stops crawling
    // the site, so a database blip must not produce one. The defaults are what
    // the site serves with every module on -- the same text as the tracked
    // robots.txt -- and the short max-age picks up the real settings once the
    // database is back.
    console.error('robots-txt failed; serving the default rules', error);
    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/plain; charset=UTF-8',
        'cache-control': 'public, max-age=60',
      },
      body: buildRobotsTxt({ siteOrigin: DEFAULT_SITE_ORIGIN, modules: DEFAULT_SITE_MODULES }),
    };
  }
}
