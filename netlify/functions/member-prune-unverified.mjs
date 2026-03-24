import { deleteExpiredUnverifiedMembers, getSqlClient, jsonResponse } from './_member.mjs';

export async function handler() {
  try {
    const sql = getSqlClient();
    const deletedCount = await deleteExpiredUnverifiedMembers(sql);
    return jsonResponse(200, { ok: true, deletedCount });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to prune unverified accounts' });
  }
}
