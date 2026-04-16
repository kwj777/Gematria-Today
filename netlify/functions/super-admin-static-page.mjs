import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthenticatedUser } from './_admin.mjs';

const GUIDE_SUFFIX = '-site-adaptation-guide.html';
const ALLOWED_FILE_PATTERN = /^[a-z0-9-]+-site-adaptation-guide\.html$/;
const SECURE_GUIDE_ROOT = new URL('../../secure/site-adaptation-guides/', import.meta.url);

function canAccessSiteAdaptationGuides(user) {
  if (!user || typeof user !== 'object') return false;
  return user.role === 'super_admin' || user.role === 'admin' || user.isAdmin === true;
}

async function resolveGuideFilePath(fileName) {
  const candidateDirectories = [
    fileURLToPath(SECURE_GUIDE_ROOT),
    path.join(process.cwd(), 'secure', 'site-adaptation-guides'),
    path.join(process.cwd(), '..', 'secure', 'site-adaptation-guides'),
  ];

  for (const directoryPath of candidateDirectories) {
    try {
      const absolutePath = path.join(directoryPath, fileName);
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) return absolutePath;
    } catch {
      // Ignore missing candidate files and continue checking fallbacks.
    }
  }

  return path.join(candidateDirectories[0], fileName);
}

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
  canAccessSiteAdaptationGuides,
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

  if (!canAccessSiteAdaptationGuides(user)) {
    return {
      statusCode: 302,
      headers: {
        location: `/admin.html?next=${encodeURIComponent(`/${requestedFile}`)}`,
        'cache-control': 'no-store',
      },
      body: '',
    };
  }

  const absoluteFilePath = await resolveGuideFilePath(requestedFile);
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
