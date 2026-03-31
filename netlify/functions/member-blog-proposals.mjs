import crypto from 'node:crypto';
import { getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';

function isPremiumMembership(level) {
  return level === 'premium' || level === 'lifetime';
}

export async function handler(event) {
  try {
    const method = String(event?.httpMethod || '').toUpperCase();
    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });

    if (method === 'GET') {
      const rows = await sql`
        SELECT id, title, summary, status, rejection_explanation, reviewed_at, created_at, updated_at
        FROM blog_post_proposals
        WHERE user_id = ${member.id}
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
      if (!id) {
        return jsonResponse(400, { error: 'id is required' });
      }

      const rows = await sql`
        UPDATE blog_post_proposals
        SET rejection_explanation = NULL,
            updated_at = NOW()
        WHERE id = ${id}
          AND user_id = ${member.id}
          AND status = 'rejected'
        RETURNING id, status, rejection_explanation, reviewed_at, created_at, updated_at
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'Proposal not found' });
      }

      return jsonResponse(200, {
        item: {
          id: rows[0].id,
          status: rows[0].status,
          rejectionExplanation: rows[0].rejection_explanation,
          reviewedAt: rows[0].reviewed_at,
          createdAt: rows[0].created_at,
          updatedAt: rows[0].updated_at,
        },
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
