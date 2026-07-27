# Templating Layer Recommendations

This document scopes what it would take to stop hand-maintaining shared markup across the
site's HTML pages. It is a plan, not a change: nothing here has been implemented.

## The current shape

Pages are served directly from the repository root (`publish = "."` in `netlify.toml`).
There is no build step, so every page carries its own copy of the nav, the footer, and the
head boilerplate. Consistency is held together by a set of drift detectors wired into
`npm run lint`.

Measured across the 32 public pages (10,369 lines of markup):

| Block | Duplicated lines | Share of public markup |
|---|---|---|
| `<nav>` | 1,711 | 16.5% |
| `<footer>` | 1,184 | 11.4% |
| head boilerplate (lines appearing on ≥80% of pages) | 590 | 5.7% |
| **total repeated** | **~3,485** | **~34%** |

The remaining head content (2,262 lines) is genuinely page-specific — titles, meta
descriptions, canonicals, OG/Twitter tags, and JSON-LD — and is not duplication.

## Why this is worth addressing

**What is enforced stays consistent; what is not, drifts.** The nav had `sync-nav.mjs`, so
all 29 public pages carrying it were generated from `partials/nav.html`. (The 11 admin pages
have their own nav and are deliberately excluded.) The footer had no equivalent, and it had
fragmented into **8 distinct variants across 25 pages**.

Worth noting how partial that enforcement was: `check-nav` existed but was **never wired
into `npm run lint`**, so CI never ran it. The nav held its shape because contributors
happened to run the syncer, not because anything stopped them not doing so.

That divergence is mostly *intentional* — each site section has its own tagline:

- `Gematria.Today — a suite of research tools.`
- `Gematria.Today — research tools and calculators.`
- `Gematria.Today — gematria, explained from the basics up.`
- `Gematria.Today — policies, disclosures, and support.`
- `Gematria.Today — your member workspace.`

But parameterising just that one string collapses 8 variants into **4 structures**, and
22 of the 25 pages share a single structure. The three outliers are `index.html` (adds a
quick-links nav), `account-recovery.html` (one extra link), and `offline.html` (standalone).

So the footer is not really 8 designs. It is one design, one parameter, and one optional
slot — copied 25 times. Changing anything structural in it means 25 edits in 8 shapes, with
nothing to catch a missed one.

**The edit cost is already visible.** The recent `href="#"` → `<button>` change was two
lines in `partials/nav.html` and landed as a **31-file, 89-line diff** once synced.

## Constraints any solution has to respect

These are the things that make this more than "add Eleventy":

1. **`publish = "."`.** Pages are served from the repo root. Moving to a build output
   directory means re-homing `assets/`, `theme.css`, `page-scripts/`, `secure/`, and the
   service worker via passthrough copy, and repointing `publish`.

2. **`[functions."admin-click-tracking"] included_files = ["*.html"]`.** A serverless
   function bundles the root HTML pages. If pages become build output, this glob has to
   follow them, or the function silently ships an empty set.

3. **`update-sitemap-lastmod.mjs` reads git history per page** (`git log -1 HEAD -- <file>`)
   and *throws* on a file with no history. If generated pages are gitignored build output,
   every sitemap entry fails. The script must be repointed at the source template instead —
   this is the single most likely thing to break a migration silently.

4. **`check-no-inline-scripts.mjs` is load-bearing.** It is what keeps `script-src` free of
   `'unsafe-inline'` in the CSP. Any templating layer must not introduce inline `<script>`
   blocks, and this check must keep running against the *output*, not the source.

5. **11 of 32 public pages carry a per-page `<style>` block** (1,424 lines). These are
   inline styles, permitted by the CSP's `style-src 'unsafe-inline'`, and they must survive
   templating as a per-page slot — they cannot all be hoisted into `theme.css` cheaply.

6. **`netlify-redirects.test.mjs` reads HTML from the root**, and `check-google-analytics.mjs`
   asserts the GA snippet on all 42 pages. Both need repointing.

There is already precedent for build-time generation in the repo:
`sync-site-adaptation-guides.mjs` generates 10 HTML files from markdown and commits them.

## Option A — extend the existing sync-script pattern (small) — **shipped**

`sync-nav.mjs` has been generalised into `scripts/sync-partials.mjs`, which now owns both
the nav and the footer. Partials live in `partials/nav.html` and `partials/footer.html`;
the footer takes three slots, configured per page in the script:

- `{{TAGLINE}}` — one of five per-section taglines, mapped via `FOOTER_SECTION_BY_FILE`
- `{{QUICK_LINKS}}` — the home page's extra quick-links row
- `{{EXTRA_LEGAL_LINKS}}` — account-recovery's extra Dashboard link

`npm run check:partials` is now part of `npm run lint`, closing the gap noted above.
`sync-nav` / `check-nav` remain as aliases.

**What it buys:** the footer can no longer drift, and shared chrome is edited in one place.
No build step, `publish` stays `.`, and no Netlify config or test changes were needed.

**What it does not fix (unchanged by this work):** the pages still physically contain the
boilerplate, so a footer change still produces a ~24-file diff. The *edit* cost is gone; the
*review* cost is not. That is what Option B buys.

### The head boilerplate was deliberately left out

The original plan included the head. Measurement showed it is not safely extractable with
block replacement:

- the longest **identical contiguous** run at the top of `<head>` is **4 lines**
  (`<head>`, charset, viewport, `early-bootstrap.js`), and the only common suffix is `</head>`
- the shared lines (theme.css, preloads, `noscript` fallbacks) are **interleaved** with
  page-specific title/meta/OG/JSON-LD in an order that varies per page
- the stylesheet/preload cluster has **6 distinct shapes** across the 29 pages

Extracting it would mean reordering the head on at least 8 pages. Preload and stylesheet
order is LCP-sensitive, so that is a performance change, not a refactor, and it needs a
deliberate decision about a canonical head order first. Left for Option B, where a layout
imposes that order once.

## Option B — a real templating layer (larger)

Eleventy is the natural fit: it is HTML-first, needs no component rewrite, and layouts plus
includes map directly onto what is already there. Astro is the heavier alternative and buys
little here, since there are no interactive components to island-ify.

**Rough shape of the work:**

1. Move the 32 public pages to `src/`, each keeping its unique head, `<style>`, and body.
2. One base layout carrying nav, footer, and head boilerplate; front matter supplies title,
   description, canonical, OG tags, footer tagline, and JSON-LD.
3. Passthrough-copy `assets/`, `theme.css`, `theme-deferred.css`, `page-scripts/`,
   `site-bundle.js`, `sw.js`, `manifest.webmanifest`, `robots.txt`.
4. Repoint `publish` to `_site`, and `included_files` for `admin-click-tracking`.
5. Repoint `update-sitemap-lastmod.mjs` at source templates (constraint 3).
6. Repoint `check-no-inline-scripts.mjs`, `check-google-analytics.mjs`, and
   `netlify-redirects.test.mjs` at build output.
7. Retire `sync-partials.mjs` — the layout replaces it.

**What it costs:** roughly a week, most of it in steps 3–6 rather than step 2. The migration
is mechanical but wide, and it is hard to land incrementally: `publish` flips for all pages
at once.

**What it buys:** a nav change becomes a one-file diff. New pages start from a layout rather
than a copy-paste. Roughly 3,485 lines of repeated markup stop existing.

**Main risk:** the admin pages (11 files) have their own nav and are excluded from
`sync-nav.mjs` today. They should stay excluded from the first migration.

## Recommendation

**Option A is done; treat Option B as a separate, deliberate project.**

The footer was actively fragmented and nothing detected it — a real problem with a one-day
fix and no migration risk. Option B is the better end state, but its cost
is dominated by re-homing build paths and repointing five checks, not by the templating
itself, and it is worth doing when the page count or the pace of shared-markup changes
justifies a week and a `publish` flip.

If Option B is taken up later, do constraint 3 (`update-sitemap-lastmod.mjs`) first and in
isolation. It fails loudly but for a confusing reason, and it is the step most likely to
strand a migration halfway.
