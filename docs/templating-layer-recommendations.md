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

**What is enforced stays consistent; what is not, drifts.** The nav has `sync-nav.mjs`, so
all 29 public pages carrying it are generated from `partials/nav.html` and verified by
`npm run check-nav` — drift is impossible without failing lint. (The 11 admin pages have
their own nav and are deliberately excluded.) The footer has no equivalent, and it has
fragmented into **8 distinct variants across 25 pages**.

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

## Option A — extend the existing sync-script pattern (small)

Generalise `sync-nav.mjs` into a partials syncer that also owns the footer and the head
boilerplate, driven by `partials/*.html` with simple named slots (tagline, quick-links,
page `<style>`, page-specific meta).

**What it costs:** roughly 1 day. `sync-nav.mjs` is 127 lines and already does the hard part
— locating a block by regex, preserving indentation, and offering `--write` / `--check`.

**What it buys:** the footer stops drifting, and shared markup is edited in one place.
Every constraint above is untouched: no build step, `publish` stays `.`, no config or test
changes, and the lint suite keeps working exactly as it does now.

**What it does not fix:** the pages still physically contain the boilerplate, so a nav
change still produces a 31-file diff. The *edit* cost goes away; the *review* cost does not.

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
7. Retire `sync-nav.mjs` (127 lines) — the layout replaces it.

**What it costs:** roughly a week, most of it in steps 3–6 rather than step 2. The migration
is mechanical but wide, and it is hard to land incrementally: `publish` flips for all pages
at once.

**What it buys:** a nav change becomes a one-file diff. New pages start from a layout rather
than a copy-paste. Roughly 3,485 lines of repeated markup stop existing.

**Main risk:** the admin pages (11 files) have their own nav and are excluded from
`sync-nav.mjs` today. They should stay excluded from the first migration.

## Recommendation

**Do Option A now; treat Option B as a separate, deliberate project.**

The footer is actively fragmented today and nothing detects it — that is a real problem with
a one-day fix that carries no migration risk. Option B is the better end state, but its cost
is dominated by re-homing build paths and repointing five checks, not by the templating
itself, and it is worth doing when the page count or the pace of shared-markup changes
justifies a week and a `publish` flip.

If Option B is taken up later, do constraint 3 (`update-sitemap-lastmod.mjs`) first and in
isolation. It fails loudly but for a confusing reason, and it is the step most likely to
strand a migration halfway.
