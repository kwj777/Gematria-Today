# Gematria

A web-based Gematria calculator application built with HTML, CSS, JavaScript, and Netlify serverless functions backed by a Neon (PostgreSQL) database.

## Project Structure

```
.
├── index.html                     # Static front-end pages live at repo root
├── calculator.html
├── name-calculator.html
├── gematria-results.html
├── admin.html
├── blog.html
├── faq.html
├── contact.html
├── privacy.html
├── terms.html
├── disclaimer.html
├── accessibility.html
├── theme.css
├── site-modules.js
├── assets/                        # Images, icons, SVGs
├── netlify/
│   ├── functions/                 # Netlify serverless functions (Node.js / .mjs)
│   └── edge-functions/            # Netlify edge functions
├── sql/
│   ├── admin_schema.sql           # Admin/auth/content schema
│   └── member_schema.sql          # Member profile/history schema
├── netlify.toml                   # Netlify configuration
├── package.json
```

Pages are served directly from the repository root; Netlify's `publish` directory is `.` (see `netlify.toml`). Edit the root files in place — there is no separate source directory.

## Modular site builds (Forum / SiteSeeker / GemaBot / etc.)

The site includes a lightweight module toggle system. Super admins flip the switches in the admin back-office; they are stored in `admin_settings.site_modules`.

- Every module is **on** unless an admin saved it off. The defaults live in `DEFAULT_SITE_MODULES` (`netlify/functions/_site-modules.mjs`), mirrored by `DEFAULT_MODULES` in `site-modules.js`.
- The switches are enforced server-side: each module's endpoints call `assertSiteModuleEnabled` and answer `404` while it is off — forum (`member-forum`), blog (`public-posts`, `/blog.xml`, `/blog/:slug`), SiteSeeker (`public-site-chatbot`), GemaBot (`ai-agent-learnings`, saving new chat sessions) and membership (new sign-ups by password or OAuth, and checkout; existing members keep signing in, their dashboard and the billing portal).
- `site-modules.js` is part of `site-bundle.js`, so it runs on every page. A page whose `<main>` has `data-module-page="<module>"` shows an "unavailable" notice in place of its content while that module is off.
- Page elements can be tied to modules using `data-module="forum"` (or comma-separated values, all of which must be on).
- Module selection is **locked for non-admin users**.
- Runtime overrides (`window.SITE_MODULE_OVERRIDES`, localStorage key `gematria.siteModules` — legacy `endtimes.siteModules` is read as a fallback and migrated forward — and `?modules=...`) are honored only when the current authenticated admin session is a `super_admin`.

### Super Admin policy

- The seeded `KevAdmin` account is the only `super_admin`.
- Other admin-capable users remain `admin` and cannot use module override controls.

### Available module keys

- `forum`
- `knowbot`
- `gemabot`
- `blog`
- `membership`

### How to create a custom build

1. Switch the modules you do not want off in the admin back-office (super admins only).
2. To change what a fresh database starts with, change `DEFAULT_SITE_MODULES` in `netlify/functions/_site-modules.mjs` and `DEFAULT_MODULES` in `site-modules.js` together, then deploy. A saved switch always wins over the defaults.

## Lines of Code

As of July 2026 the repository contains approximately **71,400 lines** across HTML, CSS, JavaScript/MJS, SQL, TOML, and JSON files.

That is the raw figure `npm run count-lines` reports, so it counts the generated `site-bundle.js`, `package-lock.json`, and the minified files under `assets/vendor/`. Excluding those, hand-written source is roughly 68,800 lines.

This number is a point-in-time snapshot and nothing enforces it — recount rather than trusting it:

```bash
npm run count-lines
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Deploy to [Netlify](https://netlify.com) or run locally with the [Netlify CLI](https://docs.netlify.com/cli/get-started/).

## Importing a blog post from Markdown

Use the mapping helper script to convert a markdown file into the JSON payload expected by `/api/admin-posts`:

```bash
npm run map:markdown-post -- --file ./my-post.md
```

Useful flags:

- `--status published` to output a publish-ready payload (`draft` by default)
- `--show-on-homepage` to set `showOnHomepage=true`
- `--hide-from-blog` to set `hideFromBlog=true`
- `--output curl` to output a copy/paste `curl` request template

Expected source format is the editorial template style:

- `**SEO-friendly title:** ...` → `title`
- `**Meta description (≤160 chars):** ...` → `summary`
- `**Tags (3-5):** ...` → `tag` (normalized to comma-separated values)
- `**Suggested word count:** ...` → marks where body extraction begins
- Everything after `**Suggested word count:**` is treated as the body and used to calculate estimated `readTime`


## Screenshot fallback (repo-local)

If your Codex/agent session does not expose a browser screenshot tool, you can capture screenshots from this repo with Playwright:

1. Install dependencies (includes Playwright):
   ```bash
   npm install
   ```
2. Install the Chromium browser binary once:
   ```bash
   npx playwright install chromium
   ```
3. Start the app/server you want to capture (example Netlify local dev):
   ```bash
   npx netlify dev
   ```
4. Capture a screenshot:
   ```bash
   npm run screenshot -- --url http://127.0.0.1:8888 --output artifacts/home.png --full-page
   ```

The `--url` flag is required. `--output` defaults to `artifacts/screenshot.png`.
Optional flags:

- `--hide-selector ".css-selector"` can be passed multiple times to hide specific elements before capture.
- `--blur-selector ".css-selector"` can be passed multiple times to blur specific elements before capture.

## Sync GitHub repo with Netlify

This repo includes a GitHub Actions workflow at `.github/workflows/sync-netlify-deploy.yml` that keeps Netlify deployments in sync with `main`.

### Setup steps

1. In Netlify, open your site settings and create/copy a **Build Hook** URL.
2. In GitHub, add a repository secret named `NETLIFY_BUILD_HOOK` with that URL.
3. Push to `main` (or run the **Sync Netlify Deploy** workflow manually) to trigger a Netlify deploy from GitHub.

If the secret is missing, the workflow fails fast with a clear error message so deployment drift is visible.

## Database Migrations

Apply the SQL files in order when bootstrapping a database:

1. `sql/admin_schema.sql`
2. `sql/member_schema.sql`
3. `sql/words_schema.sql`

`words_schema.sql` creates the `words` table (with its `LOWER(word)` and `gematria_value` indexes) that the calculator, value search, `/w/` and `/v/` word pages and the words sitemap read. No function creates it at runtime, so a database bootstrapped without it answers all of those with `relation "words" does not exist`. Every statement is `IF NOT EXISTS`, so it is safe to rerun against an existing database.

`admin_schema.sql` creates the `kevandmel` admin account, and the functions create the `KevAdmin` super admin on their first cold start against an empty database. Both start with a password hash that is committed to this repository, so set new passwords for them as soon as the database is up. Neither the SQL file nor a cold start ever resets the password of an account that already exists.

`member_schema.sql` is the Phase 2 migration that adds member account fields, profile records, and saved calculation history on top of the shared `users` table.

The membership implementation now exposes member auth/profile/history endpoints (`member-register`, `member-login`, `member-session`, `member-profile`, and `member-history`) plus a published `/member.html` dashboard for registration, profile editing, and saved searches.

Stripe-backed membership upgrades now use recurring yearly Checkout sessions via `member-payment-checkout` and `member-payment-confirm`. Stripe credentials can now be managed from the admin back-office via `admin-settings`, with environment variables such as `STRIPE_SECRET_KEY` still supported as a fallback. Configure `STRIPE_WEBHOOK_SIGNING_SECRET` (or its admin-settings equivalent) and point Stripe webhooks to `/api/stripe-webhook` so renewal/cancellation events keep membership state in sync.

Member and admin account recovery now sends transactional emails through SendGrid only. Recovery requests require outbound email to be configured; recovery codes and username reminders are no longer shown on screen. SendGrid sender details/API credentials can now be saved from the admin back-office via `admin-settings`, with environment variables still supported as a fallback.

## Social sign-in (OAuth)

Members can create an account or sign in with Google instead of a password. The flow is the standard
authorization-code exchange across three endpoints:

- `/api/member-oauth-providers` — lists the providers whose credentials are configured. The sign-in
  buttons stay hidden until this reports one, so an unconfigured deploy never shows a button that
  dead-ends in an error.
- `/api/member-oauth-start?provider=google` — signs a `state` value, stores it in a short-lived
  `HttpOnly` cookie, and redirects to the provider.
- `/api/member-oauth-callback` — the provider's redirect target. Verifies `state` against the cookie,
  exchanges the code with the PKCE verifier, validates the `id_token` claims (`iss`, `aud`, `exp`,
  `nonce` — all required), then creates or links the membership and issues the normal member session
  cookie.

PKCE (RFC 7636, S256) is used even though this is a confidential client: the verifier is generated at
start, kept in the `HttpOnly` state cookie, and never placed in the `state` parameter, which travels
through the provider. An OIDC provider that returns no `id_token` is refused rather than read from the
userinfo endpoint, because a userinfo response carries no audience, issuer or nonce to check.

Accounts created this way have no password: `users.password_hash` holds a sentinel that can never
verify. A member who wants one sets it through the existing account-recovery flow.

### Account linking

When a provider profile matches an existing account by email, the provider identity is linked to that
account — but only when the provider asserts the email is verified. An unverified provider email is
refused with `link_requires_password`, because linking on an unverified claim is the account-takeover
path. Emails matching a staff account are refused outright; staff sign in through the admin form, and
that check runs on the stored-identity path too, so a member promoted to admin after linking cannot
sign in with Google either.

Linking also reads the **local** row's provenance, not just the provider's. Anyone can register any
address by password; that account sits `pending` and its password is inert only because pending rows
cannot sign in. Linking activates the row, which would quietly arm that password against an account
the member now believes is theirs — so when the local row was never verified, its password is replaced
with the OAuth-only sentinel and its sessions are revoked before the row is adopted. The member is
told this happened and pointed at account recovery to set a new password.

A new account whose provider email is unverified is created as `pending` and receives the usual
verification email; no session is issued until that link is used. Retrying later re-sends the link
rather than dead-ending.

Usernames are the public badge slug (`/b/<username>`), so signups get one generated from the provider
**display name** — never the email address, which would permanently publish a guess at the member's
address on every badge and forum post — and checked against `MEMBER_USERNAME_PATTERN` before insert.

### Setup

1. In the Google Cloud console, create an OAuth 2.0 Client ID of type **Web application**.
2. Add `https://<your-domain>/api/member-oauth-callback` as an **Authorized redirect URI** — once per
   domain that serves the site, deploy previews included.
3. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in Netlify. Both are required; a
   half-configured provider is treated as unconfigured.
4. Make sure `PUBLIC_SITE_URL` (or Netlify's `URL`) matches the domain in step 2. The redirect URI must
   be byte-identical between the authorize call and the token exchange, or Google rejects it.

### New database table

`member_oauth_identities` — one row per (provider, provider account), created by both
`sql/member_schema.sql` and the runtime `ensureOAuthSchema` migration.

## DDoS and abuse protection

The serverless layer now includes:

- per-IP and per-account rate limiting stored in Postgres
- response caching for high-volume public endpoints
- request audit logging with request fingerprints
- periodic retention cleanup for request logs and cache rows
- endpoint-level load-shedding flags for expensive public routes
- fetch timeouts for Wordnik and Stripe requests
- stricter response security headers for the site and API routes

### New database tables

`sql/admin_schema.sql` now provisions these shared protection tables:

- `request_rate_limits`
- `function_response_cache`
- `request_audit_log`

### Relevant environment variables

Set these in Netlify to tune protection behavior:

- `PROTECTION_HIGH_ALERT_MODE=true` to temporarily disable expensive routes
- `DISABLE_EXPENSIVE_PUBLIC_ENDPOINTS=true` to disable expensive anonymous endpoints
- `WORDNIK_TIMEOUT_MS=5000` to control Wordnik fetch timeouts
- `STRIPE_TIMEOUT_MS=5000` to control Stripe fetch timeouts
- `REQUEST_AUDIT_LOG_RETENTION_DAYS=30` to retain request audit rows for a fixed window
- `FUNCTION_RESPONSE_CACHE_GRACE_DAYS=2` to keep expired cache rows briefly before cleanup
- `REQUEST_RATE_LIMIT_RETENTION_DAYS=7` to prune stale rate-limit records
- `ALERT_MEMBER_LOGIN_SPIKE_5M=40` for login spike alerts in admin reports
- `ALERT_MEMBER_REGISTER_SPIKE_5M=20` for register spike alerts in admin reports
- `ALERT_PUBLIC_FEEDS_SPIKE_5M=60` for expensive public feeds spike alerts
- `ALERT_WORDNIK_DEFINITION_SPIKE_5M=120` for definition endpoint spike alerts
- `ALERT_WORDNIK_RELATED_WORDS_SPIKE_5M=80` for related words endpoint spike alerts
- `SENDGRID_API_KEY=...` to enable transactional email delivery for admin/member account recovery
- `SENDGRID_FROM_EMAIL=...` verified sender address used for recovery emails
- `SENDGRID_FROM_NAME="Gematria.Today"` optional sender display name shown in recovery emails
- `SENDGRID_REPLY_TO_EMAIL=...` optional reply-to address for recovery emails
- `PUBLIC_SITE_URL=https://example.com` optional canonical site URL used in recovery email links
- `GOOGLE_OAUTH_CLIENT_ID=...` and `GOOGLE_OAUTH_CLIENT_SECRET=...` to enable Google sign-in; leave unset to hide the buttons
- `OAUTH_STATE_SECRET=...` optional dedicated key for signing the OAuth `state` parameter (falls back to `CSRF_SECRET`)
### Dashboards, alerts, and high alert operations

- `admin-reports` now includes a `trafficAlerts` dashboard payload that highlights spike conditions for `/api/member-login`, `/api/member-register`, and expensive public endpoints.
- A scheduled `security-retention` function runs hourly to enforce DB retention for `request_audit_log`, `function_response_cache`, and stale `request_rate_limits` rows.
- Runbook + rehearsal checklist: [`docs-high-alert-mode-runbook.md`](./docs-high-alert-mode-runbook.md).

### Edge protection still required

Application-level protections help, but you should still put the site behind a managed WAF/DDoS mitigation service and configure path-specific rules for:

- `/api/member-login`
- `/api/member-register`
- `/api/member-payment-checkout`
- `/api/member-payment-confirm`
- `/api/stripe-webhook`
- `/api/wordnikRelatedWords`
- `/definition`

## License

See [LICENSE](./LICENSE) for details.
