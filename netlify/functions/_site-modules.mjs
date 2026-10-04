export const DEFAULT_SITE_MODULES = Object.freeze({
  forum: true,
  knowbot: true,
  gemabot: true,
  blog: true,
  membership: true,
  wordnik_wotd_slider: true,
  blog_home_slider: true,
  blog_home_featured_grid: true,
  google_analytics: false,
});

export const DEFAULT_SITE_ORIGIN = 'https://gematria.today';

export function normalizeSiteModules(rawValue = null) {
  if (!rawValue || typeof rawValue !== 'object') {
    return { ...DEFAULT_SITE_MODULES };
  }

  return Object.keys(DEFAULT_SITE_MODULES).reduce((result, moduleName) => {
    result[moduleName] = Object.hasOwn(rawValue, moduleName)
      ? Boolean(rawValue[moduleName])
      : DEFAULT_SITE_MODULES[moduleName];
    return result;
  }, {});
}

export function normalizePublicSiteOrigin(rawUrl = '') {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return DEFAULT_SITE_ORIGIN;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return DEFAULT_SITE_ORIGIN;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export function buildModulePublicPaths(modules = normalizeSiteModules()) {
  const normalizedModules = normalizeSiteModules(modules);
  const paths = [];

  if (normalizedModules.blog) {
    paths.push('/blog.html', '/blog.xml');
  }
  if (normalizedModules.membership) {
    paths.push('/member.html');
  }
  if (normalizedModules.gemabot) {
    paths.push('/ai-agent.html');
  }
  if (normalizedModules.knowbot) {
    paths.push('/searchbot.html');
  }
  if (normalizedModules.forum) {
    paths.push('/forum.html', '/forum-reputation-scale.html');
  }

  return paths;
}

// The module switches used to be cosmetic: they hid a few links on three pages
// while every API behind a switched-off module kept answering, so turning the
// forum off left POST /api/member-forum taking threads and turning membership
// off left signups and checkout running. Each module's endpoints now ask here
// first. A module is off only when an admin saved it off; anything unset stays
// on (DEFAULT_SITE_MODULES), so a deploy never switches a feature off by itself.
const SITE_MODULES_TTL_MS = 30_000;
let siteModulesCache = null;

const SITE_MODULE_UNAVAILABLE_MESSAGES = Object.freeze({
  forum: 'The forum is currently unavailable.',
  knowbot: 'SiteSeeker is currently unavailable.',
  gemabot: 'GemaBot is currently unavailable.',
  blog: 'The blog is currently unavailable.',
  membership: 'Membership sign-ups are currently closed.',
});

export function resetSiteModulesCache() {
  siteModulesCache = null;
}

// Read on every guarded request, so it is cached per function instance for a
// short while. A failed read keeps the last switches this instance saw, or the
// defaults on a cold instance: the guarded endpoint needs the same database
// and fails on its own if it is really down.
export async function loadSiteModules(sql, { now = Date.now() } = {}) {
  if (siteModulesCache && now - siteModulesCache.loadedAt < SITE_MODULES_TTL_MS) {
    return siteModulesCache.modules;
  }

  try {
    const rows = await sql`
      SELECT setting_value
      FROM admin_settings
      WHERE setting_key = 'site_modules'
      LIMIT 1
    `;
    let parsed = null;
    try {
      parsed = JSON.parse(rows[0]?.setting_value || 'null');
    } catch {
      parsed = null;
    }
    const modules = normalizeSiteModules(parsed);
    siteModulesCache = { modules, loadedAt: now };
    return modules;
  } catch (error) {
    console.warn('[site-modules] Could not read the module switches:', error?.message || error);
    return siteModulesCache ? siteModulesCache.modules : { ...DEFAULT_SITE_MODULES };
  }
}

export async function isSiteModuleEnabled(sql, moduleName) {
  const modules = await loadSiteModules(sql);
  return modules[moduleName] !== false;
}

export function createSiteModuleDisabledError(moduleName, message = '') {
  return Object.assign(
    new Error(message || SITE_MODULE_UNAVAILABLE_MESSAGES[moduleName] || 'This feature is currently unavailable.'),
    {
      statusCode: 404,
      code: 'module_disabled',
      module: moduleName,
      headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    },
  );
}

export async function assertSiteModuleEnabled(sql, moduleName, { message = '' } = {}) {
  if (!(await isSiteModuleEnabled(sql, moduleName))) {
    throw createSiteModuleDisabledError(moduleName, message);
  }
}

export async function loadPublicSiteSettings(sql) {
  const rows = await sql`
    SELECT setting_key, setting_value
    FROM admin_settings
    WHERE setting_key IN ('site_modules', 'public_site_url')
  `;

  let modules = { ...DEFAULT_SITE_MODULES };
  let siteOrigin = DEFAULT_SITE_ORIGIN;

  for (const row of rows) {
    if (row.setting_key === 'site_modules') {
      try {
        modules = normalizeSiteModules(JSON.parse(row.setting_value || '{}'));
      } catch {
        modules = { ...DEFAULT_SITE_MODULES };
      }
    }

    if (row.setting_key === 'public_site_url') {
      siteOrigin = normalizePublicSiteOrigin(row.setting_value || '');
    }
  }

  return { modules, siteOrigin };
}
