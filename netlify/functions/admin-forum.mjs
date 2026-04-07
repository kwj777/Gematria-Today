import crypto from 'node:crypto';
import { getAuthenticatedUser, jsonResponse, parseBody, routeByHttpMethod } from './_admin.mjs';
import { ensureForumSchema } from './member-forum.mjs';

const ACCESS_TIERS = new Set(['free', 'premium']);

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
    status: row.status,
    createdAt: row.created_at,
    reporterUsername: row.reporter_username,
  };
}

async function listDashboardData(sql) {
  const [categories, reports] = await Promise.all([
    sql`
      SELECT id, slug, name, description, access_tier, sort_order, created_at
      FROM forum_categories
      ORDER BY access_tier ASC, sort_order ASC, name ASC
    `,
    sql`
      SELECT r.id, r.thread_id, r.post_id, r.reason, r.details, r.status, r.created_at,
        reporter.username AS reporter_username,
        t.title AS thread_title,
        c.name AS category_name,
        COALESCE(p.body, t.body) AS reported_body_preview
      FROM forum_reports r
      JOIN users reporter ON reporter.id = r.reporter_user_id
      LEFT JOIN forum_threads t ON t.id = r.thread_id
      LEFT JOIN forum_posts p ON p.id = r.post_id
      LEFT JOIN forum_threads pt ON pt.id = p.thread_id
      LEFT JOIN forum_categories c ON c.id = COALESCE(t.category_id, pt.category_id)
      WHERE r.status = 'open'
      ORDER BY r.created_at DESC
      LIMIT 300
    `,
  ]);

  return {
    categories: categories.map(mapCategory),
    reports: reports.map(mapReport),
  };
}

async function createCategory(sql, event) {
  const body = parseBody(event);
  const name = String(body.name || '').trim();
  const slugInput = String(body.slug || '').trim();
  const slug = normalizeSlug(slugInput || name);
  const description = String(body.description || '').trim() || null;
  const accessTier = String(body.accessTier || 'free').trim().toLowerCase();
  const sortOrder = Number.parseInt(String(body.sortOrder || '0'), 10) || 0;

  if (!name) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  if (!slug) throw Object.assign(new Error('slug is required and must be URL-safe'), { statusCode: 400 });
  if (!ACCESS_TIERS.has(accessTier)) throw Object.assign(new Error('accessTier must be free or premium'), { statusCode: 400 });

  const rows = await sql`
    INSERT INTO forum_categories (id, slug, name, description, access_tier, sort_order)
    VALUES (${crypto.randomUUID()}, ${slug}, ${name}, ${description}, ${accessTier}, ${sortOrder})
    RETURNING id, slug, name, description, access_tier, sort_order, created_at
  `;

  return { category: mapCategory(rows[0]) };
}

async function updateCategory(sql, event) {
  const body = parseBody(event);
  const id = String(body.id || '').trim();
  if (!id) throw Object.assign(new Error('id is required'), { statusCode: 400 });

  const existingRows = await sql`SELECT id, slug, name, description, access_tier, sort_order, created_at FROM forum_categories WHERE id = ${id} LIMIT 1`;
  if (!existingRows.length) throw Object.assign(new Error('Category not found'), { statusCode: 404 });

  const existing = existingRows[0];
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
  const hasSlug = Object.prototype.hasOwnProperty.call(body, 'slug');
  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
  const hasAccessTier = Object.prototype.hasOwnProperty.call(body, 'accessTier');
  const hasSortOrder = Object.prototype.hasOwnProperty.call(body, 'sortOrder');

  const name = hasName ? String(body.name || '').trim() : existing.name;
  const slug = hasSlug ? normalizeSlug(body.slug) : existing.slug;
  const description = hasDescription ? (String(body.description || '').trim() || null) : existing.description;
  const accessTier = hasAccessTier ? String(body.accessTier || '').trim().toLowerCase() : existing.access_tier;
  const sortOrder = hasSortOrder ? (Number.parseInt(String(body.sortOrder || '0'), 10) || 0) : Number(existing.sort_order || 0);

  if (!name) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  if (!slug) throw Object.assign(new Error('slug is required and must be URL-safe'), { statusCode: 400 });
  if (!ACCESS_TIERS.has(accessTier)) throw Object.assign(new Error('accessTier must be free or premium'), { statusCode: 400 });

  const rows = await sql`
    UPDATE forum_categories
    SET slug = ${slug},
        name = ${name},
        description = ${description},
        access_tier = ${accessTier},
        sort_order = ${sortOrder}
    WHERE id = ${id}
    RETURNING id, slug, name, description, access_tier, sort_order, created_at
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

async function resolveReport(sql, event) {
  const body = parseBody(event);
  const id = String(body.id || '').trim();
  if (!id) throw Object.assign(new Error('id is required'), { statusCode: 400 });

  const rows = await sql`
    UPDATE forum_reports
    SET status = 'resolved'
    WHERE id = ${id}
      AND status = 'open'
    RETURNING id
  `;

  if (!rows.length) throw Object.assign(new Error('Open report not found'), { statusCode: 404 });
  return { resolved: true };
}

export async function handler(event) {
  try {
    const { sql } = await getAuthenticatedUser(event);
    await ensureForumSchema(sql);

    return routeByHttpMethod(event, {
      GET: async () => jsonResponse(200, await listDashboardData(sql)),
      POST: async () => jsonResponse(201, await createCategory(sql, event)),
      PATCH: async () => jsonResponse(200, await updateCategory(sql, event)),
      DELETE: async () => jsonResponse(200, await deleteCategory(sql, event)),
      PUT: async () => jsonResponse(200, await resolveReport(sql, event)),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Admin forum request failed' });
  }
}
