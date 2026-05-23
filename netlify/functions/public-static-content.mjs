import { jsonResponse } from './_admin.mjs';

export function normalizePageId(rawValue = '') {
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

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePagination(query = {}) {
  const offsetRaw = Number.parseInt(String(query.offset ?? '0'), 10);
  const limitRaw = Number.parseInt(String(query.limit ?? DEFAULT_LIMIT), 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT;
  return { offset, limit };
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const query = event.queryStringParameters || {};
    const pageParam = query.page || '';
    const pageId = normalizePageId(pageParam);
    if (!pageId) {
      return jsonResponse(400, { error: 'page query parameter is required' });
    }

    const { offset, limit } = parsePagination(query);

    return jsonResponse(200, {
      pageId,
      content: {},
      updatedAt: null,
      pagination: { offset, limit, total: 0 },
    });
  } catch (error) {
    console.error('public-static-content failed', error);
    return jsonResponse(error.statusCode || 500, {
      error: 'Failed to load static content',
    });
  }
}
