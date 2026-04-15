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
// Token generation
// ---------------------------------------------------------------------------

function generateHubToken(userId, sharedSecret) {
  const payload = {
    userId: String(userId),
    ts: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sharedSecret).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
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

/**
 * Validate and normalise the incoming sites array.
 * existingSites is the current DB value so we can resolve the '__keep__' sentinel:
 * when the client omits the secret for an existing site it sends '__keep__' instead
 * of re-transmitting the secret value (which is never exposed to the browser).
 */
function validateSites(raw, existingSites = []) {
  if (!Array.isArray(raw)) throw Object.assign(new Error('sites must be an array'), { statusCode: 400 });

  return raw.map((site, i) => {
    const id = String(site.id || '').trim();
    const name = String(site.name || '').trim();
    const url = String(site.url || '').trim();
    let sharedSecret = String(site.sharedSecret || '').trim();

    if (!id) throw Object.assign(new Error(`Site at index ${i} is missing an id`), { statusCode: 400 });
    if (!name) throw Object.assign(new Error(`Site "${id}" is missing a name`), { statusCode: 400 });
    if (!url || !/^https?:\/\/.+/.test(url)) throw Object.assign(new Error(`Site "${id}" has an invalid url`), { statusCode: 400 });

    if (sharedSecret === '__keep__') {
      const existing = existingSites.find((s) => s.id === id);
      sharedSecret = existing ? existing.sharedSecret : '';
    }

    if (!sharedSecret) throw Object.assign(new Error(`Site "${id}" is missing a sharedSecret`), { statusCode: 400 });

    return { id, name, url: url.replace(/\/$/, ''), sharedSecret };
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleGet(sql, _user) {
  const sites = await getHubSites(sql);
  return jsonResponse(200, {
    sites: sites.map(({ id, name, url }) => ({ id, name, url })),
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

  if (action === 'save-sites') {
    const existingSites = await getHubSites(sql);
    const sites = validateSites(body.sites, existingSites);
    await upsertSetting(sql, 'hub_sites', JSON.stringify(sites), user.id);
    return jsonResponse(200, {
      saved: true,
      sites: sites.map(({ id, name, url }) => ({ id, name, url })),
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
      GET: () => handleGet(sql, user),
      POST: () => handlePost(sql, user, event),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Internal server error' });
  }
}
