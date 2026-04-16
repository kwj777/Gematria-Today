import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getAuthenticatedUser, requireHttpMethod } from './_admin.mjs';
import { clearSessionCookie, AUTH_COOKIES } from './_auth.mjs';

const GUIDE_PATH_PATTERN = /^\/([a-z0-9-]+)-site-adaptation-guide\.(html|md)$/i;

function getRequestPath(event) {
  if (event?.rawUrl) {
    try {
      return new URL(event.rawUrl).pathname;
    } catch {
      // ignore parse failures and fall back to event.path
    }
  }
  return String(event?.path || '/');
}

function unauthorizedRedirect() {
  return {
    statusCode: 302,
    headers: {
      location: '/admin.html?auth=required',
      'cache-control': 'no-store',
      'set-cookie': clearSessionCookie(AUTH_COOKIES.admin),
      'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
    },
    body: '',
  };
}

function forbiddenResponse() {
  return {
    statusCode: 403,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
    },
    body: 'Forbidden: super admin access required.',
  };
}

function notFoundResponse() {
  return {
    statusCode: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
    body: 'Not found',
  };
}

export async function handler(event) {
  const methodError = requireHttpMethod(event, 'GET');
  if (methodError) return methodError;

  let user;
  try {
    ({ user } = await getAuthenticatedUser(event));
  } catch {
    return unauthorizedRedirect();
  }

  if (user?.role !== 'super_admin') {
    return forbiddenResponse();
  }

  const requestPath = getRequestPath(event);
  const match = requestPath.match(GUIDE_PATH_PATTERN);
  if (!match) {
    return notFoundResponse();
  }

  const [, guideSlug, extension] = match;
  const fileName = `${guideSlug}-site-adaptation-guide.${extension.toLowerCase()}`;
  const filePath = path.join(process.cwd(), 'public', fileName);

  try {
    const content = await readFile(filePath, 'utf8');
    return {
      statusCode: 200,
      headers: {
        'content-type': extension.toLowerCase() === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
      },
      body: content,
    };
  } catch {
    return notFoundResponse();
  }
}
