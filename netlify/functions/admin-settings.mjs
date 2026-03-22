import { getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';

const DEFAULT_SETTINGS = {
  stripeAccountId: '',
  stripePublishableKey: '',
  stripeSecretKey: '',
  stripeWebhookSigningSecret: '',
};

function normalizeSettings(body = {}) {
  return {
    stripeAccountId: String(body.stripeAccountId ?? '').trim(),
    stripePublishableKey: String(body.stripePublishableKey ?? '').trim(),
    stripeSecretKey: String(body.stripeSecretKey ?? '').trim(),
    stripeWebhookSigningSecret: String(body.stripeWebhookSigningSecret ?? '').trim(),
  };
}

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);

    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT setting_key, setting_value
        FROM admin_settings
        WHERE setting_key LIKE 'stripe_%'
        ORDER BY setting_key ASC
      `;

      const settings = { ...DEFAULT_SETTINGS };
      for (const row of rows) {
        if (row.setting_key === 'stripe_account_id') settings.stripeAccountId = row.setting_value || '';
        if (row.setting_key === 'stripe_publishable_key') settings.stripePublishableKey = row.setting_value || '';
        if (row.setting_key === 'stripe_secret_key') settings.stripeSecretKey = row.setting_value || '';
        if (row.setting_key === 'stripe_webhook_signing_secret') settings.stripeWebhookSigningSecret = row.setting_value || '';
      }

      return jsonResponse(200, { settings });
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      const settings = normalizeSettings(parseBody(event));
      const pairs = [
        ['stripe_account_id', settings.stripeAccountId],
        ['stripe_publishable_key', settings.stripePublishableKey],
        ['stripe_secret_key', settings.stripeSecretKey],
        ['stripe_webhook_signing_secret', settings.stripeWebhookSigningSecret],
      ];

      for (const [key, value] of pairs) {
        await sql`
          INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
          VALUES (${key}, ${value || null}, ${user.id}, NOW())
          ON CONFLICT (setting_key)
          DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        `;
      }

      return jsonResponse(200, { saved: true, settings });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Settings request failed' });
  }
}
