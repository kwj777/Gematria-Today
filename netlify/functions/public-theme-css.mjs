import { getSqlClient } from './_admin.mjs';
import { getOptionalAuthenticatedSession, parseCookies } from './_auth.mjs';
import { createHash } from 'node:crypto';

const BOOTSWATCH_IMPORT_PATTERN = /@import\s+url\((['"]?)(https:\/\/cdn\.jsdelivr\.net\/npm\/bootswatch@5\.3\.3\/dist\/[\w-]+\/bootstrap\.min\.css(?:\?[^'"\)]*)?)\1\)\s*;?/gi;
const GOOGLE_FONTS_IMPORT_PATTERN = /@import\s+url\((['"]?)https:\/\/fonts\.googleapis\.com\/[^'"\)]*\1\)\s*;?/gi;
const bootswatchCssCache = new Map();

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

async function fetchBootswatchCss(url) {
  if (bootswatchCssCache.has(url)) {
    return bootswatchCssCache.get(url);
  }

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Gematria public-theme-css' },
    });
    if (!response.ok) {
      return null;
    }

    const css = await response.text();
    bootswatchCssCache.set(url, css);
    return css;
  } catch {
    return null;
  }
}

async function resolveRemoteThemeImports(cssText) {
  const customCss = String(cssText || '').trim();
  if (!customCss) {
    return '';
  }

  const imports = [...customCss.matchAll(BOOTSWATCH_IMPORT_PATTERN)];
  if (!imports.length) {
    return customCss;
  }

  let resolvedCss = customCss;
  for (const match of imports) {
    const fullImport = match[0];
    const importUrl = match[2];
    const downloadedCss = await fetchBootswatchCss(importUrl);
    if (!downloadedCss) {
      continue;
    }

    const sanitizedCss = downloadedCss.replace(GOOGLE_FONTS_IMPORT_PATTERN, '').trim();
    resolvedCss = resolvedCss.replace(
      fullImport,
      `/* Inlined remote Bootswatch theme (${importUrl}) */\n${sanitizedCss}`,
    );
  }

  return resolvedCss;
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
      css = await resolveRemoteThemeImports(css);
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
