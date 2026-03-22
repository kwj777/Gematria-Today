# Gematria

A web-based Gematria calculator application built with HTML, CSS, JavaScript, and Netlify serverless functions backed by a Neon (PostgreSQL) database.

## Project Structure

```
.
├── public/                        # Static front-end files
│   ├── index.html
│   ├── calculator.html
│   ├── nameCalculator.html
│   ├── gematria-results.html
│   ├── admin.html
│   ├── blog.html
│   ├── news.html
│   ├── faq.html
│   ├── contact.html
│   ├── privacy.html
│   ├── terms.html
│   ├── disclaimer.html
│   ├── accessibility.html
│   ├── theme.css
│   └── netlify/functions/         # Deployed Netlify functions
├── netlify/
│   └── functions/                 # Netlify serverless functions (Node.js / .mjs)
├── sql/
│   ├── admin_schema.sql           # Admin/auth/content schema
│   └── member_schema.sql          # Member profile/history schema
├── netlify.toml                   # Netlify configuration
├── package.json
└── use-gematria.js
```

## Lines of Code

The repository contains approximately **6,350 lines of source code** across HTML, CSS, JavaScript/MJS, SQL, TOML, and JSON files.

To recount at any time, run:

```bash
npm run count-lines
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Deploy to [Netlify](https://netlify.com) or run locally with the [Netlify CLI](https://docs.netlify.com/cli/get-started/).

## Database Migrations

Apply the SQL files in order when bootstrapping a database:

1. `sql/admin_schema.sql`
2. `sql/member_schema.sql`

`member_schema.sql` is the Phase 2 migration that adds member account fields, profile records, and saved calculation history on top of the shared `users` table.

The membership implementation now exposes member auth/profile/history endpoints (`member-register`, `member-login`, `member-session`, `member-profile`, and `member-history`) plus a published `/member.html` dashboard for registration, profile editing, and saved searches.

Stripe-backed membership upgrades now also use `member-payment-checkout` and `member-payment-confirm`. Stripe credentials can now be managed from the admin back-office via `admin-settings`, with environment variables such as `STRIPE_SECRET_KEY` still supported as a fallback.

## DDoS and abuse protection

The serverless layer now includes:

- per-IP and per-account rate limiting stored in Postgres
- response caching for high-volume public endpoints
- request audit logging with request fingerprints
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
- `TURNSTILE_SECRET_KEY=...` if you want auth flows to require and verify a client-side anti-bot challenge token against Cloudflare Turnstile
- `TURNSTILE_EXPECTED_HOSTNAME=...` to pin Turnstile verification to a specific hostname instead of deriving it from the incoming request host header

### Edge protection still required

Application-level protections help, but you should still put the site behind a managed WAF/DDoS mitigation service and configure path-specific rules for:

- `/api/member-login`
- `/api/member-register`
- `/api/member-payment-checkout`
- `/api/member-payment-confirm`
- `/api/getWords`
- `/api/wordnikRelatedWords`
- `/definition`

## License

See [LICENSE](./LICENSE) for details.
