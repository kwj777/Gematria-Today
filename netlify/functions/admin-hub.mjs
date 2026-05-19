/**
 * admin-hub.mjs — Hub-side API for the multi-site admin hub
 *
 * This function runs on the designated "hub" site.  It lets an authenticated
 * super admin:
 *   GET  /api/admin-hub              — list registered spoke sites (no secrets exposed)
 *   POST /api/admin-hub              — manage sites or generate a one-time login URL
 *
 * POST body shapes:
 *   { action: 'generate-token', siteId: '<id>' }
 *     → returns { loginUrl, expiresInSeconds }
 *
 *   { action: 'save-sites', sites: [ { id, name, url, sharedSecret } ] }
 *     → saves the site registry to admin_settings
 *
 * Hub sites are stored in admin_settings under the key 'hub_sites' as a JSON
 * array of { id, name, url, sharedSecret }.  Secrets are never returned to the
 * client — only id, name, and url are exposed.
 *
 * Token format written by this function and consumed by hub-login.mjs on each spoke:
 *   <base64url(JSON payload)>.<hex HMAC-SHA256 signature>
 *   Payload: { userId, ts (unix ms), nonce (hex) }
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureAdminSchema,
  getAuthenticatedUser,
  jsonResponse,
  parseBody,
  routeByHttpMethod,
  syncBootstrapAdminUser,
  upsertSetting,
} from './_admin.mjs';
import { getSqlClient } from './_auth.mjs';

const HUB_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Adaptation guide helpers
// ---------------------------------------------------------------------------

const GUIDE_SUFFIX = '-site-adaptation-guide.html';
const ALLOWED_GUIDE_PATTERN = /^[a-z0-9-]+-site-adaptation-guide\.html$/;

let SECURE_GUIDE_DIR = null;
try {
  SECURE_GUIDE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../secure/site-adaptation-guides');
} catch {
  SECURE_GUIDE_DIR = path.join(process.cwd(), 'secure', 'site-adaptation-guides');
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
      // ignore missing candidate paths
    }
  }
  return candidates[0] || cwdDir;
}

export function guideDisplayName(fileName) {
  return String(fileName || '')
    .replace(/\.html$/, '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function normalizeGuideName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/(-site-adaptation-guide)(?:\.html)+$/, '$1.html');
}

async function handleGuideIndex() {
  const dir = await resolveGuideDirectory();
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const guides = entries
    .filter((e) => e.isFile())
    .map((e) => e.name.toLowerCase())
    .filter((n) => n.endsWith(GUIDE_SUFFIX) && ALLOWED_GUIDE_PATTERN.test(n))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({ file, displayName: guideDisplayName(file) }));
  return jsonResponse(200, { guides });
}

async function handleGuideContent(rawFile) {
  const file = normalizeGuideName(rawFile);
  if (!file || !ALLOWED_GUIDE_PATTERN.test(file)) {
    return jsonResponse(400, { error: 'Invalid guide file name' });
  }
  const dir = await resolveGuideDirectory();
  const absolutePath = path.join(dir, file);
  let content = '';
  try {
    content = await fs.readFile(absolutePath, 'utf8');
  } catch {
    return jsonResponse(404, { error: 'Guide not found' });
  }
  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
    body: content,
  };
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

export function generateHubToken(userId, sharedSecret) {
  const payload = {
    userId: String(userId),
    ts: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sharedSecret).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}


export function generateSharedSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export function normalizeSiteUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

export function getRequestOrigin(event) {
  const fromRawUrl = String(event?.rawUrl || '').trim();
  if (fromRawUrl) {
    try {
      return normalizeSiteUrl(new URL(fromRawUrl).origin);
    } catch {
      // ignore malformed rawUrl and continue fallback chain
    }
  }

  const forwardedProto = String(event?.headers?.['x-forwarded-proto'] || '').trim();
  const forwardedHost = String(event?.headers?.['x-forwarded-host'] || event?.headers?.host || '').trim();
  if (forwardedProto && forwardedHost) {
    return normalizeSiteUrl(`${forwardedProto}://${forwardedHost}`);
  }

  return normalizeSiteUrl(process.env.URL || '');
}

async function upsertNetlifySiteEnvVar(siteId, key, value) {
  const token = String(process.env.NETLIFY_API_TOKEN || '').trim();
  if (!token) {
    throw Object.assign(new Error('NETLIFY_API_TOKEN is not configured on the hub site'), { statusCode: 503 });
  }

  const envPayload = {
    values: [{ value: String(value), context: 'all' }],
    is_secret: true,
  };

  const request = async (path, options = {}) => {
    const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  };

  const listResult = await request(`/sites/${encodeURIComponent(siteId)}/env`);
  if (!listResult.ok) {
    const message = listResult.payload?.message || 'Unable to read env vars from Netlify';
    throw Object.assign(new Error(message), { statusCode: listResult.status || 502 });
  }
  const envVars = Array.isArray(listResult.payload) ? listResult.payload : [];
  const existingVar = envVars.find((item) => String(item?.key || '').trim() === key);

  if (existingVar?.id) {
    const patchResult = await request(`/sites/${encodeURIComponent(siteId)}/env/${encodeURIComponent(existingVar.id)}`, {
      method: 'PATCH',
      body: envPayload,
    });
    if (patchResult.ok) return;
    const message = patchResult.payload?.message || 'Unable to update env var in Netlify';
    throw Object.assign(new Error(message), { statusCode: patchResult.status || 502 });
  }

  const postResult = await request(`/sites/${encodeURIComponent(siteId)}/env`, {
    method: 'POST',
    body: {
      key,
      ...envPayload,
    },
  });
  if (postResult.ok) return;

  const message = postResult.payload?.message || 'Unable to save env var in Netlify';
  throw Object.assign(new Error(message), { statusCode: postResult.status || 502 });
}

// ---------------------------------------------------------------------------
// Site registry helpers
// ---------------------------------------------------------------------------

async function getHubSites(sql) {
  const rows = await sql`
    SELECT setting_value FROM admin_settings WHERE setting_key = 'hub_sites' LIMIT 1
  `;
  if (!rows.length || !rows[0].setting_value) return [];
  try {
    const parsed = JSON.parse(rows[0].setting_value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function findSiteByOrigin(sites, origin) {
  const normalizedOrigin = normalizeSiteUrl(origin).toLowerCase();
  if (!normalizedOrigin) return null;
  return sites.find((site) => normalizeSiteUrl(site?.url).toLowerCase() === normalizedOrigin) || null;
}

/**
 * Validate and normalise the incoming sites array.
 * existingSites is the current DB value so we can resolve the '__keep__' sentinel:
 * when the client omits the secret for an existing site it sends '__keep__' instead
 * of re-transmitting the secret value (which is never exposed to the browser).
 */
export function validateSites(raw, existingSites = []) {
  if (!Array.isArray(raw)) throw Object.assign(new Error('sites must be an array'), { statusCode: 400 });

  return raw.map((site, i) => {
    const id = String(site.id || '').trim();
    const name = String(site.name || '').trim();
    const url = String(site.url || '').trim();
    let sharedSecret = String(site.sharedSecret || '').trim();
    const netlifySiteId = String(site.netlifySiteId || '').trim();

    if (!id) throw Object.assign(new Error(`Site at index ${i} is missing an id`), { statusCode: 400 });
    if (!name) throw Object.assign(new Error(`Site "${id}" is missing a name`), { statusCode: 400 });
    if (!url || !/^https?:\/\/.+/.test(url)) throw Object.assign(new Error(`Site "${id}" has an invalid url`), { statusCode: 400 });

    if (sharedSecret === '__keep__') {
      const existing = existingSites.find((s) => s.id === id);
      sharedSecret = existing ? existing.sharedSecret : '';
    }

    if (!sharedSecret) throw Object.assign(new Error(`Site "${id}" is missing a sharedSecret`), { statusCode: 400 });

    return { id, name, url: url.replace(/\/$/, ''), sharedSecret, netlifySiteId };
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleGet(sql, _user, event) {
  const action = String(event?.queryStringParameters?.action || '').trim();

  if (action === 'guide-index') return handleGuideIndex();

  if (action === 'guide-content') {
    const file = String(event?.queryStringParameters?.file || '').trim();
    return handleGuideContent(file);
  }

  const sites = await getHubSites(sql);
  return jsonResponse(200, {
    sites: sites.map(({ id, name, url, netlifySiteId }) => ({ id, name, url, netlifySiteId: netlifySiteId || '' })),
  });
}

async function handlePost(sql, user, event) {
  const body = parseBody(event);
  const action = String(body.action || '').trim();

  if (action === 'generate-token') {
    const siteId = String(body.siteId || '').trim();
    if (!siteId) return jsonResponse(400, { error: 'siteId is required' });

    const sites = await getHubSites(sql);
    const site = sites.find((s) => s.id === siteId);
    if (!site) return jsonResponse(404, { error: 'Site not found' });

    const token = generateHubToken(user.id, site.sharedSecret);
    const loginUrl = `${site.url}/api/hub-login?token=${encodeURIComponent(token)}`;

    return jsonResponse(200, {
      loginUrl,
      expiresInSeconds: Math.floor(HUB_TOKEN_TTL_MS / 1000),
    });
  }

  if (action === 'generate-shared-secret') {
    const sites = await getHubSites(sql);
    const requestedSiteId = String(body.siteId || '').trim();
    const requestOrigin = getRequestOrigin(event);
    const runtimeSiteId = String(process.env.SITE_ID || '').trim();
    const runtimeSiteName = String(process.env.SITE_NAME || '').trim();

    let siteIndex = requestedSiteId ? sites.findIndex((site) => site.id === requestedSiteId) : -1;
    if (siteIndex === -1) {
      const siteByOrigin = findSiteByOrigin(sites, requestOrigin);
      if (siteByOrigin) {
        siteIndex = sites.findIndex((site) => site.id === siteByOrigin.id);
      }
    }

    if (siteIndex === -1) {
      if (!runtimeSiteId || !requestOrigin) {
        return jsonResponse(404, { error: 'Site not found. Save this site in the hub list first.' });
      }

      const inferredSiteId = requestedSiteId || runtimeSiteId;
      const inferredSiteName = runtimeSiteName || requestedSiteId || requestOrigin;
      sites.push({
        id: inferredSiteId,
        name: inferredSiteName,
        url: requestOrigin,
        sharedSecret: '',
        netlifySiteId: runtimeSiteId,
      });
      siteIndex = sites.length - 1;
    }

    const existingSite = sites[siteIndex] || {};
    const netlifySiteId = String(existingSite.netlifySiteId || runtimeSiteId).trim();
    if (!netlifySiteId) {
      return jsonResponse(400, { error: 'This site is missing Netlify Site ID. Save one first, then try again.' });
    }

    const sharedSecret = generateSharedSecret();
    let netlifySync = { saved: true };
    try {
      await upsertNetlifySiteEnvVar(netlifySiteId, 'HUB_SHARED_SECRET', sharedSecret);
    } catch (error) {
      netlifySync = {
        saved: false,
        error: error?.message || 'Unable to store HUB_SHARED_SECRET in Netlify automatically',
        statusCode: error?.statusCode || 502,
      };
    }

    const nextSites = [...sites];
    nextSites[siteIndex] = {
      ...existingSite,
      url: normalizeSiteUrl(existingSite.url || requestOrigin),
      netlifySiteId,
      sharedSecret,
    };
    await upsertSetting(sql, 'hub_sites', JSON.stringify(nextSites), user.id);

    return jsonResponse(200, {
      saved: true,
      site: {
        id: nextSites[siteIndex]?.id,
        name: nextSites[siteIndex]?.name,
        url: nextSites[siteIndex]?.url,
        netlifySiteId,
      },
      sharedSecret,
      netlifySync,
    });
  }

  if (action === 'save-sites') {
    const existingSites = await getHubSites(sql);
    const sites = validateSites(body.sites, existingSites);
    await upsertSetting(sql, 'hub_sites', JSON.stringify(sites), user.id);
    return jsonResponse(200, {
      saved: true,
      sites: sites.map(({ id, name, url, netlifySiteId }) => ({ id, name, url, netlifySiteId: netlifySiteId || '' })),
    });
  }

  return jsonResponse(400, { error: `Unknown action: ${action}` });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handler(event) {
  try {
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);

    // Require an authenticated admin (super_admin has is_admin=TRUE so this passes)
    const { user } = await getAuthenticatedUser(event);

    // The hub features are restricted to super_admin only
    if (user.role !== 'super_admin') {
      return jsonResponse(403, { error: 'Hub management requires super admin access' });
    }

    return routeByHttpMethod(event, {
      GET: () => handleGet(sql, user, event),
      POST: () => handlePost(sql, user, event),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Internal server error' });
  }
}
