import crypto from 'node:crypto';
import { getAuthenticatedMember, jsonResponse, parseBody } from './_member.mjs';

function isPremiumMembership(level) {
  return level === 'premium' || level === 'lifetime';
}

export async function handler(event) {
  try {
    const method = String(event?.httpMethod || '').toUpperCase();
    if (method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const { sql, member } = await getAuthenticatedMember(event, { requireAuth: true });
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
