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

The site includes a lightweight module toggle system in `site-modules.js`.

- Default modules are configured in `DEFAULT_MODULES`.
- Page elements can be tied to modules using `data-module="forum"` (or comma-separated values).
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

1. Open `site-modules.js`.
2. Change values in `DEFAULT_MODULES` to `true`/`false` for the modules you want.
3. Deploy.

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

`member_schema.sql` is the Phase 2 migration that adds member account fields, profile records, and saved calculation history on top of the shared `users` table.

The membership implementation now exposes member auth/profile/history endpoints (`member-register`, `member-login`, `member-session`, `member-profile`, and `member-history`) plus a published `/member.html` dashboard for registration, profile editing, and saved searches.

Stripe-backed membership upgrades now use recurring yearly Checkout sessions via `member-payment-checkout` and `member-payment-confirm`. Stripe credentials can now be managed from the admin back-office via `admin-settings`, with environment variables such as `STRIPE_SECRET_KEY` still supported as a fallback. Configure `STRIPE_WEBHOOK_SIGNING_SECRET` (or its admin-settings equivalent) and point Stripe webhooks to `/api/stripe-webhook` so renewal/cancellation events keep membership state in sync.

Member and admin account recovery now sends transactional emails through SendGrid only. Recovery requests require outbound email to be configured; recovery codes and username reminders are no longer shown on screen. SendGrid sender details/API credentials can now be saved from the admin back-office via `admin-settings`, with environment variables still supported as a fallback.

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
