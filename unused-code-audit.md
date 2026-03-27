# Unused Code Audit (March 27, 2026)

## Scope
- Entire repository at `/workspace/Gematria`.
- Front-end pages (root + `public/`), Netlify functions, shared scripts, and configuration.

## Methodology
1. Ran an ESLint `no-unused-vars` sweep across all `.js` and `.mjs` files.
2. Cross-checked Netlify function names against in-repo endpoint usage (`/api/*` and `/.netlify/functions/*`).
3. Verified deploy surface from `netlify.toml` (`publish = "public"`) to identify files that are not part of deployed output.
4. Searched for standalone scripts not imported or referenced by shipped pages.

## Findings

### A) Confirmed unused variable bindings (fixed)
- `netlify/functions/admin-logout.mjs`: `catch (error)` never used.
- `netlify/functions/wordnikDefinition.mjs`: `catch (_error)` never used.

These were safe cleanup opportunities with no behavior change.

### B) Confirmed orphan endpoint
- `netlify/functions/getWords.mjs` does not have any in-repo caller (no `/api/getWords` or `/.netlify/functions/getWords` references found).
- This endpoint may still be intentionally public/external, but there is no internal consumer in current code.

### C) Confirmed standalone unused script
- `use-gematria.js` is not referenced by any HTML page or script in the repository (only mentioned in `README.md`).
- This looks like an example/legacy helper rather than active runtime code.

### D) Potential duplicate source surface (likely intentional, but high maintenance risk)
- Netlify deploys from `public/`, but equivalent top-level pages (`index.html`, `calculator.html`, etc.) and assets/scripts also exist at repo root.
- If root files are not part of another build/deploy workflow, they are effectively non-deployed duplicates and can drift.

## Recommended next steps
1. Decide whether `getWords` should remain publicly available:
   - Keep and document external consumers, or
   - Remove endpoint and any related DB/query logic.
2. Remove `use-gematria.js` or link it from docs/examples only (outside deploy/runtime paths).
3. Choose one canonical page source (`public/` recommended given `netlify.toml`) and either:
   - Delete root duplicates, or
   - Add an explicit sync/build step so both trees remain consistent.
