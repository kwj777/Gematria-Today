import { getSqlClient, jsonResponse } from './_member.mjs';
import { pruneSecurityData } from './_security.mjs';

export async function handler() {
  try {
    const sql = getSqlClient();
    const result = await pruneSecurityData(sql);

    return jsonResponse(200, {
      ok: true,
      ...result,
      cleanedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      error: error.message || 'Failed to prune security logs and cache rows',
    }, error.headers || {});
  }
}
