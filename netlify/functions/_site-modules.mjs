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
    paths.push('/forum.html');
  }

  return paths;
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
