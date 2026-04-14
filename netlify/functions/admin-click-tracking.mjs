import { getAuthenticatedUser, jsonResponse, requireHttpMethod } from './_admin.mjs';

const ALLOWED_DAY_WINDOWS = new Set([1, 7, 30, 60, 90, 365]);
const ALLOWED_HOUR_WINDOWS = new Set([1, 6, 12]);
const AUTOMATION_USER_AGENT_PATTERN = '(bot|crawler|spider|headless|lighthouse|netlify|pingdom|uptimerobot|statuscake|gtmetrix|pagespeed|chrome-lighthouse|curl|wget|axios|python-requests|node-fetch|node\\.js|nodejs|node/|undici|postman|insomnia|k6|playwright|puppeteer|httpclient)';

function normalizeDays(value) {
  const parsed = Number.parseInt(String(value ?? '30'), 10);
  if (!Number.isFinite(parsed) || !ALLOWED_DAY_WINDOWS.has(parsed)) {
    return 30;
  }
  return parsed;
}

function normalizeHours(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || !ALLOWED_HOUR_WINDOWS.has(parsed)) {
    return null;
  }
  return parsed;
}

function toIsoDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function formatWindowLabel({ days, hours }) {
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
    const url = new URL(event.rawUrl || `https://endtimes.today${event.path}${event.rawQuery ? `?${event.rawQuery}` : ''}`);
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
        fingerprint: row.request_fingerprint,
        createdAt: toIsoDate(row.created_at),
      })),
    });
  } catch (error) {
    console.error('admin-click-tracking error', error);
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to load click tracking log.' }, error.headers || {});
  }
}
