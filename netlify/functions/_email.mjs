import { ensureAdminSchema } from './_admin.mjs';
import { fetchWithTimeout } from './_security.mjs';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function interpretSendGridError(status, body, fromEmail) {
  let firstMessage = '';
  if (body) {
    try {
      const parsed = JSON.parse(body);
      firstMessage = String(parsed?.errors?.[0]?.message || '').trim();
    } catch {
      firstMessage = String(body).slice(0, 200).trim();
    }
  }

  const lower = firstMessage.toLowerCase();
  const senderDomain = String(fromEmail || '').split('@')[1] || '';
  const senderHint = senderDomain ? ` (${senderDomain})` : '';

  if (status === 401 || lower.includes('permission denied') || lower.includes('authorization')) {
    return 'SendGrid rejected the API key. Check that SENDGRID_API_KEY is set and has Mail Send permission.';
  }
  if (status === 403) {
    if (lower.includes('verified sender') || lower.includes('sender identity')) {
      return `SendGrid rejected the From address${senderHint}: sender identity is not verified. Authenticate the sending domain in SendGrid or update the From email to a verified sender.`;
    }
    if (lower.includes('domain') && lower.includes('authenticat')) {
      return `SendGrid rejected the From address${senderHint}: sending domain is not authenticated. Complete Sender Authentication for the domain in SendGrid.`;
    }
    if (lower.includes('credit') || lower.includes('quota')) {
      return 'SendGrid rejected the request: account credit/quota exceeded.';
    }
    return `SendGrid rejected the request (403)${senderHint}. Most often this means the From address is not a verified sender — check SendGrid → Settings → Sender Authentication.${firstMessage ? ` Detail: ${firstMessage}` : ''}`;
  }
  if (status === 413) {
    return 'SendGrid rejected the request: payload too large.';
  }
  if (status === 429) {
    return 'SendGrid rate limit exceeded. Try again shortly.';
  }
  return `SendGrid request failed with status ${status}${firstMessage ? `: ${firstMessage}` : ''}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function getStoredEmailSetting(sql, key) {
  if (!sql) {
    return '';
  }

  await ensureAdminSchema(sql);
  const rows = await sql`
    SELECT setting_value
    FROM admin_settings
    WHERE setting_key = ${key}
    LIMIT 1
  `;

  return rows[0]?.setting_value || '';
}

export async function getEmailDeliveryConfig(sql = null) {
  const apiKey = (await getStoredEmailSetting(sql, 'sendgrid_api_key')) || String(process.env.SENDGRID_API_KEY || '').trim();
  const fromEmail = normalizeEmail((await getStoredEmailSetting(sql, 'sendgrid_from_email')) || process.env.SENDGRID_FROM_EMAIL);
  const fromName = String((await getStoredEmailSetting(sql, 'sendgrid_from_name')) || process.env.SENDGRID_FROM_NAME || 'Gematria.Today').trim();
  const replyTo = normalizeEmail((await getStoredEmailSetting(sql, 'sendgrid_reply_to_email')) || process.env.SENDGRID_REPLY_TO_EMAIL);
  const appBaseUrl = String((await getStoredEmailSetting(sql, 'public_site_url')) || process.env.PUBLIC_SITE_URL || process.env.URL || '').trim().replace(/\/$/, '');

  return {
    enabled: Boolean(apiKey && fromEmail),
    apiKey,
    fromEmail,
    fromName,
    replyTo,
    appBaseUrl,
  };
}

export async function sendTransactionalEmail({ toEmail, subject, text, html, sql = null }) {
  const config = await getEmailDeliveryConfig(sql);
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
        subject: String(subject || '').trim() || 'Notification from Gematria.Today',
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
    const message = interpretSendGridError(response.status, details, config.fromEmail);
    throw Object.assign(new Error(message), {
      statusCode: 502,
      details,
    });
  }

  return { delivered: true, delivery: 'email' };
}

export async function sendRecoveryEmail({ toEmail, username, recoveryCode, expiresAt, role, recoveryType, sql = null }) {
  const config = await getEmailDeliveryConfig(sql);
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
    ? `${config.appBaseUrl}/${accountLabel === 'admin' ? 'admin.html' : 'account-recovery.html'}${recoveryType === 'forgot-password' ? `?recovery_code=${encodeURIComponent(recoveryCode)}` : ''}`
    : null;

  const subject = recoveryType === 'forgot-userid'
    ? `Your ${accountLabel} username for Gematria.Today`
    : `Your ${accountLabel} password reset code for Gematria.Today`;

  const text = recoveryType === 'forgot-userid'
    ? [
      'You requested a username reminder for your Gematria.Today account.',
      `Username: ${username}`,
      `Recovery code: ${recoveryCode}`,
      `Expires: ${expiresText}`,
      recoveryUrl ? `Sign in: ${recoveryUrl}` : null,
    ].filter(Boolean).join('\n')
    : [
      'You requested a password reset code for your Gematria.Today account.',
      `Username: ${username}`,
      `Recovery code: ${recoveryCode}`,
      `Expires: ${expiresText}`,
      recoveryUrl ? `Reset your password: ${recoveryUrl}` : null,
    ].filter(Boolean).join('\n');

  const recoveryCodeHtml = `
    <span style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <code style="font-size:16px;padding:4px 8px;background:#f5f5f5;border-radius:4px;">${safeRecoveryCode}</code>
      <button
        type="button"
        onclick="navigator.clipboard && navigator.clipboard.writeText('${safeRecoveryCode}')"
        style="padding:4px 10px;border:1px solid #d0d7de;border-radius:6px;background:#ffffff;color:#24292f;cursor:pointer;font:inherit;"
      >
        Copy to clipboard
      </button>
    </span>
    <br>
    <span style="color:#57606a;font-size:12px;">If the button is unavailable in your email app, copy the recovery code manually.</span>
  `;

  const html = recoveryType === 'forgot-userid'
    ? `
      <p>You requested a username reminder for your Gematria.Today account.</p>
      <p><strong>Username:</strong> ${safeUsername}</p>
      <p><strong>Recovery code:</strong> ${recoveryCodeHtml}</p>
      <p><strong>Expires:</strong> ${escapeHtml(expiresText)}</p>
      ${recoveryUrl ? `<p><a href="${escapeHtml(recoveryUrl)}">Open the sign-in page</a></p>` : ''}
    `
    : `
      <p>You requested a password reset code for your Gematria.Today account.</p>
      <p><strong>Username:</strong> ${safeUsername}</p>
      <p><strong>Recovery code:</strong> ${recoveryCodeHtml}</p>
      <p><strong>Expires:</strong> ${escapeHtml(expiresText)}</p>
      ${recoveryUrl ? `<p><a href="${escapeHtml(recoveryUrl)}">Open the password reset page</a></p>` : ''}
    `;

  return sendTransactionalEmail({
    toEmail: normalizedToEmail,
    subject,
    text,
    html,
    sql,
  });
}

export function buildMemberVerificationUrl(appBaseUrl, verificationToken) {
  const base = String(appBaseUrl || '').trim().replace(/\/$/, '');
  if (!base || !verificationToken) {
    return null;
  }
  return `${base}/member.html?verify_email_token=${encodeURIComponent(verificationToken)}&auth=login#authSection`;
}

// Never throws. Registration creates the account before the email goes out, so
// a mail outage that throws out of here leaves a member who can neither verify
// nor sign up again under the same name -- and, because the caller's audit log
// runs after the send, leaves no record that delivery is broken. Every failure
// is reported as an undelivered result carrying the link the member needs.
export async function sendMemberVerificationEmail({ toEmail, username, verificationToken, expiresAt, sql = null }) {
  const config = await getEmailDeliveryConfig(sql);
  const normalizedToEmail = normalizeEmail(toEmail);
  // Composed before the early returns: when the email does not go out, this
  // link is the only way to finish a signup the account already committed to.
  const verificationUrl = buildMemberVerificationUrl(config.appBaseUrl, verificationToken);

  if (!config.enabled) {
    return { delivered: false, delivery: 'onscreen-preview', reason: 'sendgrid-not-configured', verificationUrl };
  }

  if (!normalizedToEmail) {
    return { delivered: false, delivery: 'onscreen-preview', reason: 'missing-recipient-email', verificationUrl };
  }

  const safeUsername = escapeHtml(username);
  const expiresText = new Date(expiresAt).toUTCString();

  const text = [
    'Welcome to Gematria.Today.',
    `Hello ${username}, please verify your email to activate your membership account.`,
    `Verification expires: ${expiresText}`,
    verificationUrl ? `Verify email: ${verificationUrl}` : `Verification token: ${verificationToken}`,
  ].join('\n');

  const html = `
    <p>Welcome to Gematria.Today.</p>
    <p>Hello <strong>${safeUsername}</strong>, please verify your email to activate your membership account.</p>
    <p><strong>Verification expires:</strong> ${escapeHtml(expiresText)}</p>
    ${verificationUrl
    ? `<p><a href="${escapeHtml(verificationUrl)}">Verify your email</a></p>`
    : `<p><strong>Verification token:</strong> <code>${escapeHtml(verificationToken)}</code></p>`}
  `;

  try {
    const delivery = await sendTransactionalEmail({
      toEmail: normalizedToEmail,
      subject: 'Verify your Gematria.Today membership email',
      text,
      html,
      sql,
    });

    return {
      ...delivery,
      verificationUrl,
    };
  } catch (error) {
    // A rejected key, an unverified sender, a rate limit or a timeout: the
    // reason is worth recording for the admin, but it describes our own
    // configuration, so callers keep it out of the visitor's response.
    return {
      delivered: false,
      delivery: 'send-failed',
      reason: error?.message || 'SendGrid request failed',
      verificationUrl,
    };
  }
}
