import { getSqlClient, jsonResponse } from './_admin.mjs';

const STATIC_CONTENT_SETTINGS_KEY = 'static_content_workspace';

function safeJsonParse(input, fallback = {}) {
  if (!input || typeof input !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

function normalizePageId(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) {
    return '';
  }
  const aliasToPageId = {
    '/': 'home',
    '/index': 'home',
    '/index.html': 'home',
    '/why-english-gematria': 'about',
    '/why-english-gematria.html': 'about',
    '/news': 'news',
    '/news.html': 'news',
    '/blog': 'blog',
    '/blog.html': 'blog',
    '/faq': 'faq',
    '/faq.html': 'faq',
    '/contact': 'contact',
    '/contact.html': 'contact',
    '/privacy': 'privacy',
    '/privacy.html': 'privacy',
    '/terms': 'terms',
    '/terms.html': 'terms',
  };

  if (aliasToPageId[value]) {
    return aliasToPageId[value];
  }

  return value.replace(/\.html$/, '');
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const pageParam = event.queryStringParameters?.page || '';
    const pageId = normalizePageId(pageParam);
    if (!pageId) {
      return jsonResponse(400, { error: 'page query parameter is required' });
    }

    const sql = getSqlClient();
    const rows = await sql`
      SELECT setting_value, updated_at
      FROM admin_settings
      WHERE setting_key = ${STATIC_CONTENT_SETTINGS_KEY}
      LIMIT 1
    `;

    const workspace = safeJsonParse(rows?.[0]?.setting_value, {});
    const pageContent = workspace?.pages?.[pageId] || {};

    return jsonResponse(200, {
      pageId,
      content: pageContent,
      updatedAt: rows?.[0]?.updated_at || null,
    });
  } catch (error) {
    console.error('public-static-content error', error);
    return jsonResponse(500, { error: 'Unable to load static content' });
  }
}
