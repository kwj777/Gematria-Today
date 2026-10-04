import {
  AUTH_COOKIES,
  clearSessionCookie,
  createAdminFlagCookie,
  createAdminSessionCookies,
  createSession,
  getOptionalAuthenticatedSession,
  jsonResponse,
  parseCookies,
} from './_auth.mjs';
import { ensureAdminSchema, getAuthenticatedUser, requireHttpMethod, syncBootstrapAdminUser } from './_admin.mjs';

function signedOutResponse() {
  return jsonResponse(
    200,
    { authenticated: false },
    { 'set-cookie': clearSessionCookie(AUTH_COOKIES.admin) },
  );
}

// Only a session the database refused signs the admin out. A Neon timeout or a
// cold-start DDL failure used to land in the same catch and expire a valid
// admin cookie; it is a 503 now, and the cookie is left for the next request.
function sessionCheckFailedResponse(error) {
  console.error('[admin-session] session check failed:', error);
  return jsonResponse(503, { error: 'We could not check your sign-in right now. Please try again.' });
}

function isAuthError(error) {
  return error?.statusCode === 401 || error?.statusCode === 403;
}

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'GET');
  if (methodError) return methodError;

  // Neither cookie means nobody to look up, here or in the fallback below.
  const cookies = parseCookies(event);
  if (!cookies[AUTH_COOKIES.admin] && !cookies[AUTH_COOKIES.member]) {
    return signedOutResponse();
  }

  try {
    const { user } = await getAuthenticatedUser(event);
    // Re-issued on each check so sessions that began before the flag existed
    // (or whose flag was cleared) get it too, with the session's own expiry.
    const sessionExpiry = new Date(user.expiresAt);
    const flagHeaders = Number.isNaN(sessionExpiry.getTime()) ? {} : { 'set-cookie': createAdminFlagCookie(sessionExpiry) };
    return jsonResponse(200, { authenticated: true, user }, flagHeaders);
  } catch (error) {
    if (!isAuthError(error)) {
      return sessionCheckFailedResponse(error);
    }

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
            { 'set-cookie': createAdminSessionCookies(session.token, session.expiresAt) },
          );
        }
      }
    } catch (fallbackError) {
      return sessionCheckFailedResponse(fallbackError);
    }

    return signedOutResponse();
  }
}
