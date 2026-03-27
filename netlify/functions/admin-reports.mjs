import { getAuthenticatedUser, jsonResponse } from './_admin.mjs';
import { ensureMemberSchema } from './_member.mjs';

const ALLOWED_WINDOWS = new Set([7, 30, 90]);
const SECURITY_PROBLEM_OUTCOMES = ['blocked', 'invalid_credentials'];

function normalizeDays(value) {
  const parsed = Number.parseInt(String(value ?? '30'), 10);
  if (!Number.isFinite(parsed) || !ALLOWED_WINDOWS.has(parsed)) {
    return 30;
  }
  return parsed;
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

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

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
          (SELECT COUNT(*)::int FROM tasks WHERE status = 'open') AS open_tasks,
          (SELECT COUNT(*)::int FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND due_date < CURRENT_DATE) AS overdue_tasks,
          (SELECT COUNT(*)::int
            FROM request_audit_log
            WHERE created_at >= NOW() - (${days} || ' days')::interval
              AND outcome = ANY(${SECURITY_PROBLEM_OUTCOMES})
          ) AS failed_actions
      `,
    ]);

    const [membershipBreakdownRows, signupTrendRows, postTrendRows, taskStatusRows, faqRows, feedRows, securityRows, tagRows, newMembersRows, activePremiumRows, expiringPremiumRows, publishedPostRows, openTaskRows, overdueTaskRows, failedActionRows] = await Promise.all([
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
    ]);

    const overview = overviewRows[0] || {};
    const faqCoverage = faqRows[0] || { published: 0, unpublished: 0, total: 0 };
    const feedCoverage = feedRows[0] || { active: 0, inactive: 0, total: 0 };

    return jsonResponse(200, {
      generatedAt: new Date().toISOString(),
      days,
      user,
      overview: {
        newMembers: Number(overview.new_members || 0),
        activePremiumMembers: Number(overview.active_premium_members || 0),
        expiringPremiumMembers: Number(overview.expiring_premium_members || 0),
        publishedPosts: Number(overview.published_posts || 0),
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
