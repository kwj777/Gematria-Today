import { getSqlClient } from './_admin.mjs';
import { getOptionalAuthenticatedSession } from './_auth.mjs';

function safeJsonParse(value, fallback = {}) {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function escapeCssComment(value = '') {
  return String(value || '').replaceAll('*/', '*\\/');
}

function normalizeThemeCatalog(input = {}) {
  const presets = Array.isArray(input?.presets) ? input.presets : [];
  const activeThemeSlug = String(input?.activeThemeSlug || 'default').trim().toLowerCase();
  return {
    activeThemeSlug,
    presets: presets
      .map((preset) => ({
        slug: String(preset?.slug || '').trim().toLowerCase(),
        name: String(preset?.name || '').trim(),
        variables: (preset?.variables && typeof preset.variables === 'object') ? preset.variables : {},
        customCss: String(preset?.customCss || '').trim(),
      }))
      .filter((preset) => preset.slug),
  };
}

function buildCss(catalog, { includeCustomCss = true } = {}) {
  const active = catalog.presets.find((preset) => preset.slug === catalog.activeThemeSlug);
  if (!active) {
    return '/* Active theme: default */\n';
  }

  const variableEntries = Object.entries(active.variables || {})
    .filter(([key, value]) => String(key).startsWith('--') && String(value).trim());
  const variablesBlock = variableEntries.length
    ? `:root {\n${variableEntries.map(([key, value]) => `  ${String(key).trim()}: ${String(value).trim()};`).join('\n')}\n}\n`
    : '';
  const customCss = includeCustomCss ? String(active.customCss || '').trim() : '';
  return [
    `/* Active theme: ${escapeCssComment(active.name || active.slug)} (${escapeCssComment(active.slug)}) */`,
    variablesBlock,
    customCss,
  ].filter(Boolean).join('\n');
}

function shouldIncludeCustomCss(event) {
  const referer = String(event?.headers?.referer || event?.headers?.Referer || '').trim();
  if (!referer) {
    return true;
  }

  try {
    const refererUrl = new URL(referer);
    return !refererUrl.pathname.startsWith('/admin');
  } catch {
    return true;
  }
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const sql = getSqlClient();
    const rows = await sql`
      SELECT setting_value
      , setting_key
      FROM admin_settings
      WHERE setting_key = 'theme_catalog'
        OR setting_key = 'private_theme_catalog'
    `;
    const settingMap = new Map(rows.map((row) => [row.setting_key, row.setting_value]));
    const session = await getOptionalAuthenticatedSession(event, { sql });
    const isSuperAdmin = session?.user?.role === 'super_admin';
    const catalog = isSuperAdmin
      ? normalizeThemeCatalog(safeJsonParse(settingMap.get('private_theme_catalog'), {}))
      : normalizeThemeCatalog(safeJsonParse(settingMap.get('theme_catalog'), {}));
    const css = buildCss(catalog, { includeCustomCss: shouldIncludeCustomCss(event) });
    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=120',
      },
      body: css,
    };
  } catch (error) {
    console.error('public-theme-css error', error);
    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: '/* Theme overrides unavailable */\n',
    };
  }
}
