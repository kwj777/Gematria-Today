import { getAuthenticatedUser, jsonResponse, requireHttpMethod } from './_admin.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_DAY_WINDOWS = new Set([1, 7, 30, 60, 90, 365]);
const ALLOWED_HOUR_WINDOWS = new Set([1, 6, 12]);
const AUTOMATION_USER_AGENT_PATTERN = '(bot|crawler|spider|headless|lighthouse|netlify|pingdom|uptimerobot|statuscake|gtmetrix|pagespeed|chrome-lighthouse|curl|wget|axios|python-requests|node-fetch|node\\.js|nodejs|node/|undici|postman|insomnia|k6|playwright|puppeteer|httpclient)';
let SITE_PUBLIC_DIR = null;
try {
  SITE_PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
} catch {
  // import.meta.url may not resolve to a file path in all bundling environments;
  // fall back to process.cwd() which is the project root in netlify dev
  SITE_PUBLIC_DIR = path.resolve(process.cwd());
}
const EXCLUDED_REPORT_ROUTES = new Set(['/admin-click-tracking.html', '/unsupported-browser.html', '/offline.html']);

export function normalizePathname(value) {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  try {
    const parsed = new URL(raw, 'https://gematria.today');
    let pathname = parsed.pathname || '/';
    if (!pathname.startsWith('/')) pathname = `/${pathname}`;
    pathname = pathname.replace(/\/+/g, '/');
    return pathname;
  } catch {
    const cleaned = raw.split('?')[0].split('#')[0] || '/';
    return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  }
}

export function normalizeLinkDestination(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return '';
  const pathname = normalizePathname(raw);
  return pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
}

export function normalizeButtonIdentity(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
}

export function extractAttribute(tag, attributeName) {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  const match = tag.match(pattern);
  return match ? match[2].trim() : '';
}

export function stripHtml(rawText) {
  return String(rawText || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function collectTrackableElements() {
  // Public pages are authored in src/ and built into _site/ by Eleventy, so the
  // page sources bundled with this function live under src/. The bare roots are
  // kept as fallbacks for netlify dev and for any page still at the top level.
  const roots = SITE_PUBLIC_DIR ? [SITE_PUBLIC_DIR] : [];
  const cwdRoot = path.resolve(process.cwd());
  if (SITE_PUBLIC_DIR !== cwdRoot) roots.push(cwdRoot);
  const candidates = [...roots.map((dir) => path.join(dir, 'src')), ...roots];

  let files = null;
  let resolvedDir = null;
  for (const dir of candidates) {
    try {
      files = await fs.readdir(dir);
      resolvedDir = dir;
      break;
    } catch {
      // try next candidate
    }
  }
  if (!files || !resolvedDir) return [];

  const htmlFiles = files.filter((file) => file.endsWith('.html') && !file.startsWith('admin-') && !file.startsWith('member-'));
  const elements = [];

  for (const fileName of htmlFiles) {
    const fullPath = path.join(resolvedDir, fileName);
    const pagePath = normalizePathname(`/${fileName}`);
    if (EXCLUDED_REPORT_ROUTES.has(pagePath)) continue;
    let html = '';
    try {
      html = await fs.readFile(fullPath, 'utf8');
    } catch {
      continue;
    }

    const linkMatches = html.matchAll(/<a\b[^>]*href\s*=\s*(['"])(.*?)\1[^>]*>(.*?)<\/a>/gis);
    for (const match of linkMatches) {
      const tag = match[0];
      const href = String(match[2] || '').trim();
      const destination = normalizeLinkDestination(href);
      if (!destination) continue;
      const id = extractAttribute(tag, 'id');
      const ariaLabel = extractAttribute(tag, 'aria-label');
      const title = extractAttribute(tag, 'title');
      const text = stripHtml(match[3] || '');
      elements.push({
        pagePath,
        elementType: 'a',
        destination,
        descriptor: normalizeButtonIdentity(id || ariaLabel || title || text || href),
        label: text || ariaLabel || title || href,
      });
    }

    const buttonMatches = html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gis);
    for (const match of buttonMatches) {
      const attributes = String(match[1] || '');
      const id = extractAttribute(attributes, 'id');
      const ariaLabel = extractAttribute(attributes, 'aria-label');
      const title = extractAttribute(attributes, 'title');
      const text = stripHtml(match[2] || '');
      const descriptor = normalizeButtonIdentity(id || ariaLabel || title || text);
      if (!descriptor) continue;
      elements.push({
        pagePath,
        elementType: 'button',
        destination: '',
        descriptor,
        label: text || ariaLabel || title || id || 'button',
      });
    }
  }

  return elements;
}

export function buildNeverClickedElementsReport(clickRows, trackableElements) {
  const clickedLinks = new Set();
  const clickedButtons = new Set();

  clickRows.forEach((row) => {
    const pagePath = normalizePathname(row.page_path || row.route || '/');
    const elementType = String(row.element_type || '').trim().toLowerCase();
    const destination = normalizeLinkDestination(row.destination || row.element_link || '');
    const buttonIdentity = normalizeButtonIdentity(row.element_id || row.source || row.element_selector || '');

    if ((elementType === 'a' || destination) && destination) {
      clickedLinks.add(`${pagePath}|${destination}`);
    }

    if ((elementType === 'button' || elementType === 'input') && buttonIdentity) {
      clickedButtons.add(`${pagePath}|${buttonIdentity}`);
    }
  });

  return trackableElements.filter((element) => {
    if (element.elementType === 'a') {
      return !clickedLinks.has(`${element.pagePath}|${element.destination}`);
    }
    return !clickedButtons.has(`${element.pagePath}|${element.descriptor}`);
  });
}

export function normalizeDays(value) {
  const parsed = Number.parseInt(String(value ?? '30'), 10);
  if (!Number.isFinite(parsed) || !ALLOWED_DAY_WINDOWS.has(parsed)) {
    return 30;
  }
  return parsed;
}

export function normalizeHours(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || !ALLOWED_HOUR_WINDOWS.has(parsed)) {
    return null;
  }
  return parsed;
}

export function toIsoDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

export function formatWindowLabel({ days, hours }) {
  if (hours === 1) return 'Last 1 hour';
  if (hours === 6) return 'Last 6 hours';
  if (hours === 12) return 'Last 12 hours';
  if (days === 1) return 'Last 24 hours';
  if (days === 7) return 'Last 7 days';
  if (days === 30) return 'Last 30 days';
  if (days === 60) return 'Last 60 days';
  if (days === 90) return 'Last 90 days';
  if (days === 365) return 'Last 365 days';
  return `Last ${days} days`;
}

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'GET');
  if (methodError) return methodError;

  try {
    const url = new URL(event.rawUrl || `https://gematria.today${event.path}${event.rawQuery ? `?${event.rawQuery}` : ''}`);
    const hours = normalizeHours(url.searchParams.get('hours'));
    const days = hours ? null : normalizeDays(url.searchParams.get('days'));
    const windowInterval = hours ? `${hours} hours` : `${days} days`;
    const { sql, user } = await getAuthenticatedUser(event);

    const clickTrackingDetailRows = await sql`
      SELECT
        route,
        action,
        COALESCE(NULLIF(BTRIM(metadata->>'source'), ''), 'unknown') AS source,
        COALESCE(NULLIF(BTRIM(metadata->>'destination'), ''), '') AS destination,
        COALESCE(NULLIF(BTRIM(metadata->>'elementType'), ''), 'unknown') AS element_type,
        COALESCE(NULLIF(BTRIM(metadata->>'elementId'), ''), '') AS element_id,
        COALESCE(NULLIF(BTRIM(metadata->>'elementSelector'), ''), '') AS element_selector,
        COALESCE(NULLIF(BTRIM(metadata->>'elementLink'), ''), '') AS element_link,
        COALESCE(NULLIF(BTRIM(metadata->>'pagePath'), ''), route) AS page_path,
        COALESCE(NULLIF(BTRIM(metadata->>'pageUrl'), ''), '') AS page_url,
        COALESCE(NULLIF(BTRIM(metadata->>'referrer'), ''), '') AS referrer,
        CASE
          WHEN COALESCE(NULLIF(BTRIM(metadata->>'audienceType'), ''), '') = 'member' THEN 'member'
          WHEN COALESCE(NULLIF(BTRIM(metadata->>'memberId'), ''), '') <> '' THEN 'member'
          WHEN LOWER(COALESCE(NULLIF(BTRIM(metadata->>'authenticated'), ''), 'false')) = 'true' THEN 'member'
          ELSE 'visitor'
        END AS audience_type,
        COALESCE(NULLIF(BTRIM(metadata->>'visitorSessionId'), ''), '') AS visitor_session_id,
        request_fingerprint,
        created_at
      FROM request_audit_log
      WHERE created_at >= NOW() - ${windowInterval}::interval
        AND route NOT LIKE 'admin-%'
        AND route <> 'security-retention'
        AND outcome = 'success'
        AND (
          action ILIKE '%click%'
          OR action = 'image_download'
          OR metadata ? 'elementType'
          OR metadata ? 'href'
          OR metadata ? 'destination'
        )
        AND (
          COALESCE(metadata->>'clientType', '') = 'human'
          OR (
            COALESCE(metadata->>'clientType', '') = ''
            AND COALESCE(NULLIF(BTRIM(metadata->>'userAgent'), ''), '') <> ''
          )
        )
        AND COALESCE(metadata->>'userAgent', '') !~* ${AUTOMATION_USER_AGENT_PATTERN}
      ORDER BY created_at DESC
    `;
    const trackableElements = await collectTrackableElements();
    const neverClickedElements = buildNeverClickedElementsReport(clickTrackingDetailRows, trackableElements);

    return jsonResponse(200, {
      generatedAt: new Date().toISOString(),
      days: days || null,
      hours: hours || null,
      windowLabel: formatWindowLabel({ days, hours }),
      user,
      clickTrackingDetails: clickTrackingDetailRows.map((row) => ({
        route: row.route,
        action: row.action,
        source: row.source,
        destination: row.destination,
        elementType: row.element_type,
        elementId: row.element_id,
        elementSelector: row.element_selector,
        elementLink: row.element_link,
        pagePath: row.page_path,
        pageUrl: row.page_url,
        referrer: row.referrer,
        audienceType: row.audience_type === 'member' ? 'member' : 'visitor',
        visitorSessionId: row.visitor_session_id || null,
        fingerprint: row.request_fingerprint,
        createdAt: toIsoDate(row.created_at),
      })),
      neverClickedElements: neverClickedElements.map((item) => ({
        pagePath: item.pagePath,
        elementType: item.elementType,
        destination: item.destination,
        label: item.label,
      })),
    });
  } catch (error) {
    console.error('admin-click-tracking error', error);
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to load click tracking log.' }, error.headers || {});
  }
}
