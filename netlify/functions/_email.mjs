import { fetchWithTimeout } from './_security.mjs';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getEmailDeliveryConfig() {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
  const fromEmail = normalizeEmail(process.env.SENDGRID_FROM_EMAIL);
  const fromName = String(process.env.SENDGRID_FROM_NAME || 'EndTimes.Today').trim();
  const replyTo = normalizeEmail(process.env.SENDGRID_REPLY_TO_EMAIL);
  const appBaseUrl = String(process.env.PUBLIC_SITE_URL || process.env.URL || '').trim().replace(/\/$/, '');

  return {
    enabled: Boolean(apiKey && fromEmail),
    apiKey,
    fromEmail,
    fromName,
    replyTo,
    appBaseUrl,
  };
}

export async function sendTransactionalEmail({ toEmail, subject, text, html }) {
  const config = getEmailDeliveryConfig();
  if (!config.enabled) {
    return { delivered: false, delivery: 'onscreen-preview', reason: 'sendgrid-not-configured' };
  }

  const normalizedToEmail = normalizeEmail(toEmail);
  if (!normalizedToEmail) {
    return { delivered: false, delivery: 'onscreen-preview', reason: 'missing-recipient-email' };
  }

  const payload = {
    from: {
      email: config.fromEmail,
      name: config.fromName,
    },
    personalizations: [
      {
        to: [{ email: normalizedToEmail }],
        subject: String(subject || '').trim() || 'Notification from EndTimes.Today',
      },
    ],
    content: [
      { type: 'text/plain', value: String(text || '').trim() },
      { type: 'text/html', value: String(html || '').trim() },
    ],
  };

  if (config.replyTo) {
    payload.reply_to = { email: config.replyTo };
  }

  const response = await fetchWithTimeout(SENDGRID_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, DEFAULT_TIMEOUT_MS);

  if (!response.ok) {
    const details = await response.text();
    throw Object.assign(new Error(`SendGrid request failed with status ${response.status}`), {
      statusCode: 502,
      details,
    });
  }

  return { delivered: true, delivery: 'email' };
}

export async function sendRecoveryEmail({ toEmail, username, recoveryCode, expiresAt, role, recoveryType }) {
  const config = getEmailDeliveryConfig();
  if (!config.enabled) {
    throw Object.assign(new Error('Account recovery email delivery is not configured'), {
      statusCode: 503,
      reason: 'sendgrid-not-configured',
    });
  }

  const normalizedToEmail = normalizeEmail(toEmail);
  if (!normalizedToEmail) {
    throw Object.assign(new Error('Account recovery email recipient is missing'), {
      statusCode: 503,
      reason: 'missing-recipient-email',
    });
  }

  const accountLabel = role === 'admin' ? 'admin' : 'member';
  const expiresText = new Date(expiresAt).toUTCString();
  const safeUsername = escapeHtml(username);
  const safeRecoveryCode = escapeHtml(recoveryCode);
  const recoveryUrl = config.appBaseUrl
    ? `${config.appBaseUrl}/${accountLabel === 'admin' ? 'admin.html' : 'member.html'}`
    : null;

  const subject = recoveryType === 'forgot-userid'
    ? `Your ${accountLabel} username for EndTimes.Today`
    : `Your ${accountLabel} password reset code for EndTimes.Today`;

  const text = recoveryType === 'forgot-userid'
    ? [
      'You requested a username reminder for your EndTimes.Today account.',
      `Username: ${username}`,
      `Recovery code: ${recoveryCode}`,
      `Expires: ${expiresText}`,
      recoveryUrl ? `Sign in: ${recoveryUrl}` : null,
    ].filter(Boolean).join('\n')
    : [
      'You requested a password reset code for your EndTimes.Today account.',
      `Username: ${username}`,
      `Recovery code: ${recoveryCode}`,
      `Expires: ${expiresText}`,
      recoveryUrl ? `Reset your password: ${recoveryUrl}` : null,
    ].filter(Boolean).join('\n');

  const html = recoveryType === 'forgot-userid'
    ? `
      <p>You requested a username reminder for your EndTimes.Today account.</p>
      <p><strong>Username:</strong> ${safeUsername}</p>
      <p><strong>Recovery code:</strong> <code>${safeRecoveryCode}</code></p>
      <p><strong>Expires:</strong> ${escapeHtml(expiresText)}</p>
      ${recoveryUrl ? `<p><a href="${escapeHtml(recoveryUrl)}">Open the sign-in page</a></p>` : ''}
    `
    : `
      <p>You requested a password reset code for your EndTimes.Today account.</p>
      <p><strong>Username:</strong> ${safeUsername}</p>
      <p><strong>Recovery code:</strong> <code>${safeRecoveryCode}</code></p>
      <p><strong>Expires:</strong> ${escapeHtml(expiresText)}</p>
      ${recoveryUrl ? `<p><a href="${escapeHtml(recoveryUrl)}">Open the password reset page</a></p>` : ''}
    `;

  return sendTransactionalEmail({
    toEmail: normalizedToEmail,
    subject,
    text,
    html,
  });
}
