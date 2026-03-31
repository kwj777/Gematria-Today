import { formatBlogPostProposal, getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event, { requireAuth: true });
    if (!user) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    const method = String(event?.httpMethod || '').toUpperCase();

    if (method === 'GET') {
      const url = new URL(event.rawUrl || `http://localhost${event.path || '/.netlify/functions/admin-blog-proposals'}`);
      const status = String(url.searchParams.get('status') || '').trim().toLowerCase();
      const includeAll = status === 'all' || !status;
      const rows = includeAll
        ? await sql`SELECT * FROM blog_post_proposals ORDER BY created_at DESC`
        : await sql`SELECT * FROM blog_post_proposals WHERE status = ${status} ORDER BY created_at DESC`;
      return jsonResponse(200, { items: rows.map(formatBlogPostProposal) });
    }

    if (method === 'PATCH') {
      const payload = parseBody(event);
      const id = String(payload.id || '').trim();
      const status = String(payload.status || '').trim().toLowerCase();
      const rejectionExplanationRaw = payload.rejectionExplanation;
      const rejectionExplanation = rejectionExplanationRaw == null
        ? null
        : String(rejectionExplanationRaw).trim();
      const acceptanceMessage = 'Your proposal has been accepted and will be posted soon.';

      if (!id || !status) {
        return jsonResponse(400, { error: 'id and status are required' });
      }

      if (!['pending', 'reviewed', 'approved', 'rejected'].includes(status)) {
        return jsonResponse(400, { error: 'status must be one of pending, reviewed, approved, rejected' });
      }

      if (status === 'rejected' && !rejectionExplanation) {
        return jsonResponse(400, { error: 'rejectionExplanation is required when status is rejected' });
      }

      const rows = await sql`
        UPDATE blog_post_proposals
        SET
          status = ${status},
          rejection_explanation = ${status === 'rejected'
            ? rejectionExplanation
            : status === 'approved'
              ? acceptanceMessage
              : null},
          reviewed_by = ${user.id},
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!rows.length) {
        return jsonResponse(404, { error: 'Proposal not found' });
      }

      return jsonResponse(200, { item: formatBlogPostProposal(rows[0]) });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to process blog proposals' }, error.headers || {});
  }
}
