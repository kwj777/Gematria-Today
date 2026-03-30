import { getAuthenticatedUser, jsonResponse, requireHttpMethod } from './_admin.mjs';
import { ensureMemberSchema } from './_member.mjs';

const ALLOWED_WINDOWS = new Set([1, 7, 30, 60, 90, 365]);
const SECURITY_PROBLEM_OUTCOMES = ['blocked', 'invalid_credentials'];
const TRAFFIC_SPIKE_WINDOW_MINUTES = 5;
const TRAFFIC_SPIKE_BASELINE_MINUTES = 60;
const MONITORED_ROUTE_CONFIG = [
  { route: 'member-login', apiPath: '/api/member-login', threshold: Number.parseInt(process.env.ALERT_MEMBER_LOGIN_SPIKE_5M || '40', 10) },
  { route: 'member-register', apiPath: '/api/member-register', threshold: Number.parseInt(process.env.ALERT_MEMBER_REGISTER_SPIKE_5M || '20', 10) },
  { route: 'public-feeds', apiPath: '/api/public-feeds', threshold: Number.parseInt(process.env.ALERT_PUBLIC_FEEDS_SPIKE_5M || '60', 10) },
  { route: 'wordnikDefinition', apiPath: '/definition', threshold: Number.parseInt(process.env.ALERT_WORDNIK_DEFINITION_SPIKE_5M || '120', 10) },
  { route: 'wordnikRelatedWords', apiPath: '/api/wordnikRelatedWords', threshold: Number.parseInt(process.env.ALERT_WORDNIK_RELATED_WORDS_SPIKE_5M || '80', 10) },
];

function normalizeDays(value) {
  const parsed = Number.parseInt(String(value ?? '30'), 10);
  if (!Number.isFinite(parsed) || !ALLOWED_WINDOWS.has(parsed)) {
    return 30;
  }
  return parsed;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildTrafficAlert(entry) {
  const threshold = toPositiveInteger(entry.threshold, 1);
  const currentFiveMinuteCount = Number(entry.currentFiveMinuteCount || 0);
  const priorWindowCount = Number(entry.priorWindowCount || 0);
  const baselineFiveMinuteCount = priorWindowCount / Math.max(1, ((TRAFFIC_SPIKE_BASELINE_MINUTES - TRAFFIC_SPIKE_WINDOW_MINUTES) / TRAFFIC_SPIKE_WINDOW_MINUTES));
  const multiplier = baselineFiveMinuteCount > 0 ? currentFiveMinuteCount / baselineFiveMinuteCount : null;
  const thresholdTriggered = currentFiveMinuteCount >= threshold;
  const baselineTriggered = baselineFiveMinuteCount >= 3 && currentFiveMinuteCount >= (baselineFiveMinuteCount * 3);

  return {
    route: entry.route,
    apiPath: entry.apiPath,
    threshold,
    currentFiveMinuteCount,
    baselineFiveMinuteCount: Number(baselineFiveMinuteCount.toFixed(2)),
    spikeMultiplier: multiplier == null ? null : Number(multiplier.toFixed(2)),
    alert: thresholdTriggered || baselineTriggered,
    reasons: [
      ...(thresholdTriggered ? ['absolute_threshold'] : []),
      ...(baselineTriggered ? ['baseline_multiplier'] : []),
    ],
  };
}
function toIsoDate(value) {
  if (!value) {
    return null;
  }
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function formatWindowLabel(days) {
  if (days === 1) return 'Daily (last 24 hours)';
  if (days === 7) return 'Weekly (last 7 days)';
  if (days === 30) return 'Last 30 days';
  if (days === 60) return 'Last 60 days';
  if (days === 90) return 'Last 90 days';
  if (days === 365) return 'Yearly (last 365 days)';
  return `Last ${days} days`;
}

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'GET');
  if (methodError) return methodError;

  try {
    const url = new URL(event.rawUrl || `https://endtimes.today${event.path}${event.rawQuery ? `?${event.rawQuery}` : ''}`);
    const days = normalizeDays(url.searchParams.get('days'));
    const { sql, user } = await getAuthenticatedUser(event);
    await ensureMemberSchema(sql);

    const [overviewRows] = await Promise.all([
      sql`
        SELECT
          (SELECT COUNT(*)::int FROM users WHERE role = 'member' AND created_at >= NOW() - (${days} || ' days')::interval) AS new_members,
          (SELECT COUNT(*)::int FROM users WHERE role = 'member' AND membership_level IN ('premium', 'lifetime') AND status = 'active') AS active_premium_members,
          (SELECT COUNT(*)::int FROM users WHERE role = 'member' AND membership_level IN ('premium', 'lifetime') AND membership_expires_at IS NOT NULL AND membership_expires_at >= NOW() AND membership_expires_at <= NOW() + INTERVAL '30 days') AS expiring_premium_members,
          (SELECT COUNT(*)::int FROM posts WHERE COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published' AND COALESCE(published_at, created_at) >= NOW() - (${days} || ' days')::interval) AS published_posts,
          (SELECT COUNT(*)::int FROM words) AS total_words,
          (SELECT COUNT(*)::int FROM tasks WHERE status = 'open') AS open_tasks,
          (SELECT COUNT(*)::int FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND due_date < CURRENT_DATE) AS overdue_tasks,
          (SELECT COUNT(*)::int
            FROM request_audit_log
            WHERE created_at >= NOW() - (${days} || ' days')::interval
              AND outcome = ANY(${SECURITY_PROBLEM_OUTCOMES})
          ) AS failed_actions
      `,
    ]);

    const monitoredRoutes = MONITORED_ROUTE_CONFIG.map((item) => item.route);

    const [membershipBreakdownRows, signupTrendRows, postTrendRows, taskStatusRows, faqRows, feedRows, securityRows, tagRows, newMembersRows, activePremiumRows, expiringPremiumRows, publishedPostRows, totalWordRows, openTaskRows, overdueTaskRows, failedActionRows, trafficSpikeRows, conversionFunnelRows] = await Promise.all([
      sql`SELECT COALESCE(membership_level, 'free') AS level, COUNT(*)::int AS total
          FROM users
          WHERE role = 'member'
          GROUP BY COALESCE(membership_level, 'free')
          ORDER BY total DESC`,
      sql`SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*)::int AS total
          FROM users
          WHERE role = 'member' AND created_at >= NOW() - (${days} || ' days')::interval
          GROUP BY 1
          ORDER BY 1 ASC`,
      sql`SELECT DATE_TRUNC('day', COALESCE(published_at, created_at))::date AS day, COUNT(*)::int AS total
          FROM posts
          WHERE COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
            AND COALESCE(published_at, created_at) >= NOW() - (${days} || ' days')::interval
          GROUP BY 1
          ORDER BY 1 ASC`,
      sql`SELECT COALESCE(NULLIF(BTRIM(status), ''), 'unknown') AS status, COUNT(*)::int AS total
          FROM tasks
          GROUP BY 1
          ORDER BY total DESC`,
      sql`SELECT
            COUNT(*) FILTER (WHERE is_published) ::int AS published,
            COUNT(*) FILTER (WHERE NOT is_published) ::int AS unpublished,
            COUNT(*)::int AS total
          FROM faqs`,
      sql`SELECT
            COUNT(*) FILTER (WHERE is_active) ::int AS active,
            COUNT(*) FILTER (WHERE NOT is_active) ::int AS inactive,
            COUNT(*)::int AS total
          FROM feeds`,
      sql`SELECT route, action, outcome, created_at
          FROM request_audit_log
          WHERE created_at >= NOW() - (${days} || ' days')::interval
            AND outcome = ANY(${SECURITY_PROBLEM_OUTCOMES})
          ORDER BY created_at DESC
          LIMIT 12`,
      sql`SELECT LOWER(BTRIM(tag_name)) AS tag_name, COUNT(*)::int AS total
          FROM (
            SELECT REGEXP_SPLIT_TO_TABLE(COALESCE(tag, ''), ',') AS tag_name
          FROM posts
          ) split_tags
          WHERE BTRIM(tag_name) <> ''
          GROUP BY LOWER(BTRIM(tag_name))
          ORDER BY total DESC, tag_name ASC
          LIMIT 8`,
      sql`SELECT id, username, email, membership_level, status, created_at, membership_expires_at
          FROM users
          WHERE role = 'member'
            AND created_at >= NOW() - (${days} || ' days')::interval
          ORDER BY created_at DESC
          LIMIT 50`,
      sql`SELECT id, username, email, membership_level, status, created_at, membership_expires_at
          FROM users
          WHERE role = 'member'
            AND membership_level IN ('premium', 'lifetime')
            AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 50`,
      sql`SELECT id, username, email, membership_level, status, membership_expires_at
          FROM users
          WHERE role = 'member'
            AND membership_level IN ('premium', 'lifetime')
            AND membership_expires_at IS NOT NULL
            AND membership_expires_at >= NOW()
            AND membership_expires_at <= NOW() + INTERVAL '30 days'
          ORDER BY membership_expires_at ASC
          LIMIT 50`,
      sql`SELECT id, title, slug, status, created_at, published_at
          FROM posts
          WHERE COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
            AND COALESCE(published_at, created_at) >= NOW() - (${days} || ' days')::interval
          ORDER BY COALESCE(published_at, created_at) DESC
          LIMIT 50`,
      sql`SELECT word, gematria_value, digital_root, search_count, updated_at
          FROM words
          ORDER BY updated_at DESC NULLS LAST, created_at DESC
          LIMIT 50`,
      sql`SELECT id, title, status, due_date, created_at, updated_at
          FROM tasks
          WHERE status = 'open'
          ORDER BY COALESCE(due_date::timestamp, created_at) ASC
          LIMIT 50`,
      sql`SELECT id, title, status, due_date, created_at, updated_at
          FROM tasks
          WHERE status = 'open'
            AND due_date IS NOT NULL
            AND due_date < CURRENT_DATE
          ORDER BY due_date ASC
          LIMIT 50`,
      sql`SELECT route, action, outcome, created_at
          FROM request_audit_log
          WHERE created_at >= NOW() - (${days} || ' days')::interval
            AND outcome = ANY(${SECURITY_PROBLEM_OUTCOMES})
          ORDER BY created_at DESC
          LIMIT 50`,
      sql`
        SELECT
          route,
          COUNT(*) FILTER (WHERE created_at >= NOW() - (${TRAFFIC_SPIKE_WINDOW_MINUTES} || ' minutes')::interval)::int AS current_five_minute_count,
          COUNT(*) FILTER (
            WHERE created_at >= NOW() - (${TRAFFIC_SPIKE_BASELINE_MINUTES} || ' minutes')::interval
              AND created_at < NOW() - (${TRAFFIC_SPIKE_WINDOW_MINUTES} || ' minutes')::interval
          )::int AS prior_window_count
        FROM request_audit_log
        WHERE route = ANY(${monitoredRoutes})
          AND created_at >= NOW() - (${TRAFFIC_SPIKE_BASELINE_MINUTES} || ' minutes')::interval
        GROUP BY route
      `,
      sql`
        WITH conversion_window AS (
          SELECT NOW() - (${days} || ' days')::interval AS starts_at
        ),
        unique_visitors AS (
          SELECT COUNT(DISTINCT request_fingerprint)::int AS total
          FROM request_audit_log, conversion_window
          WHERE created_at >= conversion_window.starts_at
            AND route NOT LIKE 'admin-%'
            AND route <> 'security-retention'
        ),
        free_memberships AS (
          SELECT COUNT(*)::int AS total
          FROM users, conversion_window
          WHERE role = 'member'
            AND created_at >= conversion_window.starts_at
        ),
        premium_conversions AS (
          SELECT COUNT(*)::int AS total
          FROM users, conversion_window
          WHERE role = 'member'
            AND membership_level IN ('premium', 'lifetime')
            AND membership_started_at IS NOT NULL
            AND membership_started_at >= conversion_window.starts_at
        )
        SELECT
          unique_visitors.total AS unique_visitors,
          free_memberships.total AS free_memberships,
          premium_conversions.total AS premium_conversions
        FROM unique_visitors, free_memberships, premium_conversions
      `,
    ]);

    const overview = overviewRows[0] || {};
    const faqCoverage = faqRows[0] || { published: 0, unpublished: 0, total: 0 };
    const feedCoverage = feedRows[0] || { active: 0, inactive: 0, total: 0 };

    const trafficSpikeMap = new Map(trafficSpikeRows.map((row) => [row.route, row]));
    const trafficAlerts = MONITORED_ROUTE_CONFIG.map((config) => buildTrafficAlert({
      ...config,
      currentFiveMinuteCount: Number(trafficSpikeMap.get(config.route)?.current_five_minute_count || 0),
      priorWindowCount: Number(trafficSpikeMap.get(config.route)?.prior_window_count || 0),
    }));

    const conversionFunnel = conversionFunnelRows[0] || {};
    const uniqueVisitors = Number(conversionFunnel.unique_visitors || 0);
    const freeMemberships = Number(conversionFunnel.free_memberships || 0);
    const premiumConversions = Number(conversionFunnel.premium_conversions || 0);
    const visitorsToFreeRate = uniqueVisitors > 0 ? Number(((freeMemberships / uniqueVisitors) * 100).toFixed(2)) : 0;
    const freeToPremiumRate = freeMemberships > 0 ? Number(((premiumConversions / freeMemberships) * 100).toFixed(2)) : 0;

    return jsonResponse(200, {
      generatedAt: new Date().toISOString(),
      days,
      user,
      overview: {
        newMembers: Number(overview.new_members || 0),
        activePremiumMembers: Number(overview.active_premium_members || 0),
        expiringPremiumMembers: Number(overview.expiring_premium_members || 0),
        publishedPosts: Number(overview.published_posts || 0),
        totalWords: Number(overview.total_words || 0),
        openTasks: Number(overview.open_tasks || 0),
        overdueTasks: Number(overview.overdue_tasks || 0),
        failedActions: Number(overview.failed_actions || 0),
      },
      membershipsByLevel: membershipBreakdownRows.map((row) => ({
        level: row.level,
        total: Number(row.total || 0),
      })),
      memberSignupsTrend: signupTrendRows.map((row) => ({
        day: row.day,
        total: Number(row.total || 0),
      })),
      publishedPostsTrend: postTrendRows.map((row) => ({
        day: row.day,
        total: Number(row.total || 0),
      })),
      taskStatusBreakdown: taskStatusRows.map((row) => ({
        status: row.status,
        total: Number(row.total || 0),
      })),
      topTags: tagRows.map((row) => ({
        tag: row.tag_name,
        total: Number(row.total || 0),
      })),
      faqCoverage: {
        published: Number(faqCoverage.published || 0),
        unpublished: Number(faqCoverage.unpublished || 0),
        total: Number(faqCoverage.total || 0),
      },
      feedCoverage: {
        active: Number(feedCoverage.active || 0),
        inactive: Number(feedCoverage.inactive || 0),
        total: Number(feedCoverage.total || 0),
      },
      trafficAlerts: {
        generatedAt: new Date().toISOString(),
        windowMinutes: TRAFFIC_SPIKE_WINDOW_MINUTES,
        baselineMinutes: TRAFFIC_SPIKE_BASELINE_MINUTES,
        hasActiveAlerts: trafficAlerts.some((item) => item.alert),
        items: trafficAlerts,
      },
      conversionFunnel: {
        windowLabel: formatWindowLabel(days),
        uniqueVisitors,
        freeMemberships,
        premiumConversions,
        visitorsToFreeRate,
        freeToPremiumRate,
      },
      securityEvents: securityRows.map((row) => ({
        route: row.route,
        action: row.action,
        outcome: row.outcome,
        createdAt: toIsoDate(row.created_at),
      })),
      detailRows: {
        newMembers: newMembersRows.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          membershipLevel: row.membership_level,
          status: row.status,
          createdAt: toIsoDate(row.created_at),
          membershipExpiresAt: toIsoDate(row.membership_expires_at),
        })),
        activePremiumMembers: activePremiumRows.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          membershipLevel: row.membership_level,
          status: row.status,
          createdAt: toIsoDate(row.created_at),
          membershipExpiresAt: toIsoDate(row.membership_expires_at),
        })),
        expiringPremiumMembers: expiringPremiumRows.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          membershipLevel: row.membership_level,
          status: row.status,
          membershipExpiresAt: toIsoDate(row.membership_expires_at),
        })),
        publishedPosts: publishedPostRows.map((row) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          status: row.status,
          createdAt: toIsoDate(row.created_at),
          publishedAt: toIsoDate(row.published_at),
        })),
        totalWords: totalWordRows.map((row) => ({
          word: row.word,
          gematriaValue: Number(row.gematria_value || 0),
          digitalRoot: Number(row.digital_root || 0),
          searchCount: Number(row.search_count || 0),
          updatedAt: toIsoDate(row.updated_at),
        })),
        openTasks: openTaskRows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          dueDate: row.due_date,
          createdAt: toIsoDate(row.created_at),
          updatedAt: toIsoDate(row.updated_at),
        })),
        overdueTasks: overdueTaskRows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          dueDate: row.due_date,
          createdAt: toIsoDate(row.created_at),
          updatedAt: toIsoDate(row.updated_at),
        })),
        failedActions: failedActionRows.map((row) => ({
          route: row.route,
          action: row.action,
          outcome: row.outcome,
          createdAt: toIsoDate(row.created_at),
        })),
      },
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to load admin reports' }, error.headers || {});
  }
}
