# Homepage performance regression analysis (Lighthouse mobile score drop)

## What most likely regressed

Based on the current `index.html` structure and recent homepage commits, the regression is most consistent with a **Speed Index regression** (slower visual completion), not a CPU main-thread regression:

1. **Above-the-fold content got significantly heavier when the homepage hero became a multi-slide carousel.**
   - The primary viewport now renders a Bootstrap carousel with indicators, controls, and multiple slide DOM trees right at the top of the page. Even with lazy loading for non-active images, this increases initial layout/paint complexity. (`index.html` hero carousel section)  
   - This pattern typically hurts Speed Index more than FCP/LCP, matching the screenshot profile (FCP/LCP acceptable, Speed Index poor).

2. **A render-blocking stylesheet is fetched from a dynamic endpoint (`/api/public-theme-css`).**
   - The page now includes `<link rel="stylesheet" href="/api/public-theme-css" />` in `<head>`. Because it is a normal stylesheet (not async/deferred CSS loading), style resolution must wait for this response before full paint stabilization.
   - Any endpoint latency variance directly impacts early visual progress and therefore Speed Index.

3. **More head-level scripts/resources were added, increasing startup network contention.**
   - `analytics-bootstrap.js`, `cookie-consent.js`, `ui-feedback.js`, `conversion-tracking.js`, and `site-modules.js` are now loaded on the homepage.
   - Most are deferred, so they are less likely to inflate TBT (which is still good), but they still compete for connection slots/bandwidth during startup and can delay non-critical visual completion.

## Why this matches the metric pattern

- The screenshot shows **good TBT/TTI/CLS** but a **poor Speed Index**.
- That usually points to "page looks complete later" rather than long JS blocking.
- Heavy top-of-page composition + render-blocking CSS endpoint latency are the strongest candidates for that exact pattern on this code path.

## Highest-impact fixes to test first

1. Inline only true critical CSS for above-the-fold shell and load `/api/public-theme-css` non-blocking (or make it static-cacheable).
2. Simplify first-slide DOM and defer non-visible carousel chrome/secondary slide setup until after first paint.
3. Keep analytics/consent/module scripts deferred, but postpone non-essential startup fetches until `load`/`requestIdleCallback`.
4. Re-run Lighthouse after each change to isolate which adjustment drops Speed Index the most.
