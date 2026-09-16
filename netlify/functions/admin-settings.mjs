import { getAuthenticatedUser, jsonResponse, parseBody, routeByHttpMethod, upsertSetting } from './_admin.mjs';
import { validateCsrfRequest } from './_auth.mjs';
import { getEmailDeliveryConfig, sendTransactionalEmail } from './_email.mjs';
import { applyRateLimit, clearCachedJson, logRequestAudit } from './_security.mjs';
import { DEFAULT_SITE_MODULES } from './_site-modules.mjs';

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
  googleAnalyticsMeasurementId: '',
  siteModules: {},
  themeCatalog: {
    activeThemeSlug: 'default',
    presets: [],
  },
  privateThemeCatalog: {
    activeThemeSlug: 'default',
    presets: [],
  },
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

export function normalizeSettings(body = {}) {
  const hasThemeCatalog = Object.hasOwn(body, 'themeCatalog');
  const hasPrivateThemeCatalog = Object.hasOwn(body, 'privateThemeCatalog');
  const hasGoogleAnalyticsMeasurementId = Object.hasOwn(body, 'googleAnalyticsMeasurementId');
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
    googleAnalyticsMeasurementId: hasGoogleAnalyticsMeasurementId
      ? String(body.googleAnalyticsMeasurementId ?? '').trim().toUpperCase().slice(0, 32)
      : undefined,
    replaceSendgridApiKey: Boolean(body.replaceSendgridApiKey),
    siteModules: normalizeSiteModules(body.siteModules),
    themeCatalog: hasThemeCatalog ? normalizeThemeCatalog(body.themeCatalog) : undefined,
    privateThemeCatalog: hasPrivateThemeCatalog ? normalizeThemeCatalog(body.privateThemeCatalog) : undefined,
  };
}

export function toKebabCase(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function normalizeThemeCatalog(input = {}) {
  const rawPresets = Array.isArray(input?.presets) ? input.presets : [];
  const seenSlugs = new Set();
  const presets = rawPresets.reduce((result, preset) => {
    const name = String(preset?.name ?? '').trim().slice(0, 80);
    const derivedSlug = toKebabCase(preset?.slug || name);
    if (!name || !derivedSlug || seenSlugs.has(derivedSlug)) {
      return result;
    }

    const rawVariables = (preset?.variables && typeof preset.variables === 'object') ? preset.variables : {};
    const variables = Object.entries(rawVariables).reduce((acc, [key, value]) => {
      const variableKey = String(key || '').trim();
      if (!variableKey.startsWith('--')) {
        return acc;
      }
      const variableValue = String(value ?? '').trim().slice(0, 120);
      if (!variableValue) {
        return acc;
      }
      acc[variableKey] = variableValue;
      return acc;
    }, {});

    result.push({
      name,
      slug: derivedSlug,
      description: String(preset?.description ?? '').trim().slice(0, 240),
      variables,
      customCss: String(preset?.customCss ?? '').trim().slice(0, 4000),
    });
    seenSlugs.add(derivedSlug);
    return result;
  }, []);

  const requestedSlug = toKebabCase(input?.activeThemeSlug);
  const activeThemeSlug = (requestedSlug && presets.some((preset) => preset.slug === requestedSlug))
    ? requestedSlug
    : 'default';
  return { activeThemeSlug, presets };
}

export function normalizeEmailTemplate(body = {}) {
  return {
    id: String(body.id ?? '').trim().toLowerCase(),
    subject: String(body.subject ?? '').trim(),
    body: String(body.body ?? '').trim(),
  };
}

export function serializeSettings(settings = {}) {
  const normalizedThemeCatalog = normalizeThemeCatalog(settings.themeCatalog || {});
  const normalizedPrivateThemeCatalog = normalizeThemeCatalog(settings.privateThemeCatalog || {});
  return {
    stripeAccountId: settings.stripeAccountId || '',
    stripePublishableKey: settings.stripePublishableKey || '',
    hasStripeSecretKey: Boolean(settings.stripeSecretKey),
    hasStripeWebhookSigningSecret: Boolean(settings.stripeWebhookSigningSecret),
    sendgridFromEmail: settings.sendgridFromEmail || '',
    sendgridFromName: settings.sendgridFromName || '',
    sendgridReplyToEmail: settings.sendgridReplyToEmail || '',
    publicSiteUrl: settings.publicSiteUrl || '',
    googleAnalyticsMeasurementId: settings.googleAnalyticsMeasurementId || '',
    hasSendgridApiKey: Boolean(settings.sendgridApiKey),
    emailDeliveryConfigured: Boolean(settings.sendgridApiKey && settings.sendgridFromEmail),
    siteModules: settings.siteModules && typeof settings.siteModules === 'object'
      ? { ...DEFAULT_SITE_MODULES, ...normalizeSiteModules(settings.siteModules) }
      : { ...DEFAULT_SITE_MODULES },
    themeCatalog: normalizedThemeCatalog,
    privateThemeCatalog: normalizedPrivateThemeCatalog,
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
    if (row.setting_key === 'google_analytics_measurement_id') settings.googleAnalyticsMeasurementId = row.setting_value || '';
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
    if (row.setting_key === 'theme_catalog') {
      try {
        settings.themeCatalog = normalizeThemeCatalog(JSON.parse(row.setting_value || '{}'));
      } catch {
        settings.themeCatalog = normalizeThemeCatalog({});
      }
    }
    if (row.setting_key === 'private_theme_catalog') {
      try {
        settings.privateThemeCatalog = normalizeThemeCatalog(JSON.parse(row.setting_value || '{}'));
      } catch {
        settings.privateThemeCatalog = normalizeThemeCatalog({});
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
      OR setting_key = 'google_analytics_measurement_id'
      OR setting_key = 'site_modules'
      OR setting_key = 'theme_catalog'
      OR setting_key = 'private_theme_catalog'
      OR setting_key LIKE 'email_template_%'
    ORDER BY setting_key ASC
  `;
}

export function maskEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) {
    return '';
  }
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 1))}${domain}`;
}

// The test goes to the admin's own account email, falling back to the
// addresses already configured for sending. There is deliberately no
// recipient field: a signed-in session should not be able to mail anyone.
export function resolveTestEmailRecipient({ adminEmail, replyTo, fromEmail } = {}) {
  const candidates = [adminEmail, replyTo, fromEmail];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().toLowerCase();
    if (normalized.includes('@')) {
      return normalized;
    }
  }
  return '';
}

export function buildTestEmailContent({ username, sentAt }) {
  const stamp = new Date(sentAt).toUTCString();
  const text = [
    'This is a Gematria.Today email delivery test.',
    `Requested from the admin dashboard by ${username} at ${stamp}.`,
    'If this message arrived, SendGrid is accepting and delivering mail for this site -- verification and account-recovery emails use the same sender.',
  ].join('\n');
  const html = `
    <p>This is a <strong>Gematria.Today</strong> email delivery test.</p>
    <p>Requested from the admin dashboard by <strong>${escapeHtml(username)}</strong> at ${escapeHtml(stamp)}.</p>
    <p>If this message arrived, SendGrid is accepting and delivering mail for this site — verification and account-recovery emails use the same sender.</p>
  `;
  return { subject: 'Gematria.Today email delivery test', text, html };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Until this existed, the only way to find out whether SendGrid was working was
// to watch a real signup fail. The reply carries the interpreted SendGrid error
// so the admin can fix the key or sender address without reading logs.
async function sendTestEmail({ sql, sessionToken, user, event }) {
  if (!validateCsrfRequest(event, sessionToken)) {
    return jsonResponse(403, { error: 'Request blocked. Reload the admin dashboard and try again.' });
  }

  await applyRateLimit(sql, event, {
    scope: 'admin-settings-test-email',
    key: user.id,
    limit: 5,
    windowMs: 15 * 60_000,
    blockMs: 15 * 60_000,
    message: 'Too many test emails. Wait a few minutes before sending another.',
  });

  const config = await getEmailDeliveryConfig(sql);
  const adminRows = await sql`SELECT email FROM users WHERE id = ${user.id} LIMIT 1`;
  const recipient = resolveTestEmailRecipient({
    adminEmail: adminRows[0]?.email,
    replyTo: config.replyTo,
    fromEmail: config.fromEmail,
  });

  const respond = async (result) => {
    await logRequestAudit(sql, event, {
      route: 'admin-settings',
      action: 'send_test_email',
      outcome: result.sent ? 'success' : 'failed',
      metadata: { userId: user.id, recipient: maskEmail(recipient), reason: result.reason || null },
    });
    return jsonResponse(200, { ...result, recipient: maskEmail(recipient) });
  };

  if (!config.enabled) {
    return respond({
      sent: false,
      reason: config.apiKey
        ? 'No From email is configured. Add a verified sender address and save before testing.'
        : 'No SendGrid API key is stored. Add one and save before testing.',
    });
  }

  if (!recipient) {
    return respond({
      sent: false,
      reason: 'No address to send to. Add an email to your admin account, or set a reply-to address.',
    });
  }

  const { subject, text, html } = buildTestEmailContent({ username: user.username, sentAt: Date.now() });

  try {
    const delivery = await sendTransactionalEmail({ toEmail: recipient, subject, text, html, sql });
    return respond(delivery.delivered
      ? { sent: true }
      : { sent: false, reason: delivery.reason || 'The email was not sent.' });
  } catch (error) {
    return respond({ sent: false, reason: error.message || 'SendGrid rejected the request.' });
  }
}

export async function handler(event) {
  try {
    const { sql, sessionToken, user } = await getAuthenticatedUser(event);

    const handlePutPatch = async () => {
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
          await upsertSetting(sql, key, value || null, user.id);
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
      if (settings.themeCatalog !== undefined && user.role !== 'super_admin') {
        return jsonResponse(403, { error: 'Only super admins can update themes' });
      }
      if (settings.privateThemeCatalog !== undefined && user.role !== 'super_admin') {
        return jsonResponse(403, { error: 'Only super admins can update themes' });
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
        googleAnalyticsMeasurementId: settings.googleAnalyticsMeasurementId === undefined
          ? existingSettings.googleAnalyticsMeasurementId
          : settings.googleAnalyticsMeasurementId,
        siteModules: settings.siteModules === null ? existingSettings.siteModules : {
          ...DEFAULT_SITE_MODULES,
          ...settings.siteModules,
        },
        themeCatalog: settings.themeCatalog === undefined ? existingSettings.themeCatalog : settings.themeCatalog,
        privateThemeCatalog: settings.privateThemeCatalog === undefined
          ? existingSettings.privateThemeCatalog
          : settings.privateThemeCatalog,
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
        ['google_analytics_measurement_id', nextSettings.googleAnalyticsMeasurementId],
        ['site_modules', JSON.stringify(nextSettings.siteModules || {})],
        ['theme_catalog', JSON.stringify(nextSettings.themeCatalog || normalizeThemeCatalog({}))],
        ['private_theme_catalog', JSON.stringify(nextSettings.privateThemeCatalog || normalizeThemeCatalog({}))],
      ];

      for (const [key, value] of pairs) {
        await upsertSetting(sql, key, value || null, user.id);
      }

      const shouldRefreshCrawlerCache = JSON.stringify(existingSettings.siteModules) !== JSON.stringify(nextSettings.siteModules);
      if (shouldRefreshCrawlerCache) {
        await Promise.all([
          clearCachedJson(sql, { route: 'public-site-modules' }),
          clearCachedJson(sql, { route: 'robots-txt' }),
          clearCachedJson(sql, { route: 'sitemap-xml' }),
        ]);
      }

      const rows = await getSettingsRows(sql);
      const { emailTemplates } = mapSettingsFromRows(rows);

      return jsonResponse(200, { saved: true, settings: serializeSettings(nextSettings), emailTemplates });
    };

    return await routeByHttpMethod(event, {
      GET: async () => {
        const rows = await getSettingsRows(sql);
        const { settings, emailTemplates } = mapSettingsFromRows(rows);
        return jsonResponse(200, { settings: serializeSettings(settings), emailTemplates });
      },

      POST: async () => {
        const action = String(parseBody(event).action ?? event.queryStringParameters?.action ?? '').trim().toLowerCase();

        if (action === 'send-test-email') {
          return sendTestEmail({ sql, sessionToken, user, event });
        }

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
      },

      PUT: handlePutPatch,
      PATCH: handlePutPatch,
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Settings request failed' });
  }
}
