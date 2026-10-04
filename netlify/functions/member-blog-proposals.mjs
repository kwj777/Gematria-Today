import crypto from 'node:crypto';
import { getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';
import { applyRateLimit } from './_security.mjs';

// Title and summary match the maxlength on the member.html form. The rest had
// no bound at all, and every proposal is loaded and rendered on the admin
// editorial pages.
const PROPOSAL_FIELD_LIMITS = [
  { field: 'title', label: 'Title', maxLength: 140 },
  { field: 'summary', label: 'Summary', maxLength: 500 },
  { field: 'body', label: 'Draft content', maxLength: 100_000 },
  { field: 'suggestedTags', label: 'Suggested tags', maxLength: 500 },
  { field: 'proposedImageUrl', label: 'Suggested image URL', maxLength: 2048 },
];

function isPremiumMembership(level) {
  return level === 'premium' || level === 'lifetime';
}

export async function handler(event) {
  try {
    const method = String(event?.httpMethod || '').toUpperCase();
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
    const requestUrl = new URL(event.rawUrl || `https://example.com${event.path || ''}`);
    const archiveView = requestUrl.searchParams.get('view') === 'archived';

    if (method === 'GET') {
      const rows = archiveView
        ? await sql`
          SELECT id, title, summary, status, rejection_explanation, reviewed_at, created_at, updated_at
          FROM blog_post_proposals
          WHERE user_id = ${member.id}
            AND archived_by_member_at IS NOT NULL
          ORDER BY created_at DESC
        `
        : await sql`
          SELECT id, title, summary, status, rejection_explanation, reviewed_at, created_at, updated_at
          FROM blog_post_proposals
          WHERE user_id = ${member.id}
            AND archived_by_member_at IS NULL
          ORDER BY created_at DESC
        `;
      return jsonResponse(200, {
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          summary: row.summary,
          status: row.status,
          rejectionExplanation: row.rejection_explanation,
          reviewedAt: row.reviewed_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      });
    }

    if (method === 'PATCH') {
      const payload = parseBody(event);
      const id = String(payload.id || '').trim();
      const action = String(payload.action || '').trim().toLowerCase();
      if (!id) {
        return jsonResponse(400, { error: 'id is required' });
      }

      const rows = action === 'archive'
        ? await sql`
          UPDATE blog_post_proposals
          SET archived_by_member_at = NOW(), updated_at = NOW()
          WHERE id = ${id}
            AND user_id = ${member.id}
          RETURNING id
        `
        : await sql`
          DELETE FROM blog_post_proposals
          WHERE id = ${id}
            AND user_id = ${member.id}
            AND status = 'rejected'
          RETURNING id
        `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'Proposal not found' });
      }

      return jsonResponse(200, {
        item: { id: rows[0].id },
      });
    }

    if (method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    if (!isPremiumMembership(member?.membershipLevel)) {
      return jsonResponse(403, { error: 'Premium membership is required to submit blog proposals.' });
    }

    const payload = parseBody(event);
    const title = String(payload.title || '').trim();
    const summary = String(payload.summary || '').trim();
    const body = String(payload.body || '').trim();
    const suggestedTags = String(payload.suggestedTags || '').trim();
    const proposedImageUrl = String(payload.proposedImageUrl || '').trim() || null;

    if (!title || !summary || !body || !suggestedTags) {
      return jsonResponse(400, { error: 'title, summary, body, and suggestedTags are required' });
    }

    const fieldValues = { title, summary, body, suggestedTags, proposedImageUrl: proposedImageUrl || '' };
    const oversized = PROPOSAL_FIELD_LIMITS.find(({ field, maxLength }) => fieldValues[field].length > maxLength);
    if (oversized) {
      return jsonResponse(400, {
        error: `${oversized.label} must be ${oversized.maxLength.toLocaleString('en-US')} characters or fewer.`,
      });
    }

    await applyRateLimit(sql, event, {
      scope: 'member-blog-proposals-member',
      key: String(member.id),
      limit: 10,
      windowMs: 60 * 60_000,
      blockMs: 60 * 60_000,
      message: 'You have sent a lot of blog proposals recently. Please try again later.',
    });

    const rows = await sql`
      INSERT INTO blog_post_proposals (
        id,
        user_id,
        title,
        summary,
        body,
        suggested_tags,
        attribution_username,
        attribution_display_name,
        attribution_email,
        proposed_image_url,
        status,
        reviewed_by,
        reviewed_at
      )
      VALUES (
        ${crypto.randomUUID()},
        ${member.id},
        ${title},
        ${summary},
        ${body},
        ${suggestedTags},
        ${member.username || null},
        ${member.displayName || null},
        ${member.email || null},
        ${proposedImageUrl},
        'pending',
        NULL,
        NULL
      )
      RETURNING id, title, status, created_at
    `;

    return jsonResponse(201, {
      item: {
        id: rows[0].id,
        title: rows[0].title,
        status: rows[0].status,
        createdAt: rows[0].created_at,
      },
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to submit blog proposal' }, error.headers || {});
  }
}
