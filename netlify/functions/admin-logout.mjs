import { AUTH_COOKIES, clearSessionCookie, deleteSession, jsonResponse } from './_auth.mjs';
import { getAuthenticatedUser, requireHttpMethod } from './_admin.mjs';

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'POST');
  if (methodError) return methodError;

  try {
    const { sql, sessionToken } = await getAuthenticatedUser(event, { requireAuth: false });
    if (sql && sessionToken) {
      await deleteSession(sql, sessionToken);
    }
    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.admin) });
  } catch {
    return jsonResponse(200, { authenticated: false }, { 'set-cookie': clearSessionCookie(AUTH_COOKIES.admin) });
  }
}
