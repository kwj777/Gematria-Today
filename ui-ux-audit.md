# UI/UX Audit — Non-Admin Site

Audit date: 2026-05-14
Scope: All non-admin pages (`index.html`, blog/news, calculators, gematria
learning path, premium-research, searchbot, member dashboard, account-recovery,
contact/faq/legal pages, forum-reputation-scale) plus shared front-end assets
(`theme.css`, `forum-theme.css`, `home-page.js`, `ui-feedback.js`,
`site-modules.js`, `analytics-bootstrap.js`, `partials/`).

Method: static review of HTML, CSS, and inline JS. Runtime behavior (real
browsers, screen readers, contrast meters) was not measured.

## Severity

- **P1** — Blocks or significantly degrades a primary task; accessibility
  blocker; visible production bug.
- **P2** — Notable usability friction; inconsistency that compounds across
  pages; partial accessibility gap.
- **P3** — Polish, consistency, and future-proofing.

---

## Site-wide / shared assets (`theme.css`, `forum-theme.css`, JS, partials)

These affect every non-admin page and should generally be fixed first because
the leverage is high.

### P1

1. **`:focus` used instead of `:focus-visible` on form controls and links.**
   - `theme.css:2361-2363` (`.form-control:focus`, `.form-select:focus`)
   - `theme.css:1038` (`.meta-highlight a:focus`)
   - Effect: pointer users see focus rings on every click; the keyboard
     affordance becomes noise rather than a signal. Replace with
     `:focus-visible` (keep `:focus` only where a focus ring on click is
     intentional, e.g. inputs).

2. **No `@media (prefers-reduced-motion: reduce)` for global loading
   spinner.**
   - `theme.css:1817-1837` (`.global-loading-overlay__spinner`).
   - `forum-theme.css:94, 133, 204` animations are not fully covered by the
     reduced-motion block at `forum-theme.css:304-320`.
   - Effect: vestibular-sensitive users get continuous rotation/fade. Disable
     or shorten all animations under the reduced-motion query.

3. **Dark-mode form inputs not styled.**
   - `theme.css:2355-2359` defines `.form-control` only for default theme; no
     `:root[data-bs-theme="dark"] .form-control` rule.
   - Effect: in dark mode, inputs may render with white background or
     invisible borders depending on Bootstrap defaults.

4. **No `@media (forced-colors: active)` support.**
   - High-contrast OS users get layouts that depend on custom colors that
     forced-colors will strip.

### P2

5. **Z-index scale is ad-hoc.** Values 1080, 2999, 3000, 9000, 9100 are
   scattered across `theme.css:1960, 2033, 2090, 2120, 2174`. The forum
   sticky composer uses `z-index: 15` (`forum-theme.css:334`) — at risk of
   being buried by other overlays. Define `--z-nav`, `--z-sticky`,
   `--z-modal`, `--z-toast`, `--z-tooltip` tokens.

6. **Hardcoded colors that bypass the theme.**
   - `theme.css:200` (`.skip-link` background `#111`)
   - `theme.css:104, 108, 172` (breadcrumb link colors `#93c5fd`,
     `#bfdbfe`, `#ffffff`)
   - `theme.css:1345` (FollowIt focus override)
   - These won't follow theme changes and complicate dark-mode tuning.

7. **No toast/notification primitive.** `ui-feedback.js` only has the
   full-screen loading overlay. Non-critical success/info feedback either
   relies on per-page alerts or is missing entirely. A reusable toast
   (auto-dismiss, `role="status"` / `role="alert"`, focusable on hover) is
   needed.

8. **`aria-busy` lifecycle inconsistent.** `home-page.js:141-214` sets
   `aria-busy="false"` after render but never sets it to `"true"` before
   fetch; screen readers don't get a loading announcement.

9. **No print stylesheet.** Nothing in `theme.css` reacts to
   `@media print`; the nav, sidebars, and back-to-top button all print.

10. **Disabled state visual is weak.** `theme.css:215-226` uses opacity 0.55
    plus a grayscale filter on `[aria-disabled="true"]` but this looks
    nearly identical to a hover-faded button. Add an explicit
    background/cursor change.

### P3

11. **Password-toggle button has no styled focus state.**
    `ui-feedback.js:211-234` injects the toggle but `theme.css` has no class
    that gives it a focus ring; keyboard users can't see it.

12. **Carousel control sizing.** `theme.css:1062-1078` defines 3rem control
    width; icon size at 55% may fall below the 44px touch target on small
    phones.

13. **`invalid-feedback` color contrast.** `theme.css:2386` uses `#b02a37`;
    dark-mode override at `theme.css:2391-2393` exists but light-mode value
    should be re-checked against page backgrounds for 4.5:1.

14. **Skeleton screens missing for home-page data.** `home-page.js:79-139`
    (featured grid) and `141-214` (slider) flip from empty to populated
    with no skeleton. The forum already does this
    (`forum-theme.css:151-161`) — reuse the pattern.

---

## index.html

- **P2** Hero density on mobile (lines 154-183): three content blocks (copy,
  image, overlay) share one row; collapses awkwardly on phones.
- **P2** Primary vs secondary CTA both use `btn-lg` (lines 161-162) — no
  clear visual hierarchy for "Get my number" vs the secondary action.
- **P2** Daily-gematria spotlight uses status text as a label (line 259);
  needs a real `aria-label` on the container.
- **P3** JavaScript-required placeholder (line 151) reads as a technical
  message; rewrite as a user-facing message and add a `<noscript>`
  fallback link.

## blog.html

- **P2** Tag filter (line 287) shows no result count or active-filter
  summary.
- **P2** No empty state copy when filters return zero posts (line 311) —
  skeleton stays indefinitely.
- **P2** "Load older posts" button (line 319) is ambiguous about direction;
  use "Show older posts" with an explicit date hint.
- **P3** Embedded FollowIt subscription form (lines 291-305) inherits
  vendor styling that may not meet AA contrast on the dark hero.
- **P3** Sticky sidebar (line 282) can lock content off-screen on short
  viewports.

## news.html

- **P1** No error state when RSS feeds fail (lines 315-341); skeletons
  remain visible forever. Add a visible failure card with retry.
- **P2** "Filters" heading is `h6` (line 261) — too quiet for a primary
  affordance.
- **P2** "Last updated" timestamp (line 263) has no timezone label.
- **P3** Search input placeholder doubles as label (line 283); add a
  visible label or screen-reader-only label.

## calculator.html

- **P1** Submit button swaps text to "Calculating…" (lines 250-268) instead
  of becoming `aria-busy` with a spinner. Screen readers may not detect
  the state change.
- **P2** No inline field validation; errors only appear after submit
  (line 228).
- **P2** Save-history button is conditionally disabled (line 238) but the
  associated hint doesn't update with the disabled state — `aria-describedby`
  is stale.
- **P2** Long related-words result lists have no pagination/collapse.
- **P3** Inconsistent sizing — `form-control-lg` inputs with `btn-lg`
  buttons but other controls drop to default size.

## name-calculator.html

- **P1** Error message div (line 285) appears mid-form, far from the submit
  button; on mobile, users scroll past it.
- **P2** Modal close (line 1204) needs focus-trap verification; currently
  unclear whether Tab cycles within the modal.
- **P2** Three-column name inputs (line 225) reflow poorly around tablet
  breakpoints (~820px).
- **P2** Mobile note "results will appear below in a single column"
  (line 288) is jargon; explain the why or remove.
- **P3** "Share comparison" button (line 1029) appears inside the results
  region with no sticky/return path.

## premium-research.html

- **P1** Full-screen "Getting the fresh stats…" overlay (lines 190,
  544-558) has no timeout, no cancel, no retry. A hung auth check traps
  the user.
- **P2** Stats cards (line 466) render empty then populate — no skeleton.
- **P2** Gematria form layout (lines 301-306) breaks at narrow widths;
  the col-8/col-4 split wraps awkwardly.
- **P3** "Show all results" CTA buried inside the grid (line 428); also
  surface it above results.

## searchbot.html

- **P2** Textarea (line 199) has no guidance on expected question length.
- **P2** Feedback panel (line 214) is hidden until after first search —
  users miss its existence on first use.
- **P2** Source list (line 211) is visually dense; group by source type or
  add icons.
- **P3** "Indexed entries: N" (line 361) is post-result only; users don't
  know what scope they're searching before submitting.

## member.html (dashboard)

- **P1** Destructive actions have no confirmation. History and chat
  delete buttons (lines 2471-2490, 2575-2587) delete on first click.
- **P1** Save flow says "Saved" but doesn't say *what* was saved
  (lines 2945-2962); users editing multiple sections can't tell which
  changes persisted.
- **P1** Form submission disables the button but does not debounce
  (lines 2818, 2880-2882, 3015); a rapid keyboard repeat or double-tap
  can still queue duplicate requests via the Enter key.
- **P2** Dual validation channels for password change — inline mismatch
  (line 2857) plus the alert at line 365 — confusing.
- **P2** Collapse listeners (lines 3264-3336) update `aria-expanded` and
  arrow glyphs only; no focus return when sections close.
- **P2** Star/favorite controls (line 2428) and history textareas
  (line 2446) are below the 44px touch target.
- **P2** Async loaders (`loadHistory`, `loadChatSessions`,
  lines 2206-2209, 2733-2740) have no visible loading state.
- **P2** Comparison table (lines 269-337) uses `—` in many cells with no
  `aria-label` or row context.
- **P2** Password toggle buttons (lines 366-367, 386) set `aria-pressed`
  but don't update `aria-label`; screen reader callouts go stale.
- **P3** Blog-subscription email field is read-only (line 614) with no
  inline explanation.
- **P3** Inline alerts (lines 964-972) don't auto-dismiss and are
  positioned where scrolling can hide them.
- **P3** `pendingHistoryNoteTimers` (lines 2314-2325) never expire if a
  card is abandoned mid-edit; minor resource leak.
- **P3** Subscription intent persists in localStorage (lines 1346-1361)
  with no quota-error handling.

## gematria learning path (basics / guide / account-setup / name-analysis / pattern-grouping / results)

- **P2** Progress bar (e.g. `gematria-basics.html:214-217`) is small and
  uses a generic `aria-label`; include "Step X of Y" semantics.
- **P2** "Next level" buttons use outline style across the path; the
  primary continuation CTA should be `btn-primary` so users can find it
  at a glance.
- **P2** Three-up card grids (e.g. `gematria-guide.html:264-302`,
  `why-english-gematria.html:218-236`) compress to unreadable widths on
  tablet/mobile.
- **P2** `gematria-results.html:198-202` shell never clears `aria-busy`
  after the load completes (lines 312-313).
- **P2** `gematria-results.html:303` definition link is a sub-10px tap
  target; expand the hit area.
- **P2** `gematria-pattern-grouping.html:234` example link
  `/?gematria=276` is opaque — add a hover/inline preview of what
  opens.
- **P3** `gematria-account-setup.html:248-249` has two near-equal CTAs
  ("Create Free Account" and "Next: Level 1") — clarify which completes
  the current step.

## faq.html

- **P2** Loading overlay (`faq.html:192`) uses `role="status"` but no
  `aria-live`; updates may not be announced.
- **P2** Search has 120ms debounce (line 406) with no spinner; users
  expect instant filter on a static list.
- **P3** First accordion item expanded by default (line 367) without a
  visual cue that more items exist below — add a "showing X of N"
  count.

## contact.html

- **P2** mailto links (lines 215-218) display label text only; show the
  actual email address so users can copy it.
- **P3** Two-column layout (line 205) has no max-width; on wide displays
  copy line length exceeds comfortable reading width (~75ch).

## accessibility.html

- **P1** Production page contains placeholder copy: "Replace the
  placeholder contact details before launch" (line 217). Ship-blocker.
- **P2** "Known limitations" section is vague; list concrete examples
  and remediation timelines.

## account-recovery.html

- **P2** No real-time validation feedback on the recovery code input
  (pattern `[A-Za-z0-9\-]`, line 233); error only appears on submit.
- **P2** Show/hide password buttons (lines 240, 247) lack a visible focus
  state.
- **P3** Alert icons stored as raw `innerHTML` (lines 283-287) with no
  `aria-hidden="true"` on the SVG.

## disclaimer.html / privacy.html / terms.html

- **P2** Disclaimer uses `p-4 p-lg-5` on each of five stacked sections —
  visual rhythm is monotonous, hard to scan. Add an in-page TOC.
- **P3** Privacy and terms pages should expose a table of contents at the
  top with anchor links to each section; long legal pages without
  navigation are a known usability anti-pattern.

## forum-reputation-scale.html

- **P2** Missing `.skip-link` element (compare other pages, ~line 168);
  breaks keyboard-nav consistency across the site.
- **P2** Restricted tier (`< 0`) row has no visual severity cue (red
  background, warning icon); blends with normal tiers.
- **P3** Mobile `table-stack-sm` (line 186) shows `data-label` but
  doesn't emphasize the label column typographically.

---

## Cross-page consistency findings

- **Button hierarchy drifts** between pages: `btn-primary`, `btn-outline-*`,
  and `btn-lg` mix without a documented rule. Define a hierarchy
  (primary = main CTA per view, outline = secondary, ghost/link = tertiary)
  and apply consistently.
- **Form labels vs placeholders** — several pages use the placeholder as
  the only label (search inputs, contact form). Always provide a real
  `<label>` (visually shown or `.visually-hidden`).
- **Skeleton loaders without timeout fallbacks** — multiple pages will
  show shimmering placeholders forever on API failure. Every async region
  needs an error state with a retry control.
- **Touch targets** — many small icon buttons (star, definition,
  archive, close-row) are under 44px. Add a utility class and apply
  uniformly.
- **Hover-only affordances** in some custom widgets — ensure each
  hover-revealed control is also reachable by keyboard focus and tap.

---

## Suggested rollout

- **First pass (P1, shared assets):** focus-visible refactor,
  reduced-motion coverage, dark-mode form inputs, forced-colors support,
  remove the placeholder copy on `accessibility.html`.
- **Second pass (P1, per-page):** member.html destructive-action
  confirmations + save feedback + debouncing, news.html feed-failure
  state, premium-research.html overlay timeout, calculator.html
  `aria-busy` flow.
- **Third pass (P2 polish):** button-hierarchy normalization, z-index
  token scale, skeleton/empty/error states for all async regions, touch
  target audit, label-vs-placeholder cleanup.
- **Fourth pass (P3):** print stylesheet, toast primitive in
  `ui-feedback.js`, legal-page TOCs, password-toggle styling, and the
  remaining nice-to-haves.

## Notes / limitations

- This is a static audit; runtime focus order, real keyboard traps,
  screen reader output, and computed contrast on rendered backgrounds
  were not measured.
- Privacy and terms pages were not read past their first 200 lines; a
  follow-up should confirm the entire body.
