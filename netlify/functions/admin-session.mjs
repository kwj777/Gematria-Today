import { AUTH_COOKIES, clearSessionCookie, createSession, createSessionCookie, getOptionalAuthenticatedSession, jsonResponse } from './_auth.mjs';
import { ensureAdminSchema, getAuthenticatedUser, requireHttpMethod, syncBootstrapAdminUser } from './_admin.mjs';

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'GET');
  if (methodError) return methodError;

  try {
    const { user } = await getAuthenticatedUser(event);
    return jsonResponse(200, { authenticated: true, user });
  } catch (error) {
    try {
      const sql = error.sql;
      if (sql) {
        await ensureAdminSchema(sql);
        await syncBootstrapAdminUser(sql);

        const optionalSession = await getOptionalAuthenticatedSession(event, { sql });
        const isAdmin = optionalSession?.user && (
          optionalSession.user.role === 'admin'
          || optionalSession.user.role === 'super_admin'
          || optionalSession.user.isAdmin
        );
        if (isAdmin) {
          const session = await createSession(sql, optionalSession.user.id);
          return jsonResponse(
            200,
            {
              authenticated: true,
              user: {
                ...optionalSession.user,
                isAdmin: true,
              },
            },
            { 'set-cookie': createSessionCookie(session.token, session.expiresAt, AUTH_COOKIES.admin) },
          );
        }
      }
    } catch {
      // fall through to unauthorized response
    }

    return jsonResponse(
      200,
      { authenticated: false },
      { 'set-cookie': clearSessionCookie(AUTH_COOKIES.admin) },
    );
  }
}
