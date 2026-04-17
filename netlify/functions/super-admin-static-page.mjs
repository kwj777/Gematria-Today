import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthenticatedUser } from './_admin.mjs';

const GUIDE_SUFFIX = '-site-adaptation-guide.html';
const ALLOWED_FILE_PATTERN = /^[a-z0-9-]+-site-adaptation-guide\.html$/;

let SECURE_GUIDE_DIR = null;
try {
  SECURE_GUIDE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../secure/site-adaptation-guides');
} catch {
  // import.meta.url may not resolve to a file path in all bundling environments;
  // fall back to process.cwd() which is the project root in Netlify dev
  SECURE_GUIDE_DIR = path.join(process.cwd(), 'secure', 'site-adaptation-guides');
}

function canAccessSiteAdaptationGuides(user) {
  if (!user || typeof user !== 'object') return false;
  const normalizedRole = String(user.role || '').trim().toLowerCase();
  return /^super[-_\s]?admins?$/.test(normalizedRole);
}

function hasAuthenticatedAdminSession(user) {
  return Boolean(user && typeof user === 'object');
}

async function resolveGuideFilePath(fileName) {
  const candidates = SECURE_GUIDE_DIR ? [SECURE_GUIDE_DIR] : [];
  const cwdDir = path.join(process.cwd(), 'secure', 'site-adaptation-guides');
  if (SECURE_GUIDE_DIR !== cwdDir) candidates.push(cwdDir);
  candidates.push(path.join(process.cwd(), '..', 'secure', 'site-adaptation-guides'));

  for (const dirPath of candidates) {
    try {
      const absolutePath = path.join(dirPath, fileName);
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) return absolutePath;
    } catch {
      // Ignore missing candidate files and continue checking fallbacks.
    }
  }

  return path.join(candidates[0] || cwdDir, fileName);
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

function hasNextRedirectAttemptMarker(event = {}) {
  const adminMarker = String(event?.queryStringParameters?.adminNextAttempted || '').trim();
  const legacyMarker = String(event?.queryStringParameters?.nextAttempted || '').trim();
  return adminMarker === '1' || legacyMarker === '1';
}

function buildUnauthenticatedRedirect(requestedFile, { nextRedirectAttempted = false } = {}) {
  const searchParams = new URLSearchParams({
    next: `/${requestedFile}`,
  });

  if (nextRedirectAttempted) {
    searchParams.set('nextAttempted', '1');
  }

  return `/admin?${searchParams.toString()}`;
}

function buildRedirectLoopGuardResponse() {
  return htmlResponse(
    401,
    '<!doctype html><title>Sign in required</title><p>Sign in required to open this guide. <a href="/admin">Go to admin sign-in</a>.</p>',
  );
}

export const __testUtils = {
  canAccessSiteAdaptationGuides,
  hasAuthenticatedAdminSession,
  resolveRequestedGuideFile,
  hasNextRedirectAttemptMarker,
  buildUnauthenticatedRedirect,
  buildRedirectLoopGuardResponse,
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
    if (hasAuthenticatedAdminSession(user)) {
      return htmlResponse(403, '<!doctype html><title>Forbidden</title><p>You are signed in, but your account cannot access this guide.</p>');
    }
    if (hasNextRedirectAttemptMarker(event)) {
      return buildRedirectLoopGuardResponse();
    }
    return {
      statusCode: 302,
      headers: {
        location: buildUnauthenticatedRedirect(requestedFile, {
          nextRedirectAttempted: false,
        }),
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
