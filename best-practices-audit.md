# Best Practices Audit

Date: 2026-03-28

## Scope

This audit reviewed repository-level practices for:

- source-of-truth consistency for static pages,
- testing and CI guardrails,
- security defaults for auth/recovery flows,
- front-end safety/performance hygiene,
- operational readiness for Netlify serverless workloads.

## What was checked

- `npm test`
- `npm run check-root-pages`
- Manual review of project documentation and key implementation surfaces.

## Current strengths

1. **Canonical page source is documented and enforced by a check script.**
   - `public/` is clearly documented as canonical.
   - `check-root-pages` helps prevent drift between mirrored root pages and deploy sources.

2. **Contract tests exist for session/logout behavior.**
   - Auth session and idempotent logout payloads are validated by automated tests.

3. **Security posture is explicitly documented.**
   - The README captures layered controls (rate limiting, audit logs, cache retention, load shedding, request timeouts, and stricter headers).

4. **Operations guidance exists for incident mode.**
   - A dedicated high-alert runbook is present.

## Best-practice gaps (priority order)

### P1 — Add static analysis and formatting checks to CI

**Why it matters:** tests currently cover selected runtime contracts, but there is no default lint/format gate in `package.json`, which raises regression risk for front-end scripts and functions.

**Recommendation:**

- Add scripts such as:
  - `lint` (ESLint for `.js/.mjs`),
  - `format:check` (Prettier),
  - optional `typecheck` if JSDoc/TS is introduced.
- Enforce these in CI alongside existing mirror-check/test tasks.

### P1 — Expand API tests beyond auth session/logout

**Why it matters:** current automated tests are valuable but narrow.

**Recommendation:**

- Add tests for:
  - method guards and status codes across all public/admin/member endpoints,
  - input validation boundaries,
  - error-shape consistency (`{ error }` payload schema),
  - security headers on function responses.

### P2 — Strengthen front-end XSS hardening approach

**Why it matters:** many pages render dynamic markup via `innerHTML`. Existing escaping patterns appear deliberate, but `innerHTML` usage increases long-term maintenance risk.

**Recommendation:**

- Prefer DOM construction (`createElement`, `textContent`) for untrusted content paths.
- Where `innerHTML` is retained, centralize escaping and document required safe-template rules.
- Add a lightweight test that verifies escaping helpers against representative payloads.

### P2 — Introduce dependency/security automation checks

**Why it matters:** no script currently tracks dependency vulnerability drift.

**Recommendation:**

- Add `npm audit --production` (or equivalent SCA tooling) to scheduled CI.
- Add dependency update automation (Renovate or Dependabot).

### P3 — Add contributor-facing coding standards doc

**Why it matters:** best practices are partly implicit today.

**Recommendation:**

- Add a concise `CONTRIBUTING.md` including:
  - source-of-truth policy (`public/` + mirror sync/check),
  - test expectations for changed endpoints,
  - security checklist for auth/recovery changes,
  - release checklist for environment variable changes.

## Suggested 30/60/90-day rollout

- **First 30 days:** add lint/format scripts, wire to CI, add one API test suite for recovery endpoints.
- **By 60 days:** establish dependency scanning + update automation; add shared response-schema assertions.
- **By 90 days:** reduce high-risk `innerHTML` usage in admin/member/public dynamic rendering hotspots.

## Audit conclusion

The project already has strong foundational operational and security intent, especially around deploy-source consistency, auth-session contract coverage, and incident readiness. The highest-value next step is to upgrade developer guardrails (lint/format/security automation + broader endpoint tests) so that best practices are enforced continuously rather than relying primarily on manual discipline.
