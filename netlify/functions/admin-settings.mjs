import { getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';
import { clearCachedJson, logRequestAudit } from './_security.mjs';

const DEFAULT_SETTINGS = {
  stripeAccountId: '',
  stripePublishableKey: '',
  stripeSecretKey: '',
  stripeWebhookSigningSecret: '',
  sendgridFromEmail: '',
  sendgridFromName: '',
  sendgridReplyToEmail: '',
  sendgridApiKey: '',
  publicSiteUrl: '',
  welcomeEmailSubject: '',
  welcomeEmailBody: '',
};

function normalizeSettings(body = {}) {
  return {
    stripeAccountId: String(body.stripeAccountId ?? '').trim(),
    stripePublishableKey: String(body.stripePublishableKey ?? '').trim(),
    stripeSecretKey: String(body.stripeSecretKey ?? '').trim(),
    stripeWebhookSigningSecret: String(body.stripeWebhookSigningSecret ?? '').trim(),
    replaceStripeSecretKey: Boolean(body.replaceStripeSecretKey),
    replaceStripeWebhookSigningSecret: Boolean(body.replaceStripeWebhookSigningSecret),
    sendgridFromEmail: String(body.sendgridFromEmail ?? '').trim().toLowerCase(),
    sendgridFromName: String(body.sendgridFromName ?? '').trim(),
    sendgridReplyToEmail: String(body.sendgridReplyToEmail ?? '').trim().toLowerCase(),
    sendgridApiKey: String(body.sendgridApiKey ?? '').trim(),
    publicSiteUrl: String(body.publicSiteUrl ?? '').trim().replace(/\/$/, ''),
    welcomeEmailSubject: String(body.welcomeEmailSubject ?? '').trim(),
    welcomeEmailBody: String(body.welcomeEmailBody ?? '').trim(),
    replaceSendgridApiKey: Boolean(body.replaceSendgridApiKey),
  };
}

function serializeSettings(settings = {}) {
  return {
    stripeAccountId: settings.stripeAccountId || '',
    stripePublishableKey: settings.stripePublishableKey || '',
    hasStripeSecretKey: Boolean(settings.stripeSecretKey),
    hasStripeWebhookSigningSecret: Boolean(settings.stripeWebhookSigningSecret),
    sendgridFromEmail: settings.sendgridFromEmail || '',
    sendgridFromName: settings.sendgridFromName || '',
    sendgridReplyToEmail: settings.sendgridReplyToEmail || '',
    publicSiteUrl: settings.publicSiteUrl || '',
    welcomeEmailSubject: settings.welcomeEmailSubject || '',
    welcomeEmailBody: settings.welcomeEmailBody || '',
    hasSendgridApiKey: Boolean(settings.sendgridApiKey),
    emailDeliveryConfigured: Boolean(settings.sendgridApiKey && settings.sendgridFromEmail),
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
          OR setting_key LIKE 'sendgrid_%'
          OR setting_key = 'public_site_url'
          OR setting_key LIKE 'welcome_email_%'
        ORDER BY setting_key ASC
      `;

      const settings = { ...DEFAULT_SETTINGS };
      for (const row of rows) {
        if (row.setting_key === 'stripe_account_id') settings.stripeAccountId = row.setting_value || '';
        if (row.setting_key === 'stripe_publishable_key') settings.stripePublishableKey = row.setting_value || '';
        if (row.setting_key === 'stripe_secret_key') settings.stripeSecretKey = row.setting_value || '';
        if (row.setting_key === 'stripe_webhook_signing_secret') settings.stripeWebhookSigningSecret = row.setting_value || '';
        if (row.setting_key === 'sendgrid_from_email') settings.sendgridFromEmail = row.setting_value || '';
        if (row.setting_key === 'sendgrid_from_name') settings.sendgridFromName = row.setting_value || '';
        if (row.setting_key === 'sendgrid_reply_to_email') settings.sendgridReplyToEmail = row.setting_value || '';
        if (row.setting_key === 'sendgrid_api_key') settings.sendgridApiKey = row.setting_value || '';
        if (row.setting_key === 'public_site_url') settings.publicSiteUrl = row.setting_value || '';
        if (row.setting_key === 'welcome_email_subject') settings.welcomeEmailSubject = row.setting_value || '';
        if (row.setting_key === 'welcome_email_body') settings.welcomeEmailBody = row.setting_value || '';
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
          OR setting_key LIKE 'sendgrid_%'
          OR setting_key = 'public_site_url'
          OR setting_key LIKE 'welcome_email_%'
      `;
      const existingSettings = { ...DEFAULT_SETTINGS };
      for (const row of existingRows) {
        if (row.setting_key === 'stripe_account_id') existingSettings.stripeAccountId = row.setting_value || '';
        if (row.setting_key === 'stripe_publishable_key') existingSettings.stripePublishableKey = row.setting_value || '';
        if (row.setting_key === 'stripe_secret_key') existingSettings.stripeSecretKey = row.setting_value || '';
        if (row.setting_key === 'stripe_webhook_signing_secret') existingSettings.stripeWebhookSigningSecret = row.setting_value || '';
        if (row.setting_key === 'sendgrid_from_email') existingSettings.sendgridFromEmail = row.setting_value || '';
        if (row.setting_key === 'sendgrid_from_name') existingSettings.sendgridFromName = row.setting_value || '';
        if (row.setting_key === 'sendgrid_reply_to_email') existingSettings.sendgridReplyToEmail = row.setting_value || '';
        if (row.setting_key === 'sendgrid_api_key') existingSettings.sendgridApiKey = row.setting_value || '';
        if (row.setting_key === 'public_site_url') existingSettings.publicSiteUrl = row.setting_value || '';
        if (row.setting_key === 'welcome_email_subject') existingSettings.welcomeEmailSubject = row.setting_value || '';
        if (row.setting_key === 'welcome_email_body') existingSettings.welcomeEmailBody = row.setting_value || '';
      }

      const nextSettings = {
        stripeAccountId: settings.stripeAccountId,
        stripePublishableKey: settings.stripePublishableKey,
        stripeSecretKey: settings.replaceStripeSecretKey ? settings.stripeSecretKey : existingSettings.stripeSecretKey,
        stripeWebhookSigningSecret: settings.replaceStripeWebhookSigningSecret
          ? settings.stripeWebhookSigningSecret
          : existingSettings.stripeWebhookSigningSecret,
        sendgridFromEmail: settings.sendgridFromEmail,
        sendgridFromName: settings.sendgridFromName,
        sendgridReplyToEmail: settings.sendgridReplyToEmail,
        sendgridApiKey: settings.replaceSendgridApiKey ? settings.sendgridApiKey : existingSettings.sendgridApiKey,
        publicSiteUrl: settings.publicSiteUrl,
        welcomeEmailSubject: settings.welcomeEmailSubject,
        welcomeEmailBody: settings.welcomeEmailBody,
      };

      const pairs = [
        ['stripe_account_id', nextSettings.stripeAccountId],
        ['stripe_publishable_key', nextSettings.stripePublishableKey],
        ['stripe_secret_key', nextSettings.stripeSecretKey],
        ['stripe_webhook_signing_secret', nextSettings.stripeWebhookSigningSecret],
        ['sendgrid_from_email', nextSettings.sendgridFromEmail],
        ['sendgrid_from_name', nextSettings.sendgridFromName],
        ['sendgrid_reply_to_email', nextSettings.sendgridReplyToEmail],
        ['sendgrid_api_key', nextSettings.sendgridApiKey],
        ['public_site_url', nextSettings.publicSiteUrl],
        ['welcome_email_subject', nextSettings.welcomeEmailSubject],
        ['welcome_email_body', nextSettings.welcomeEmailBody],
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
