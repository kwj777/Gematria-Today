# Duplicate Code Audit

Date: 2026-03-27

## Scope

This audit focused on likely duplicate-code hotspots in:

- Front-end page copies at repo root vs `public/`
- Netlify serverless handlers in `netlify/functions/*.mjs`
- Common utility/helper modules used by handlers

## Methodology

1. **Exact-match duplicate scan** (SHA-256 over source file contents) across HTML/CSS/JS/MJS/SQL/TOML/JSON/MD files.
2. **Near-duplicate similarity scan** over `netlify/functions/*.mjs` using line-based sequence similarity.
3. **Manual review** of high-similarity pairs to classify whether duplication is avoidable.

---

## Findings

### 1) Exact duplicate front-end files in repo root and `public/`

The following files are exact duplicates:

- `member.html` and `public/member.html`
- `calculator.html` and `public/calculator.html`
- `nameCalculator.html` and `public/nameCalculator.html`

**Assessment:** likely unnecessary duplication risk. Keeping two editable copies of the same pages can cause drift and review noise. If root files are not part of a build/publish pipeline, they should be removed or generated automatically from one source of truth.

**Recommended action:**

- Choose one canonical location (preferably `public/` given repository structure in `README.md`).
- Delete or generate mirrored copies rather than hand-maintaining both copies.
- Add a CI check that fails when root/public page pairs diverge unexpectedly.

---

### 2) Repeated CRUD handler structure between admin endpoints

`netlify/functions/admin-feeds.mjs` and `netlify/functions/admin-tasks.mjs` share the same control-flow template:

- auth bootstrap (`getAuthenticatedUser`)
- method routing (`GET` / `POST` / `DELETE`)
- identical error/method-not-allowed response patterns

**Assessment:** moderate structural duplication. Some domain differences are expected (feeds vs tasks), but request routing and response boilerplate can be abstracted.

**Recommended action:**

- Extract a small reusable method dispatcher helper in `_admin.mjs` (e.g., `handleMethods(event, handlers)`),
- Keep SQL and formatter logic endpoint-specific,
- Standardize common error mapping in one helper.

---

### 3) Highly similar logout handlers with inconsistent error behavior

`netlify/functions/admin-logout.mjs` and `netlify/functions/member-logout.mjs` are largely equivalent but diverge in error behavior:

- `admin-logout` returns HTTP 200 even on caught errors,
- `member-logout` returns HTTP 500 on caught errors.

**Assessment:** duplicate logic with inconsistent semantics. This is usually an indicator that shared behavior should be centralized.

**Recommended action:**

- Introduce a shared logout helper in `_auth.mjs` taking role-specific options (`cookieName`, `getAuthenticatedFn`).
- Decide and document one error policy (typically idempotent sign-out returns 200).

---

## Priority ranking

1. **High impact / low effort:** remove root/public exact duplicate page maintenance.
2. **Medium impact / low-medium effort:** unify logout handler logic and status policy.
3. **Medium impact / medium effort:** abstract admin CRUD method dispatch pattern.

## Suggested follow-up checks

- Add a script (`npm run check-duplicates`) to detect exact file duplicates among canonical paths.
- Add a lightweight test that verifies logout endpoints return consistent statuses for failure paths.
