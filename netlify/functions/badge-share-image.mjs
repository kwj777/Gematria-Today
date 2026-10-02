import { getSqlClient } from './_member.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp } from './_security.mjs';
import { ensureBadgeSchema, findBadgeHolderByUsername, getBadgeDefinition, LEARNING_PATH_BADGE_SLUG } from './_badges.mjs';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatEarnedDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  try {
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return parsed.toISOString().slice(0, 10);
  }
}

function svgFor({ displayName, earnedDate }) {
  const nameLine = escapeXml(displayName.length > 32 ? `${displayName.slice(0, 31)}…` : displayName);
  const dateLine = earnedDate ? `<text x="600" y="552" fill="#cbd5e1" font-size="24" font-family="Inter, Arial, sans-serif" text-anchor="middle">Earned ${escapeXml(earnedDate)}</text>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d1a30"/>
      <stop offset="60%" stop-color="#1d3358"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="rgba(251,191,36,0.30)"/>
      <stop offset="100%" stop-color="rgba(251,191,36,0)"/>
    </radialGradient>
    <linearGradient id="ribbonL" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#16a34a"/>
      <stop offset="100%" stop-color="#065f46"/>
    </linearGradient>
    <linearGradient id="ribbonR" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#16a34a"/>
      <stop offset="100%" stop-color="#065f46"/>
    </linearGradient>
    <radialGradient id="medalCore" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fff7d6"/>
      <stop offset="55%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#b45309"/>
    </radialGradient>
    <linearGradient id="medalRing" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fde68a"/>
      <stop offset="55%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#92400e"/>
    </linearGradient>
  </defs>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bg)"/>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#glow)"/>
  <g transform="translate(252,80) scale(2.6)">
    <path d="M22 60 L10 110 L34 100 L42 80 Z" fill="url(#ribbonL)"/>
    <path d="M74 60 L86 110 L62 100 L54 80 Z" fill="url(#ribbonR)"/>
    <circle cx="48" cy="52" r="34" fill="url(#medalRing)"/>
    <circle cx="48" cy="52" r="27" fill="url(#medalCore)"/>
    <path d="M48 34 L52.6 47.2 L66.5 47.7 L55.4 56.1 L59.4 69.4 L48 61.6 L36.6 69.4 L40.6 56.1 L29.5 47.7 L43.4 47.2 Z" fill="#7c2d12" opacity="0.9"/>
  </g>
  <text x="600" y="438" fill="#fde68a" font-size="28" font-family="Inter, Arial, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="3">BEGINNER PATH GRADUATE</text>
  <text x="600" y="500" fill="#ffffff" font-size="56" font-family="Inter, Arial, sans-serif" font-weight="800" text-anchor="middle">${nameLine}</text>
  ${dateLine}
  <text x="600" y="600" fill="#fbbf24" font-size="22" font-family="Inter, Arial, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="2">gematria.today</text>
</svg>`;
}

function fallbackSvg() {
  return svgFor({ displayName: 'Beginner Path Graduate', earnedDate: '' });
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { allow: 'GET' }, body: 'Method not allowed' };
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'badge-share-image' });
    const params = event.queryStringParameters || {};
    const username = String(params.user || params.u || '').trim();
    const slug = String(params.slug || LEARNING_PATH_BADGE_SLUG).trim();

    if (!username || !USERNAME_PATTERN.test(username) || !getBadgeDefinition(slug)) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=600' },
        body: fallbackSvg(),
      };
    }

    const sql = getSqlClient();
    await applyRateLimit(sql, event, {
      scope: 'badge-share-image-ip',
      key: getClientIp(event),
      limit: 120,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many requests for badge images.',
    });
    await ensureBadgeSchema(sql);

    const row = await findBadgeHolderByUsername(sql, username, slug);
    if (!row) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
        body: fallbackSvg(),
      };
    }

    const displayName = String(row.display_name || row.username);
    const earnedDate = formatEarnedDate(row.earned_at);
    return {
      statusCode: 200,
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=600, stale-while-revalidate=120',
      },
      body: svgFor({ displayName, earnedDate }),
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=60' },
      body: fallbackSvg(),
    };
  }
}
