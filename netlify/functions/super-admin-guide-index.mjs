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
  return user.role === 'super_admin';
}

async function resolveGuideDirectory() {
  const candidates = SECURE_GUIDE_DIR ? [SECURE_GUIDE_DIR] : [];
  const cwdDir = path.join(process.cwd(), 'secure', 'site-adaptation-guides');
  if (SECURE_GUIDE_DIR !== cwdDir) candidates.push(cwdDir);
  candidates.push(path.join(process.cwd(), '..', 'secure', 'site-adaptation-guides'));

  for (const dirPath of candidates) {
    try {
      const stat = await fs.stat(dirPath);
      if (stat.isDirectory()) return dirPath;
    } catch {
      // Ignore missing candidate paths and continue checking fallbacks.
    }
  }

  return candidates[0] || cwdDir;
}

function toDisplayName(fileName) {
  return String(fileName || '')
    .replace(/\.html$/, '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const __testUtils = {
  canAccessSiteAdaptationGuides,
  toDisplayName,
};

export async function handler(event) {
  if (String(event?.httpMethod || 'GET').toUpperCase() !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let user = null;
  try {
    ({ user } = await getAuthenticatedUser(event));
  } catch {
    user = null;
  }

  if (!canAccessSiteAdaptationGuides(user)) {
    return {
      statusCode: 403,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'cache-control': 'no-store',
      },
      body: JSON.stringify({ error: 'Forbidden' }),
    };
  }

  const secureDirPath = await resolveGuideDirectory();
  let entries = [];
  try {
    entries = await fs.readdir(secureDirPath, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const guides = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name.toLowerCase())
    .filter((name) => name.endsWith(GUIDE_SUFFIX) && ALLOWED_FILE_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({ file, displayName: toDisplayName(file) }));

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify({ guides }),
  };
}
