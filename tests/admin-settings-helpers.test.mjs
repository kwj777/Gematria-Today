import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs/promises';

import {
  buildTestEmailContent,
  maskEmail,
  normalizeEmailTemplate,
  normalizeSettings,
  normalizeThemeCatalog,
  resolveTestEmailRecipient,
  serializeSettings,
  toKebabCase,
} from '../netlify/functions/admin-settings.mjs';

// ---------- toKebabCase ----------

test('toKebabCase lowercases, hyphenates, and trims surrounding hyphens', () => {
  assert.equal(toKebabCase('Hello World!'), 'hello-world');
  assert.equal(toKebabCase('  Mixed CASE_123  '), 'mixed-case-123');
  assert.equal(toKebabCase('---foo---'), 'foo');
});

test('toKebabCase caps the result at 64 characters', () => {
  assert.equal(toKebabCase('a'.repeat(200)).length, 64);
});

test('toKebabCase returns "" for input that has no alphanumerics', () => {
  assert.equal(toKebabCase(''), '');
  assert.equal(toKebabCase('!!!'), '');
  assert.equal(toKebabCase('   '), '');
});

// ---------- normalizeSettings ----------

test('normalizeSettings trims and normalizes each plain-string field', () => {
  const result = normalizeSettings({
    stripeAccountId: '  acct_123  ',
    stripePublishableKey: ' pk_test_xyz ',
    sendgridFromEmail: '  No-Reply@Example.COM  ',
    sendgridFromName: '  Gematria.Today  ',
    sendgridReplyToEmail: '  Support@EXAMPLE.com  ',
    publicSiteUrl: 'https://gematria.today/',
  });
  assert.equal(result.stripeAccountId, 'acct_123');
  assert.equal(result.stripePublishableKey, 'pk_test_xyz');
  // Email fields are lowercased.
  assert.equal(result.sendgridFromEmail, 'no-reply@example.com');
  assert.equal(result.sendgridReplyToEmail, 'support@example.com');
  // From-name is trimmed but case-preserved.
  assert.equal(result.sendgridFromName, 'Gematria.Today');
  // publicSiteUrl strips a trailing slash.
  assert.equal(result.publicSiteUrl, 'https://gematria.today');
});

test('normalizeSettings uppercases the GA measurement id and caps it at 32 chars', () => {
  const result = normalizeSettings({ googleAnalyticsMeasurementId: '  g-abc123  ' });
  assert.equal(result.googleAnalyticsMeasurementId, 'G-ABC123');
  const long = normalizeSettings({ googleAnalyticsMeasurementId: 'g-' + 'x'.repeat(200) });
  assert.equal(long.googleAnalyticsMeasurementId.length, 32);
});

test('normalizeSettings leaves googleAnalyticsMeasurementId as undefined when absent', () => {
  // Distinguishing "absent" from "empty string" matters for partial PATCH updates.
  const result = normalizeSettings({});
  assert.equal(result.googleAnalyticsMeasurementId, undefined);
});

test('normalizeSettings sets themeCatalog/privateThemeCatalog to undefined when absent (partial-update semantics)', () => {
  const result = normalizeSettings({});
  assert.equal(result.themeCatalog, undefined);
  assert.equal(result.privateThemeCatalog, undefined);
});

test('normalizeSettings normalizes themeCatalog when present', () => {
  const result = normalizeSettings({
    themeCatalog: { activeThemeSlug: 'X', presets: [{ name: 'Some Name', slug: 'X' }] },
  });
  assert.ok(result.themeCatalog);
  assert.equal(result.themeCatalog.activeThemeSlug, 'x');
});

test('normalizeSettings coerces every "replace*" flag to a strict boolean', () => {
  const result = normalizeSettings({
    replaceStripeSecretKey: 'truthy-string',
    replaceStripeWebhookSigningSecret: 0,
    replaceSendgridApiKey: 1,
  });
  assert.equal(result.replaceStripeSecretKey, true);
  assert.equal(result.replaceStripeWebhookSigningSecret, false);
  assert.equal(result.replaceSendgridApiKey, true);
});

test('normalizeSettings returns null siteModules for non-object input (partial-update semantics)', () => {
  // null = "no change" — the handler skips writing site_modules when this is null.
  assert.equal(normalizeSettings({}).siteModules, null);
  assert.equal(normalizeSettings({ siteModules: null }).siteModules, null);
  assert.equal(normalizeSettings({ siteModules: 'string' }).siteModules, null);
});

test('normalizeSettings coerces siteModules values to booleans and ignores unknown keys', () => {
  const result = normalizeSettings({
    siteModules: { blog: 1, forum: 0, unknown_module: true },
  });
  assert.equal(result.siteModules.blog, true);
  assert.equal(result.siteModules.forum, false);
  assert.equal(Object.hasOwn(result.siteModules, 'unknown_module'), false);
});

// ---------- normalizeThemeCatalog (admin write path) ----------

test('normalizeThemeCatalog drops presets whose name is blank or whose derived slug is empty', () => {
  // When slug is missing, it falls back to a kebab-case of the name, so the
  // drop cases are: blank name, or name/slug that kebab-cases to empty.
  const result = normalizeThemeCatalog({
    presets: [
      { name: 'Good', slug: 'good' },
      { name: '', slug: 'no-name-but-has-slug' },
      { name: '   ', slug: 'whitespace-name' },
      { name: '!!!', slug: '!!!' }, // kebab-case of both is empty
    ],
  });
  assert.equal(result.presets.length, 1);
  assert.equal(result.presets[0].slug, 'good');
});

test('normalizeThemeCatalog derives slug from name when slug is missing', () => {
  const result = normalizeThemeCatalog({
    presets: [{ name: 'My Custom Theme', slug: '' }],
  });
  assert.equal(result.presets[0].slug, 'my-custom-theme');
});

test('normalizeThemeCatalog deduplicates by slug (first occurrence wins)', () => {
  const result = normalizeThemeCatalog({
    presets: [
      { name: 'First', slug: 'shared' },
      { name: 'Second', slug: 'shared' },
    ],
  });
  assert.equal(result.presets.length, 1);
  assert.equal(result.presets[0].name, 'First');
});

test('normalizeThemeCatalog filters variables to only --bs-* style entries with non-blank values', () => {
  const result = normalizeThemeCatalog({
    presets: [{
      name: 'X', slug: 'x',
      variables: {
        '--bs-primary': '#abcdef',
        'primary': '#bad',
        '--bs-blank': '   ',
      },
    }],
  });
  assert.ok('--bs-primary' in result.presets[0].variables);
  assert.ok(!('primary' in result.presets[0].variables));
  assert.ok(!('--bs-blank' in result.presets[0].variables));
});

test('normalizeThemeCatalog caps individual variable values at 120 chars', () => {
  const result = normalizeThemeCatalog({
    presets: [{
      name: 'X', slug: 'x',
      variables: { '--bs-primary': '#' + 'a'.repeat(200) },
    }],
  });
  assert.equal(result.presets[0].variables['--bs-primary'].length, 120);
});

test('normalizeThemeCatalog caps customCss at 4000 chars and name at 80 chars', () => {
  const result = normalizeThemeCatalog({
    presets: [{
      name: 'a'.repeat(200),
      slug: 'long-name',
      customCss: 'a'.repeat(5000),
    }],
  });
  assert.equal(result.presets[0].name.length, 80);
  assert.equal(result.presets[0].customCss.length, 4000);
});

test('normalizeThemeCatalog falls back activeThemeSlug to "default" when requested slug is not present', () => {
  const result = normalizeThemeCatalog({
    activeThemeSlug: 'nonexistent',
    presets: [{ name: 'X', slug: 'x' }],
  });
  assert.equal(result.activeThemeSlug, 'default');
});

test('normalizeThemeCatalog accepts activeThemeSlug when it matches an existing preset', () => {
  const result = normalizeThemeCatalog({
    activeThemeSlug: 'x',
    presets: [{ name: 'X', slug: 'x' }],
  });
  assert.equal(result.activeThemeSlug, 'x');
});

// ---------- normalizeEmailTemplate ----------

test('normalizeEmailTemplate lowercases the id and trims subject/body', () => {
  const result = normalizeEmailTemplate({
    id: '  WELCOME_DAY_1  ',
    subject: '  Welcome!  ',
    body: '  Hello world  ',
  });
  assert.deepEqual(result, { id: 'welcome_day_1', subject: 'Welcome!', body: 'Hello world' });
});

test('normalizeEmailTemplate tolerates missing fields with empty defaults', () => {
  assert.deepEqual(normalizeEmailTemplate({}), { id: '', subject: '', body: '' });
});

// ---------- serializeSettings (SECURITY: never leaks secrets back to the client) ----------

test('serializeSettings never returns the raw stripe secret key or webhook signing secret', () => {
  const result = serializeSettings({
    stripeAccountId: 'acct_1',
    stripePublishableKey: 'pk_test',
    stripeSecretKey: 'sk_test_supersecret',
    stripeWebhookSigningSecret: 'whsec_supersecret',
  });
  assert.equal(Object.hasOwn(result, 'stripeSecretKey'), false);
  assert.equal(Object.hasOwn(result, 'stripeWebhookSigningSecret'), false);
  // Defense-in-depth: the secret values must NOT appear anywhere in the
  // serialized payload (as either a key or a value).
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('sk_test_supersecret'));
  assert.ok(!serialized.includes('whsec_supersecret'));
  // The "has*" boolean flags signal presence.
  assert.equal(result.hasStripeSecretKey, true);
  assert.equal(result.hasStripeWebhookSigningSecret, true);
});

test('serializeSettings never returns the raw sendgrid api key', () => {
  const result = serializeSettings({
    sendgridApiKey: 'SG.real-secret-key',
    sendgridFromEmail: 'no-reply@example.com',
  });
  assert.equal(Object.hasOwn(result, 'sendgridApiKey'), false);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('SG.real-secret-key'));
  assert.equal(result.hasSendgridApiKey, true);
  // emailDeliveryConfigured requires BOTH apiKey AND fromEmail.
  assert.equal(result.emailDeliveryConfigured, true);
});

test('serializeSettings reports emailDeliveryConfigured=false when only one of {apiKey, fromEmail} is set', () => {
  assert.equal(
    serializeSettings({ sendgridApiKey: 'SG.x' }).emailDeliveryConfigured,
    false,
  );
  assert.equal(
    serializeSettings({ sendgridFromEmail: 'no-reply@example.com' }).emailDeliveryConfigured,
    false,
  );
});

test('serializeSettings preserves the publishable Stripe key (intended public field)', () => {
  const result = serializeSettings({ stripePublishableKey: 'pk_test_xyz' });
  assert.equal(result.stripePublishableKey, 'pk_test_xyz');
});

test('serializeSettings always returns the full DEFAULT_SITE_MODULES shape', () => {
  // Even when no siteModules are stored, the response must include every
  // documented module key so the admin UI can render checkbox controls.
  const result = serializeSettings({});
  assert.equal(typeof result.siteModules, 'object');
  for (const key of ['blog', 'membership', 'forum', 'gemabot', 'knowbot']) {
    assert.ok(key in result.siteModules, `expected siteModules.${key} to be present`);
  }
});

test('serializeSettings normalizes the embedded themeCatalog and privateThemeCatalog through normalizeThemeCatalog', () => {
  const result = serializeSettings({
    themeCatalog: { presets: [{ name: 'X', slug: '' }] },
    privateThemeCatalog: { presets: [{ name: 'Y', slug: 'y' }] },
  });
  assert.equal(result.themeCatalog.presets[0].slug, 'x'); // derived from name
  assert.equal(result.privateThemeCatalog.presets[0].slug, 'y');
});

// ---------- test email delivery ----------

test('maskEmail keeps the domain and hides most of the local part', () => {
  assert.equal(maskEmail('kevin@example.com'), 'ke***@example.com');
  assert.equal(maskEmail('  Kevin@Example.COM '), 'ke***@example.com');
  assert.equal(maskEmail('a@example.com'), 'a*@example.com');
});

test('maskEmail returns empty for anything that is not an address', () => {
  assert.equal(maskEmail(''), '');
  assert.equal(maskEmail('not-an-email'), '');
  assert.equal(maskEmail('@example.com'), '');
});

test('resolveTestEmailRecipient prefers the admin account, then reply-to, then sender', () => {
  assert.equal(
    resolveTestEmailRecipient({ adminEmail: 'Admin@Example.com', replyTo: 'help@example.com', fromEmail: 'no-reply@example.com' }),
    'admin@example.com',
  );
  assert.equal(
    resolveTestEmailRecipient({ adminEmail: '', replyTo: 'help@example.com', fromEmail: 'no-reply@example.com' }),
    'help@example.com',
  );
  assert.equal(
    resolveTestEmailRecipient({ adminEmail: null, replyTo: '', fromEmail: 'no-reply@example.com' }),
    'no-reply@example.com',
  );
  assert.equal(resolveTestEmailRecipient({}), '');
});

test('the test email never takes its recipient from the request', async () => {
  const source = await fs.readFile(new URL('../netlify/functions/admin-settings.mjs', import.meta.url), 'utf8');
  const action = source.slice(source.indexOf('async function sendTestEmail'), source.indexOf('export async function handler'));

  // An authenticated session that can mail an arbitrary address is a relay.
  // The recipient comes from the admin's own account and the saved settings.
  assert.doesNotMatch(action, /parseBody/);
  assert.match(action, /resolveTestEmailRecipient/);
  assert.match(action, /applyRateLimit/);
  assert.match(action, /validateCsrfRequest/);
});

test('buildTestEmailContent escapes the requesting username in the html', () => {
  const { subject, text, html } = buildTestEmailContent({
    username: '<img src=x onerror=alert(1)>',
    sentAt: Date.UTC(2026, 8, 16, 12, 0, 0),
  });

  assert.match(subject, /delivery test/i);
  assert.match(text, /Wed, 16 Sep 2026 12:00:00 GMT/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

// ---------- a save must not blank what it does not mention ----------

test('normalizeSettings leaves out fields the request never mentioned', () => {
  const result = normalizeSettings({ siteModules: { blog: true } });

  // undefined means "keep what is stored" -- '' would mean "clear it".
  assert.equal(result.stripeAccountId, undefined);
  assert.equal(result.stripePublishableKey, undefined);
  assert.equal(result.sendgridFromEmail, undefined);
  assert.equal(result.sendgridFromName, undefined);
  assert.equal(result.sendgridReplyToEmail, undefined);
  assert.equal(result.publicSiteUrl, undefined);
  assert.equal(result.googleAnalyticsMeasurementId, undefined);
});

test('normalizeSettings still clears a field that is sent empty on purpose', () => {
  // The email settings form always sends all of its inputs, so blanking the
  // reply-to box has to keep working.
  const result = normalizeSettings({ sendgridReplyToEmail: '', sendgridFromEmail: 'no-reply@example.com' });
  assert.equal(result.sendgridReplyToEmail, '');
  assert.equal(result.sendgridFromEmail, 'no-reply@example.com');
});

test('saving site modules or a theme does not carry email or Stripe settings', async () => {
  // These forms used to resubmit the whole settings blob from page state. When
  // the settings GET had failed, that state was empty and the save wiped the
  // stored sender address, reply-to and public site URL.
  for (const file of ['../page-scripts/admin-1.js', '../page-scripts/admin-super-admin-1.js']) {
    const source = await fs.readFile(new URL(file, import.meta.url), 'utf8');
    const saves = source.split("method: 'PUT'").slice(1);
    for (const save of saves) {
      const body = save.slice(0, save.indexOf('})'));
      if (body.includes('siteModules:') || body.includes('themeCatalog:')) {
        assert.doesNotMatch(body, /sendgrid/i, `${file}: a module/theme save still sends sendgrid fields`);
        assert.doesNotMatch(body, /stripe/i, `${file}: a module/theme save still sends stripe fields`);
        assert.doesNotMatch(body, /publicSiteUrl/, `${file}: a module/theme save still sends publicSiteUrl`);
      }
    }
  }
});

test('a failed settings load is reported instead of showing empty fields', async () => {
  const source = await fs.readFile(new URL('../page-scripts/admin-1.js', import.meta.url), 'utf8');
  assert.match(source, /Could not load email delivery settings/);
});
