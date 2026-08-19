import { jsonResponse } from './_auth.mjs';
import { listConfiguredOAuthProviders } from './_oauth.mjs';

// The sign-in buttons are rendered from this list, so a provider whose
// credentials are not configured in the environment never shows a button that
// would dead-end in an error page.
export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    return jsonResponse(200, { providers: listConfiguredOAuthProviders() });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to list sign-in providers' });
  }
}
