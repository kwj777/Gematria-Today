import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuthenticatedUser } from './_admin.mjs';

const GUIDE_SUFFIX = '-site-adaptation-guide.html';
const ALLOWED_FILE_PATTERN = /^[a-z0-9-]+-site-adaptation-guide\.html$/;
const SECURE_GUIDE_ROOT = new URL('../../secure/site-adaptation-guides/', import.meta.url);

function resolveRequestedGuideFile(event = {}) {
  const rawPath = String(event?.path || event?.rawUrl || '').trim();
  const requestedFromPath = rawPath.split('/').pop() || '';
  const requestedFromQuery = String(event?.queryStringParameters?.file || '').trim();
  const candidate = (requestedFromQuery || requestedFromPath).toLowerCase();

  if (!candidate.endsWith(GUIDE_SUFFIX) || !ALLOWED_FILE_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
}

function htmlResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'no-store',
      ...headers,
    },
    body,
  };
}

export const __testUtils = {
  resolveRequestedGuideFile,
};

export async function handler(event) {
  if (String(event?.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const requestedFile = resolveRequestedGuideFile(event);
  if (!requestedFile) {
    return htmlResponse(404, '<!doctype html><title>Not found</title><p>Not found.</p>');
  }

  let user = null;
  try {
    ({ user } = await getAuthenticatedUser(event));
  } catch {
    user = null;
  }

  if (!user || user.role !== 'super_admin') {
    return {
      statusCode: 302,
      headers: {
        location: `/admin.html?next=${encodeURIComponent(`/${requestedFile}`)}`,
        'cache-control': 'no-store',
      },
      body: '',
    };
  }

  const absoluteFilePath = path.join(path.fileURLToPath(SECURE_GUIDE_ROOT), requestedFile);
  let content = '';
  try {
    content = await fs.readFile(absoluteFilePath, 'utf8');
  } catch {
    return htmlResponse(404, '<!doctype html><title>Not found</title><p>Not found.</p>');
  }

  return htmlResponse(200, content, {
    'x-robots-tag': 'noindex, nofollow, noarchive',
  });
}
