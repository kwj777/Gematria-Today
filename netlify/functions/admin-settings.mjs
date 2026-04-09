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
  siteModules: {},
};

const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: 'welcome_day_1',
    name: 'Welcome email (Day +1)',
    subject: '',
    body: '',
    placeholders: ['{{first_name}}', '{{blog_link}}', '{{sender_name}}', '{{site_name}}'],
  },
];

const DEFAULT_SITE_MODULES = Object.freeze({
  forum: true,
  knowbot: true,
  gemabot: true,
  news: true,
  blog: true,
  membership: true,
});

function getDefaultEmailTemplates() {
  return DEFAULT_EMAIL_TEMPLATES.map((template) => ({ ...template }));
}

function normalizeSiteModules(rawValue = null) {
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  return Object.keys(DEFAULT_SITE_MODULES).reduce((result, moduleName) => {
    if (Object.hasOwn(rawValue, moduleName)) {
      result[moduleName] = Boolean(rawValue[moduleName]);
    }
    return result;
  }, {});
}

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
    replaceSendgridApiKey: Boolean(body.replaceSendgridApiKey),
    siteModules: normalizeSiteModules(body.siteModules),
  };
}

function normalizeEmailTemplate(body = {}) {
  return {
    id: String(body.id ?? '').trim().toLowerCase(),
    subject: String(body.subject ?? '').trim(),
    body: String(body.body ?? '').trim(),
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
    hasSendgridApiKey: Boolean(settings.sendgridApiKey),
    emailDeliveryConfigured: Boolean(settings.sendgridApiKey && settings.sendgridFromEmail),
    siteModules: settings.siteModules && typeof settings.siteModules === 'object'
      ? { ...DEFAULT_SITE_MODULES, ...normalizeSiteModules(settings.siteModules) }
      : { ...DEFAULT_SITE_MODULES },
  };
}

function mapSettingsFromRows(rows = []) {
  const settings = { ...DEFAULT_SETTINGS, siteModules: { ...DEFAULT_SITE_MODULES } };
  const emailTemplates = getDefaultEmailTemplates();
  const templateById = new Map(emailTemplates.map((template) => [template.id, template]));

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
    if (row.setting_key === 'site_modules') {
      try {
        const parsedModules = JSON.parse(row.setting_value || '{}');
        settings.siteModules = {
          ...DEFAULT_SITE_MODULES,
          ...(normalizeSiteModules(parsedModules) || {}),
        };
      } catch {
        settings.siteModules = { ...DEFAULT_SITE_MODULES };
      }
    }

    const subjectMatch = /^email_template_(.+)_subject$/.exec(row.setting_key || '');
    if (subjectMatch) {
      const template = templateById.get(subjectMatch[1]);
      if (template) template.subject = row.setting_value || '';
    }

    const bodyMatch = /^email_template_(.+)_body$/.exec(row.setting_key || '');
    if (bodyMatch) {
      const template = templateById.get(bodyMatch[1]);
      if (template) template.body = row.setting_value || '';
    }
  }

  return { settings, emailTemplates };
}

function getSettingsRows(sql) {
  return sql`
    SELECT setting_key, setting_value
    FROM admin_settings
    WHERE setting_key LIKE 'stripe_%'
      OR setting_key LIKE 'sendgrid_%'
      OR setting_key = 'public_site_url'
      OR setting_key = 'site_modules'
      OR setting_key LIKE 'email_template_%'
    ORDER BY setting_key ASC
  `;
}

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);

    if (event.httpMethod === 'GET') {
      const rows = await getSettingsRows(sql);
      const { settings, emailTemplates } = mapSettingsFromRows(rows);
      return jsonResponse(200, { settings: serializeSettings(settings), emailTemplates });
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
      const body = parseBody(event);

      if (body.emailTemplate) {
        const templateInput = normalizeEmailTemplate(body.emailTemplate);
        const template = getDefaultEmailTemplates().find((item) => item.id === templateInput.id);
        if (!template) {
          return jsonResponse(400, { error: 'Unknown email template id' });
        }

        const pairs = [
          [`email_template_${templateInput.id}_subject`, templateInput.subject],
          [`email_template_${templateInput.id}_body`, templateInput.body],
        ];

        for (const [key, value] of pairs) {
          await sql`
            INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
            VALUES (${key}, ${value || null}, ${user.id}, NOW())
            ON CONFLICT (setting_key)
            DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
          `;
        }

        const rows = await getSettingsRows(sql);
        const { settings, emailTemplates } = mapSettingsFromRows(rows);
        return jsonResponse(200, {
          saved: true,
          settings: serializeSettings(settings),
          emailTemplates,
          updatedTemplateId: templateInput.id,
        });
      }

      const settings = normalizeSettings(body);
      if (settings.siteModules !== null && user.role !== 'super_admin') {
        return jsonResponse(403, { error: 'Only super admins can update site modules' });
      }

      const existingRows = await getSettingsRows(sql);
      const { settings: existingSettings } = mapSettingsFromRows(existingRows);

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
        siteModules: settings.siteModules === null ? existingSettings.siteModules : {
          ...DEFAULT_SITE_MODULES,
          ...settings.siteModules,
        },
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
        ['site_modules', JSON.stringify(nextSettings.siteModules || {})],
      ];

      for (const [key, value] of pairs) {
        await sql`
          INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
          VALUES (${key}, ${value || null}, ${user.id}, NOW())
          ON CONFLICT (setting_key)
          DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        `;
      }

      const rows = await getSettingsRows(sql);
      const { emailTemplates } = mapSettingsFromRows(rows);

      return jsonResponse(200, { saved: true, settings: serializeSettings(nextSettings), emailTemplates });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Settings request failed' });
  }
}
