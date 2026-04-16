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

async function resolveGuideDirectory() {
  const candidateDirectories = [
    fileURLToPath(SECURE_GUIDE_ROOT),
    path.join(process.cwd(), 'secure', 'site-adaptation-guides'),
    path.join(process.cwd(), '..', 'secure', 'site-adaptation-guides'),
  ];

  for (const directoryPath of candidateDirectories) {
    try {
      const stat = await fs.stat(directoryPath);
      if (stat.isDirectory()) return directoryPath;
    } catch {
      // Ignore missing candidate paths and continue checking fallbacks.
    }
  }

  return candidateDirectories[0];
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
