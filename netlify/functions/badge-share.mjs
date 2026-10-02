import { getSqlClient } from './_member.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp } from './_security.mjs';
import { ensureBadgeSchema, findBadgeHolderByUsername, getBadgeDefinition, LEARNING_PATH_BADGE_SLUG } from './_badges.mjs';

const SITE_ORIGIN = 'https://gematria.today';
const OGP_IMAGE_WIDTH = 1200;
const OGP_IMAGE_FORMAT = 'jpg';
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toShareImageUrl(svgPath) {
  const absoluteUrl = svgPath.startsWith('http') ? svgPath : `${SITE_ORIGIN}${svgPath}`;
  const encodedSource = encodeURIComponent(absoluteUrl);
  return `${SITE_ORIGIN}/.netlify/images?url=${encodedSource}&w=${OGP_IMAGE_WIDTH}&fm=${OGP_IMAGE_FORMAT}`;
}

function buildHtml({ username, displayName, earnedAt }) {
  const safeUser = encodeURIComponent(username);
  const appUrl = `${SITE_ORIGIN}/badge.html?u=${safeUser}`;
  const canonicalUrl = `${SITE_ORIGIN}/b/${safeUser}`;
  const imageUrl = toShareImageUrl(`/.netlify/functions/badge-share-image?user=${safeUser}`);
  const title = `${displayName} earned the Beginner Path Graduate badge`;
  const description = `${displayName} completed the four-level beginner learning path on Gematria.Today${earnedAt ? ` on ${earnedAt}` : ''}.`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Gematria.Today</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

    <meta property="og:site_name" content="Gematria.Today" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(title)}" />

    <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}" />
    <script>window.location.replace(${JSON.stringify(appUrl)});</script>
  </head>
  <body>
    <main>
      <p>Redirecting to <a href="${escapeHtml(appUrl)}">${escapeHtml(title)}</a>…</p>
    </main>
  </body>
</html>`;
}

function buildNotFoundHtml(username) {
  const safe = escapeHtml(username || 'this user');
  const appUrl = `${SITE_ORIGIN}/badge.html?u=${encodeURIComponent(username || '')}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Badge not found | Gematria.Today</title>
    <meta name="robots" content="noindex, nofollow" />
    <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}" />
    <script>window.location.replace(${JSON.stringify(appUrl)});</script>
  </head>
  <body>
    <main>
      <p>No Beginner Path Graduate badge found for ${safe}. <a href="/gematria-basics.html">Start the learning path</a>.</p>
    </main>
  </body>
</html>`;
}

function extractUsername(event) {
  const params = event.queryStringParameters || {};
  const explicit = String(params.user || params.u || '').trim();
  if (explicit) return explicit;
  // Netlify rewrites /b/:username -> this function with rawPath /b/<name>
  const rawPath = String(event.rawPath || event.path || '');
  const match = rawPath.match(/\/b\/([^/?#]+)/i);
  if (match) {
    try { return decodeURIComponent(match[1]).trim(); } catch { return match[1].trim(); }
  }
  return '';
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { allow: 'GET' }, body: 'Method not allowed' };
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'badge-share' });

    const username = extractUsername(event);
    const slug = LEARNING_PATH_BADGE_SLUG;
    if (!username || !USERNAME_PATTERN.test(username) || !getBadgeDefinition(slug)) {
      return {
        statusCode: 302,
        headers: { location: '/gematria-basics.html' },
        body: '',
      };
    }

    const sql = getSqlClient();
    await applyRateLimit(sql, event, {
      scope: 'badge-share-ip',
      key: getClientIp(event),
      limit: 60,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many badge share lookups.',
    });
    await ensureBadgeSchema(sql);

    const row = await findBadgeHolderByUsername(sql, username, slug);

    if (!row) {
      return {
        statusCode: 404,
        headers: {
          'content-type': 'text/html; charset=UTF-8',
          'x-robots-tag': 'noindex, nofollow',
          'cache-control': 'public, max-age=60',
        },
        body: buildNotFoundHtml(username),
      };
    }

    const displayName = String(row.display_name || row.username);
    const earnedAt = row.earned_at
      ? new Date(row.earned_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';

    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=120',
      },
      body: buildHtml({ username: row.username, displayName, earnedAt }),
    };
  } catch (error) {
    return {
      statusCode: 302,
      headers: { location: '/gematria-basics.html' },
      body: '',
    };
  }
}
