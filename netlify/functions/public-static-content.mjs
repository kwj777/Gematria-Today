import { jsonResponse } from './_admin.mjs';

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
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const pageParam = event.queryStringParameters?.page || '';
  const pageId = normalizePageId(pageParam);
  if (!pageId) {
    return jsonResponse(400, { error: 'page query parameter is required' });
  }

  return jsonResponse(200, { pageId, content: {}, updatedAt: null });
}
