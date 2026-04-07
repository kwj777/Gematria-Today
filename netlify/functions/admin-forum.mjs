import crypto from 'node:crypto';
import { getAuthenticatedUser, jsonResponse, parseBody, routeByHttpMethod } from './_admin.mjs';
import { ensureForumSchema } from './member-forum.mjs';

const ACCESS_TIERS = new Set(['free', 'premium']);
const REPORT_STATUSES = new Set(['open', 'in_review', 'actioned', 'dismissed', 'resolved']);
const REPORT_ACTIONS = new Set(['none', 'resolve', 'dismiss', 'remove_post', 'hide_thread', 'warn_user', 'suspend_user', 'escalate']);
const CATEGORY_POST_MODES = new Set(['members', 'moderators']);
const CATEGORY_DEFAULT_SORT_MODES = new Set(['newest', 'popular']);

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    accessTier: row.access_tier,
    sortOrder: Number(row.sort_order || 0),
    isArchived: Boolean(row.is_archived),
    isLocked: Boolean(row.is_locked),
    postMode: row.post_mode || 'members',
    requireApproval: Boolean(row.require_approval),
    colorBadge: row.color_badge,
    iconName: row.icon_name,
    guidelines: row.guidelines,
    defaultSortMode: row.default_sort_mode || 'newest',
    threadTemplatePrompt: row.thread_template_prompt,
    createdAt: row.created_at,
  };
}

function mapReport(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    postId: row.post_id,
    threadTitle: row.thread_title,
    categoryName: row.category_name,
    reportedBodyPreview: row.reported_body_preview,
    reason: row.reason,
    details: row.details,
    internalNote: row.internal_note,
    moderatorNote: row.moderator_note,
    cannedResponse: row.canned_response,
    actionTaken: row.action_taken || 'none',
    status: row.status,
    assignedModeratorId: row.assigned_moderator_id,
    assignedModeratorUsername: row.assigned_moderator_username,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedByUsername: row.resolved_by_username,
    createdAt: row.created_at,
    reporterUsername: row.reporter_username,
  };
}

async function listDashboardData(sql, event) {
  const params = event.queryStringParameters || {};
  const reason = String(params.reason || '').trim().toLowerCase();
  const category = String(params.category || '').trim().toLowerCase();
  const status = String(params.status || '').trim().toLowerCase();
  const assignee = String(params.assignee || '').trim().toLowerCase();
  const search = String(params.search || '').trim().toLowerCase();
  const onlyUnresolved = String(params.onlyUnresolved || 'false').trim().toLowerCase() === 'true';
  const dateFrom = String(params.dateFrom || '').trim();
  const dateTo = String(params.dateTo || '').trim();

  const [categories, reports, moderationRows, topReasons, topReporters, auditTrail] = await Promise.all([
    sql`
      SELECT id, slug, name, description, access_tier, sort_order,
        is_archived, is_locked, post_mode, require_approval, color_badge, icon_name, guidelines, default_sort_mode, thread_template_prompt,
        created_at
      FROM forum_categories
      ORDER BY access_tier ASC, sort_order ASC, name ASC
    `,
    sql`
      SELECT r.id, r.thread_id, r.post_id, r.reason, r.details, r.internal_note, r.moderator_note, r.canned_response, r.action_taken,
        r.status, r.assigned_moderator_id, r.resolved_by_user_id, r.created_at,
        reporter.username AS reporter_username,
        assignee.username AS assigned_moderator_username,
        resolver.username AS resolved_by_username,
        t.title AS thread_title,
        c.name AS category_name,
        COALESCE(p.body, t.body) AS reported_body_preview
      FROM forum_reports r
      JOIN users reporter ON reporter.id = r.reporter_user_id
      LEFT JOIN users assignee ON assignee.id = r.assigned_moderator_id
      LEFT JOIN users resolver ON resolver.id = r.resolved_by_user_id
      LEFT JOIN forum_threads t ON t.id = r.thread_id
      LEFT JOIN forum_posts p ON p.id = r.post_id
      LEFT JOIN forum_threads pt ON pt.id = p.thread_id
      LEFT JOIN forum_categories c ON c.id = COALESCE(t.category_id, pt.category_id)
      WHERE (${onlyUnresolved} = FALSE OR r.status IN ('open', 'in_review'))
        AND (${reason} = '' OR LOWER(r.reason) = ${reason})
        AND (${category} = '' OR LOWER(COALESCE(c.name, '')) = ${category})
        AND (${status} = '' OR LOWER(r.status) = ${status})
        AND (${assignee} = '' OR LOWER(COALESCE(assignee.username, '')) = ${assignee})
        AND (
          NULLIF(${dateFrom}, '')::timestamptz IS NULL
          OR r.created_at >= NULLIF(${dateFrom}, '')::timestamptz
        )
        AND (
          NULLIF(${dateTo}, '')::timestamptz IS NULL
          OR r.created_at <= NULLIF(${dateTo}, '')::timestamptz
        )
        AND (${search} = ''
          OR LOWER(COALESCE(r.details, '')) LIKE ${`%${search}%`}
          OR LOWER(COALESCE(r.reason, '')) LIKE ${`%${search}%`}
          OR LOWER(COALESCE(t.title, '')) LIKE ${`%${search}%`}
          OR LOWER(COALESCE(COALESCE(p.body, t.body), '')) LIKE ${`%${search}%`})
      ORDER BY r.created_at DESC
      LIMIT 300
    `,
    sql`
      SELECT
        COUNT(*)::INTEGER AS total_reports,
        COUNT(*) FILTER (WHERE status IN ('open', 'in_review'))::INTEGER AS unresolved_reports,
        COUNT(*) FILTER (WHERE status = 'actioned')::INTEGER AS actioned_reports,
        COUNT(*) FILTER (WHERE status = 'dismissed')::INTEGER AS dismissed_reports,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 day')::INTEGER AS reports_last_7_days
      FROM forum_reports
    `,
    sql`
      SELECT reason, COUNT(*)::INTEGER AS total
      FROM forum_reports
      WHERE created_at >= NOW() - INTERVAL '30 day'
      GROUP BY reason
      ORDER BY total DESC, reason ASC
      LIMIT 5
    `,
    sql`
      SELECT reporter.username, COUNT(*)::INTEGER AS total
      FROM forum_reports r
      JOIN users reporter ON reporter.id = r.reporter_user_id
      WHERE r.created_at >= NOW() - INTERVAL '30 day'
      GROUP BY reporter.username
      ORDER BY total DESC, reporter.username ASC
      LIMIT 5
    `,
    sql`
      SELECT id, actor_user_id, target_type, target_id, action, details, created_at
      FROM forum_admin_audit
      ORDER BY created_at DESC
      LIMIT 40
    `,
  ]);

  const metrics = reports.reduce((acc, report) => {
    const ageHours = (Date.now() - new Date(report.created_at).getTime()) / 36e5;
    if (Number.isFinite(ageHours)) {
      acc.totalAgeHours += ageHours;
      acc.count += 1;
    }
    return acc;
  }, { totalAgeHours: 0, count: 0 });

  return {
    categories: categories.map(mapCategory),
    reports: reports.map(mapReport),
    moderationSummary: {
      ...(moderationRows[0] || {}),
      avgReportAgeHours: metrics.count ? Number((metrics.totalAgeHours / metrics.count).toFixed(1)) : 0,
    },
    abuseSignals: {
      topReasons,
      topReporters,
    },
    auditTrail,
  };
}

async function createAuditEntry(sql, actorUserId, targetType, targetId, action, details = null) {
  await sql`
    INSERT INTO forum_admin_audit (id, actor_user_id, target_type, target_id, action, details)
    VALUES (${crypto.randomUUID()}, ${actorUserId}, ${targetType}, ${targetId}, ${action}, ${details ? JSON.stringify(details) : null}::jsonb)
  `;
}

async function createCategory(sql, event) {
  const body = parseBody(event);
  const name = String(body.name || '').trim();
  const slugInput = String(body.slug || '').trim();
  const slug = normalizeSlug(slugInput || name);
  const description = String(body.description || '').trim() || null;
  const accessTier = String(body.accessTier || 'free').trim().toLowerCase();
  const sortOrder = Number.parseInt(String(body.sortOrder || '0'), 10) || 0;
  const isArchived = String(body.isArchived || 'false') === 'true';
  const isLocked = String(body.isLocked || 'false') === 'true';
  const postMode = String(body.postMode || 'members').trim().toLowerCase();
  const requireApproval = String(body.requireApproval || 'false') === 'true';
  const colorBadge = String(body.colorBadge || '').trim() || null;
  const iconName = String(body.iconName || '').trim() || null;
  const guidelines = String(body.guidelines || '').trim() || null;
  const defaultSortMode = String(body.defaultSortMode || 'newest').trim().toLowerCase();
  const threadTemplatePrompt = String(body.threadTemplatePrompt || '').trim() || null;

  if (!name) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  if (!slug) throw Object.assign(new Error('slug is required and must be URL-safe'), { statusCode: 400 });
  if (!ACCESS_TIERS.has(accessTier)) throw Object.assign(new Error('accessTier must be free or premium'), { statusCode: 400 });
  if (!CATEGORY_POST_MODES.has(postMode)) throw Object.assign(new Error('postMode must be members or moderators'), { statusCode: 400 });
  if (!CATEGORY_DEFAULT_SORT_MODES.has(defaultSortMode)) throw Object.assign(new Error('defaultSortMode must be newest or popular'), { statusCode: 400 });

  const rows = await sql`
    INSERT INTO forum_categories (id, slug, name, description, access_tier, sort_order, is_archived, is_locked, post_mode, require_approval, color_badge, icon_name, guidelines, default_sort_mode, thread_template_prompt)
    VALUES (${crypto.randomUUID()}, ${slug}, ${name}, ${description}, ${accessTier}, ${sortOrder}, ${isArchived}, ${isLocked}, ${postMode}, ${requireApproval}, ${colorBadge}, ${iconName}, ${guidelines}, ${defaultSortMode}, ${threadTemplatePrompt})
    RETURNING id, slug, name, description, access_tier, sort_order, is_archived, is_locked, post_mode, require_approval, color_badge, icon_name, guidelines, default_sort_mode, thread_template_prompt, created_at
  `;

  return { category: mapCategory(rows[0]) };
}

async function updateCategory(sql, event) {
  const body = parseBody(event);
  const id = String(body.id || '').trim();
  if (!id) throw Object.assign(new Error('id is required'), { statusCode: 400 });

  const existingRows = await sql`SELECT id, slug, name, description, access_tier, sort_order, is_archived, is_locked, post_mode, require_approval, color_badge, icon_name, guidelines, default_sort_mode, thread_template_prompt, created_at FROM forum_categories WHERE id = ${id} LIMIT 1`;
  if (!existingRows.length) throw Object.assign(new Error('Category not found'), { statusCode: 404 });

  const existing = existingRows[0];
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
  const hasSlug = Object.prototype.hasOwnProperty.call(body, 'slug');
  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
  const hasAccessTier = Object.prototype.hasOwnProperty.call(body, 'accessTier');
  const hasSortOrder = Object.prototype.hasOwnProperty.call(body, 'sortOrder');
  const hasIsArchived = Object.prototype.hasOwnProperty.call(body, 'isArchived');
  const hasIsLocked = Object.prototype.hasOwnProperty.call(body, 'isLocked');
  const hasPostMode = Object.prototype.hasOwnProperty.call(body, 'postMode');
  const hasRequireApproval = Object.prototype.hasOwnProperty.call(body, 'requireApproval');
  const hasColorBadge = Object.prototype.hasOwnProperty.call(body, 'colorBadge');
  const hasIconName = Object.prototype.hasOwnProperty.call(body, 'iconName');
  const hasGuidelines = Object.prototype.hasOwnProperty.call(body, 'guidelines');
  const hasDefaultSortMode = Object.prototype.hasOwnProperty.call(body, 'defaultSortMode');
  const hasThreadTemplatePrompt = Object.prototype.hasOwnProperty.call(body, 'threadTemplatePrompt');

  const name = hasName ? String(body.name || '').trim() : existing.name;
  const slug = hasSlug ? normalizeSlug(body.slug) : existing.slug;
  const description = hasDescription ? (String(body.description || '').trim() || null) : existing.description;
  const accessTier = hasAccessTier ? String(body.accessTier || '').trim().toLowerCase() : existing.access_tier;
  const sortOrder = hasSortOrder ? (Number.parseInt(String(body.sortOrder || '0'), 10) || 0) : Number(existing.sort_order || 0);
  const isArchived = hasIsArchived ? String(body.isArchived || 'false') === 'true' : Boolean(existing.is_archived);
  const isLocked = hasIsLocked ? String(body.isLocked || 'false') === 'true' : Boolean(existing.is_locked);
  const postMode = hasPostMode ? String(body.postMode || 'members').trim().toLowerCase() : existing.post_mode;
  const requireApproval = hasRequireApproval ? String(body.requireApproval || 'false') === 'true' : Boolean(existing.require_approval);
  const colorBadge = hasColorBadge ? (String(body.colorBadge || '').trim() || null) : existing.color_badge;
  const iconName = hasIconName ? (String(body.iconName || '').trim() || null) : existing.icon_name;
  const guidelines = hasGuidelines ? (String(body.guidelines || '').trim() || null) : existing.guidelines;
  const defaultSortMode = hasDefaultSortMode ? String(body.defaultSortMode || 'newest').trim().toLowerCase() : existing.default_sort_mode;
  const threadTemplatePrompt = hasThreadTemplatePrompt ? (String(body.threadTemplatePrompt || '').trim() || null) : existing.thread_template_prompt;

  if (!name) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  if (!slug) throw Object.assign(new Error('slug is required and must be URL-safe'), { statusCode: 400 });
  if (!ACCESS_TIERS.has(accessTier)) throw Object.assign(new Error('accessTier must be free or premium'), { statusCode: 400 });
  if (!CATEGORY_POST_MODES.has(postMode)) throw Object.assign(new Error('postMode must be members or moderators'), { statusCode: 400 });
  if (!CATEGORY_DEFAULT_SORT_MODES.has(defaultSortMode)) throw Object.assign(new Error('defaultSortMode must be newest or popular'), { statusCode: 400 });

  const rows = await sql`
    UPDATE forum_categories
    SET slug = ${slug},
        name = ${name},
        description = ${description},
        access_tier = ${accessTier},
        sort_order = ${sortOrder},
        is_archived = ${isArchived},
        is_locked = ${isLocked},
        post_mode = ${postMode},
        require_approval = ${requireApproval},
        color_badge = ${colorBadge},
        icon_name = ${iconName},
        guidelines = ${guidelines},
        default_sort_mode = ${defaultSortMode},
        thread_template_prompt = ${threadTemplatePrompt}
    WHERE id = ${id}
    RETURNING id, slug, name, description, access_tier, sort_order, is_archived, is_locked, post_mode, require_approval, color_badge, icon_name, guidelines, default_sort_mode, thread_template_prompt, created_at
  `;

  return { category: mapCategory(rows[0]) };
}

async function deleteCategory(sql, event) {
  const id = String(event.queryStringParameters?.id || parseBody(event).id || '').trim();
  if (!id) throw Object.assign(new Error('id is required'), { statusCode: 400 });

  const inUseRows = await sql`
    SELECT COUNT(*)::INTEGER AS total
    FROM forum_threads
    WHERE category_id = ${id}
      AND deleted_at IS NULL
  `;
  if ((inUseRows[0]?.total || 0) > 0) {
    throw Object.assign(new Error('Cannot delete category while active threads exist in it'), { statusCode: 409 });
  }

  const deletedRows = await sql`DELETE FROM forum_categories WHERE id = ${id} RETURNING id`;
  if (!deletedRows.length) throw Object.assign(new Error('Category not found'), { statusCode: 404 });
  return { deleted: true };
}

async function resolveReport(sql, event, user) {
  const body = parseBody(event);
  const ids = Array.isArray(body.ids) ? body.ids.map((value) => String(value || '').trim()).filter(Boolean) : [String(body.id || '').trim()].filter(Boolean);
  if (!ids.length) throw Object.assign(new Error('id or ids is required'), { statusCode: 400 });
  const status = String(body.status || '').trim().toLowerCase();
  const actionTaken = String(body.actionTaken || (status === 'dismissed' ? 'dismiss' : status === 'resolved' ? 'resolve' : 'none')).trim().toLowerCase();
  const assignTo = String(body.assignTo || '').trim();
  const moderatorNote = Object.prototype.hasOwnProperty.call(body, 'moderatorNote') ? (String(body.moderatorNote || '').trim() || null) : null;
  const internalNote = Object.prototype.hasOwnProperty.call(body, 'internalNote') ? (String(body.internalNote || '').trim() || null) : null;
  const cannedResponse = Object.prototype.hasOwnProperty.call(body, 'cannedResponse') ? (String(body.cannedResponse || '').trim() || null) : null;

  if (status && !REPORT_STATUSES.has(status)) throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
  if (!REPORT_ACTIONS.has(actionTaken)) throw Object.assign(new Error('Invalid actionTaken'), { statusCode: 400 });

  let assignedModeratorId = null;
  if (assignTo) {
    const assigneeRows = await sql`SELECT id FROM users WHERE username = ${assignTo} LIMIT 1`;
    if (!assigneeRows.length) throw Object.assign(new Error('Assigned moderator not found'), { statusCode: 404 });
    assignedModeratorId = assigneeRows[0].id;
  }

  const rows = await sql`
    UPDATE forum_reports
    SET status = ${status || 'resolved'},
        action_taken = ${actionTaken},
        assigned_moderator_id = COALESCE(${assignedModeratorId}, assigned_moderator_id),
        moderator_note = COALESCE(${moderatorNote}, moderator_note),
        internal_note = COALESCE(${internalNote}, internal_note),
        canned_response = COALESCE(${cannedResponse}, canned_response),
        resolved_by_user_id = CASE WHEN ${status || 'resolved'} IN ('resolved', 'actioned', 'dismissed') THEN ${user.id} ELSE resolved_by_user_id END
    WHERE id = ANY(${ids})
    RETURNING id
  `;

  if (!rows.length) throw Object.assign(new Error('Report not found'), { statusCode: 404 });
  await Promise.all(rows.map((row) => createAuditEntry(sql, user.id, 'report', row.id, `report_${status || 'resolved'}`, { actionTaken, assignTo: assignTo || null })));
  return { updated: rows.length };
}

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);
    await ensureForumSchema(sql);

    return await routeByHttpMethod(event, {
      GET: async () => jsonResponse(200, await listDashboardData(sql, event)),
      POST: async () => {
        const payload = await createCategory(sql, event);
        await createAuditEntry(sql, user.id, 'category', payload.category.id, 'create_category', payload.category);
        return jsonResponse(201, payload);
      },
      PATCH: async () => {
        const payload = await updateCategory(sql, event);
        await createAuditEntry(sql, user.id, 'category', payload.category.id, 'update_category', payload.category);
        return jsonResponse(200, payload);
      },
      DELETE: async () => {
        const id = String(event.queryStringParameters?.id || parseBody(event).id || '').trim();
        const payload = await deleteCategory(sql, event);
        await createAuditEntry(sql, user.id, 'category', id, 'delete_category');
        return jsonResponse(200, payload);
      },
      PUT: async () => jsonResponse(200, await resolveReport(sql, event, user)),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Admin forum request failed' });
  }
}
