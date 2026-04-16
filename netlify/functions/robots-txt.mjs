import { ensureAdminSchema, getSqlClient, syncBootstrapAdminUser } from './_admin.mjs';
import { buildCacheKey, withCachedJson } from './_security.mjs';
import { loadPublicSiteSettings } from './_site-modules.mjs';

const BASE_DISALLOWS = Object.freeze([
  '/admin',
  '/admin.html',
  '/account-recovery',
  '/account-recovery.html',
  '/premium-research',
  '/premium-research.html',
  '/api/',
  '/.netlify/functions/',
]);

function buildRobotsTxt({ siteOrigin, modules }) {
  const disabledModulePaths = [];

  if (modules.blog === false) {
    disabledModulePaths.push('/blog.html', '/blog.xml', '/blog/');
  }
  if (modules.news === false) {
    disabledModulePaths.push('/news.html');
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

  const disallowLines = Array.from(new Set([...BASE_DISALLOWS, ...disabledModulePaths]))
    .map((path) => `Disallow: ${path}`)
    .join('\n');

  return `User-agent: *\nAllow: /\n${disallowLines}\n\nSitemap: ${siteOrigin}/sitemap.xml\n`;
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
    return {
      statusCode: error.statusCode || 500,
      headers: { 'content-type': 'text/plain; charset=UTF-8' },
      body: error.message || 'Failed to generate robots.txt',
    };
  }
}
