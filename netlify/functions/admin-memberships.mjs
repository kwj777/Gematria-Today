import { getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';
import { activateYearlyMembership, ensureMemberProfile, ensureMemberSchema, findMemberByEmail } from './_member.mjs';
import { logRequestAudit } from './_security.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql, user } = await getAuthenticatedUser(event);
    await ensureMemberSchema(sql);

    const body = parseBody(event);
    const email = String(body.email ?? '').trim().toLowerCase();

    if (!email) {
      return jsonResponse(400, { error: 'Member email is required' });
    }

    const member = await findMemberByEmail(sql, email);
    if (!member) {
      return jsonResponse(404, { error: 'No member account was found for that email address' });
    }

    if (member.status !== 'active') {
      return jsonResponse(409, { error: `This membership account is ${member.status} and cannot receive a premium grant.` });
    }

    await ensureMemberProfile(sql, member.id, {});
    const updatedMember = await activateYearlyMembership(sql, member.id, { purchasedAt: new Date() });

    await logRequestAudit(sql, event, {
      route: 'admin-memberships',
      action: 'grant_free_premium',
      outcome: 'success',
      metadata: {
        adminUserId: user.id,
        memberId: updatedMember.id,
        memberEmail: updatedMember.email,
      },
    });

    return jsonResponse(200, {
      granted: true,
      member: updatedMember,
      message: `Premium membership granted to ${updatedMember.email}.`,
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Unable to grant premium membership' }, error.headers || {});
  }
}
