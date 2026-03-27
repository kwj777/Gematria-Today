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
    const action = String(body.action || 'grant-premium').trim().toLowerCase();
    const email = String(body.email ?? '').trim().toLowerCase();

    if (!email) {
      return jsonResponse(400, { error: 'Member email is required' });
    }

    const member = await findMemberByEmail(sql, email);
    if (!member) {
      return jsonResponse(404, { error: 'No member account was found for that email address' });
    }

    if (action === 'promote-admin') {
      if (member.status !== 'active') {
        return jsonResponse(409, { error: `This membership account is ${member.status} and cannot be promoted.` });
      }
      if (!['premium', 'lifetime'].includes(String(member.membershipLevel || '').toLowerCase())) {
        return jsonResponse(409, { error: 'Only premium or lifetime members can be promoted to admin.' });
      }

      const promotedRows = await sql`
        UPDATE users
        SET is_admin = TRUE,
            membership_level = 'lifetime',
            membership_started_at = COALESCE(membership_started_at, NOW()),
            membership_expires_at = NULL,
            updated_at = NOW()
        WHERE id = ${member.id}
        RETURNING id, username, email, display_name, membership_level, membership_started_at, membership_expires_at, stripe_customer_id, stripe_last_checkout_session_id, status, email_verified, created_at, updated_at
      `;

      const promotedMember = promotedRows.length ? promotedRows[0] : null;
      await logRequestAudit(sql, event, {
        route: 'admin-memberships',
        action: 'promote_member_admin',
        outcome: 'success',
        metadata: {
          adminUserId: user.id,
          memberId: member.id,
          memberEmail: member.email,
        },
      });

      return jsonResponse(200, {
        promoted: true,
        member: promotedMember ? {
          id: promotedMember.id,
          username: promotedMember.username,
          email: promotedMember.email,
          displayName: promotedMember.display_name,
          membershipLevel: promotedMember.membership_level,
          membershipStartedAt: promotedMember.membership_started_at,
          membershipExpiresAt: promotedMember.membership_expires_at,
          stripeCustomerId: promotedMember.stripe_customer_id,
          stripeLastCheckoutSessionId: promotedMember.stripe_last_checkout_session_id,
          status: promotedMember.status,
          emailVerified: promotedMember.email_verified,
          createdAt: promotedMember.created_at,
          updatedAt: promotedMember.updated_at,
        } : member,
        message: `${member.email} can now access the admin dashboard and has lifetime membership.`,
      });
    }

    if (action !== 'grant-premium') {
      return jsonResponse(400, { error: 'Unsupported memberships action' });
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
