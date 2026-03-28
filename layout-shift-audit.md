# Layout Shift Audit (CLS) Notes

## High-priority opportunities

1. **Dynamic news feed containers rendered empty at first paint**
   - Files: `news.html`, `public/news.html`
   - Impact: The featured feed block and feed grid were empty until JavaScript finished fetching feed data, causing visible push-down on slower connections.
   - Fix applied: Added placeholder markup and minimum heights for feed containers/cards so initial layout is stable.

2. **Home hero illustration missing intrinsic dimensions**
   - Files: `index.html`, `public/index.html`
   - Impact: Browser could not reserve the image box before asset decode, increasing risk of above-the-fold shift.
   - Fix applied: Added explicit `width`/`height` plus eager/async loading hints.

## Additional opportunities to consider

1. **Web font loading strategy**
   - If custom web fonts are added later, use `font-display: swap` and metric-compatible fallbacks to avoid text reflow.

2. **Async content blocks on calculator/member pages**
   - Where API results are injected after user actions, reserve predictable space for result cards with skeleton or min-height shells to reduce post-interaction layout movement.

3. **Consistent dual-source parity (`/` and `/public`)**
   - Keep updates mirrored between root HTML/CSS and `public/` copies to prevent CLS regressions between local/dev and deployed pages.
