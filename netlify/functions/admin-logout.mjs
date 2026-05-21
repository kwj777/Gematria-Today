import { AUTH_COOKIES, clearMemberTierCookie, clearSessionCookie, deleteSession, jsonResponse } from './_auth.mjs';
import { getAuthenticatedUser, requireHttpMethod } from './_admin.mjs';

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'POST');
  if (methodError) return methodError;

  const clearCookies = [...clearSessionCookie(AUTH_COOKIES.admin), ...clearMemberTierCookie()];

  try {
    const { sql, sessionToken } = await getAuthenticatedUser(event, { requireAuth: false });
    if (sql && sessionToken) {
      await deleteSession(sql, sessionToken);
    }
    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearCookies });
  } catch {
    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearCookies });
  }
}
