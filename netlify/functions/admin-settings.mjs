import { getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';
import { clearCachedJson, logRequestAudit } from './_security.mjs';

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
    replaceStripeSecretKey: Boolean(body.replaceStripeSecretKey),
    replaceStripeWebhookSigningSecret: Boolean(body.replaceStripeWebhookSigningSecret),
  };
}

function serializeSettings(settings = {}) {
  return {
    stripeAccountId: settings.stripeAccountId || '',
    stripePublishableKey: settings.stripePublishableKey || '',
    hasStripeSecretKey: Boolean(settings.stripeSecretKey),
    hasStripeWebhookSigningSecret: Boolean(settings.stripeWebhookSigningSecret),
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

      return jsonResponse(200, { settings: serializeSettings(settings) });
    }

    if (event.httpMethod === 'POST') {
      const action = String(parseBody(event).action ?? event.queryStringParameters?.action ?? '').trim().toLowerCase();

      if (action !== 'clear-cache') {
        return jsonResponse(400, { error: 'Unsupported admin settings action' });
      }

      const cacheResult = await clearCachedJson(sql);
      await logRequestAudit(sql, event, {
        route: 'admin-settings',
        action: 'clear_cache',
        outcome: 'success',
        metadata: { deletedCount: cacheResult.deletedCount, userId: user.id },
      });

      return jsonResponse(200, { cleared: true, deletedCount: cacheResult.deletedCount });
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      const settings = normalizeSettings(parseBody(event));
      const existingRows = await sql`
        SELECT setting_key, setting_value
        FROM admin_settings
        WHERE setting_key LIKE 'stripe_%'
      `;
      const existingSettings = { ...DEFAULT_SETTINGS };
      for (const row of existingRows) {
        if (row.setting_key === 'stripe_account_id') existingSettings.stripeAccountId = row.setting_value || '';
        if (row.setting_key === 'stripe_publishable_key') existingSettings.stripePublishableKey = row.setting_value || '';
        if (row.setting_key === 'stripe_secret_key') existingSettings.stripeSecretKey = row.setting_value || '';
        if (row.setting_key === 'stripe_webhook_signing_secret') existingSettings.stripeWebhookSigningSecret = row.setting_value || '';
      }

      const nextSettings = {
        stripeAccountId: settings.stripeAccountId,
        stripePublishableKey: settings.stripePublishableKey,
        stripeSecretKey: settings.replaceStripeSecretKey ? settings.stripeSecretKey : existingSettings.stripeSecretKey,
        stripeWebhookSigningSecret: settings.replaceStripeWebhookSigningSecret
          ? settings.stripeWebhookSigningSecret
          : existingSettings.stripeWebhookSigningSecret,
      };

      const pairs = [
        ['stripe_account_id', nextSettings.stripeAccountId],
        ['stripe_publishable_key', nextSettings.stripePublishableKey],
        ['stripe_secret_key', nextSettings.stripeSecretKey],
        ['stripe_webhook_signing_secret', nextSettings.stripeWebhookSigningSecret],
      ];

      for (const [key, value] of pairs) {
        await sql`
          INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
          VALUES (${key}, ${value || null}, ${user.id}, NOW())
          ON CONFLICT (setting_key)
          DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        `;
      }

      return jsonResponse(200, { saved: true, settings: serializeSettings(nextSettings) });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Settings request failed' });
  }
}
