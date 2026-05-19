import { getSqlClient } from './_admin.mjs';
import { getOptionalAuthenticatedSession, parseCookies } from './_auth.mjs';
import { createHash } from 'node:crypto';

const BOOTSWATCH_IMPORT_PATTERN = /@import\s+url\((['"]?)https:\/\/cdn\.jsdelivr\.net\/npm\/bootswatch@5\.3\.3\/dist\/[\w-]+\/bootstrap\.min\.css(?:\?[^'"\)]*)?\1\)\s*;?/gi;


const BASE_BOOTSTRAP_THEME_CSS = `/* Base Bootstrap theme tokens */
:root {
  --bs-primary: #355f8c;
  --bs-primary-rgb: 53,95,140;
  --bs-secondary: #9a958b;
  --bs-secondary-rgb: 154,149,139;
  --bs-success: #97c93c;
  --bs-success-rgb: 151,201,60;
  --bs-info: #33a1d6;
  --bs-info-rgb: 51,161,214;
  --bs-warning: #ff7c35;
  --bs-warning-rgb: 255,124,53;
  --bs-danger: #dc4f4a;
  --bs-danger-rgb: 220,79,74;
  --bs-light: #f8f5ef;
  --bs-light-rgb: 248,245,239;
  --bs-dark: #3f403a;
  --bs-dark-rgb: 63,64,58;
  --app-cream: #f8f5ef;
  --app-ink: #35414f;
  --app-muted: #6d7278;
}

body {
  min-height: 100vh;
  color: var(--app-ink);
  background: linear-gradient(180deg, #fcfbf8 0%, #f2efe8 100%);
}

:root[data-bs-theme="dark"] body {
  color: #e6ebf2;
  background: linear-gradient(180deg, #161c24 0%, #10151d 100%);
}`;


export function safeJsonParse(value, fallback = {}) {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function escapeCssComment(value = '') {
  return String(value || '').replaceAll('*/', '*\\/');
}

export function normalizeThemeCatalog(input = {}) {
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

export function buildCss(catalog, { includeCustomCss = true } = {}) {
  const active = catalog.presets.find((preset) => preset.slug === catalog.activeThemeSlug);
  if (!active) {
    return `${BASE_BOOTSTRAP_THEME_CSS}\n`;
  }

  const variableEntries = Object.entries(active.variables || {})
    .filter(([key, value]) => String(key).startsWith('--') && String(value).trim());
  const variablesBlock = variableEntries.length
    ? `:root {\n${variableEntries.map(([key, value]) => `  ${String(key).trim()}: ${String(value).trim()};`).join('\n')}\n}\n`
    : '';
  const customCss = includeCustomCss ? String(active.customCss || '').trim() : '';
  return [
    BASE_BOOTSTRAP_THEME_CSS,
    `/* Active theme: ${escapeCssComment(active.name || active.slug)} (${escapeCssComment(active.slug)}) */`,
    variablesBlock,
    customCss,
  ].filter(Boolean).join('\n');
}

export function stripBootswatchImports(cssText) {
  return String(cssText || '').replace(
    BOOTSWATCH_IMPORT_PATTERN,
    '/* Bootswatch @import stripped; use --bs-* variable overrides instead. */',
  );
}

export function shouldIncludeCustomCss(event) {
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
    const cookies = parseCookies(event);
    const privatePreviewEnabled = cookies.private_theme_preview === '1';
    const isSuperAdmin = session?.user?.role === 'super_admin';
    const usingPrivatePreview = isSuperAdmin && privatePreviewEnabled;
    const catalog = usingPrivatePreview
      ? normalizeThemeCatalog(safeJsonParse(settingMap.get('private_theme_catalog'), {}))
      : normalizeThemeCatalog(safeJsonParse(settingMap.get('theme_catalog'), {}));
    const includeCustomCss = shouldIncludeCustomCss(event);
    let css = buildCss(catalog, { includeCustomCss });
    if (includeCustomCss) {
      css = stripBootswatchImports(css);
    }
    const etag = `"${createHash('sha1').update(css).digest('hex')}"`;
    const ifNoneMatch = String(event?.headers?.['if-none-match'] || event?.headers?.['If-None-Match'] || '').trim();
    if (!usingPrivatePreview && ifNoneMatch === etag) {
      return {
        statusCode: 304,
        headers: {
          etag,
          'cache-control': 'public, max-age=300, stale-while-revalidate=120',
        },
      };
    }

    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': usingPrivatePreview
          ? 'private, no-store'
          : 'public, max-age=300, stale-while-revalidate=120',
        vary: 'Cookie',
        etag,
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
