# Gematria.Today — UI/UX/Content Audit (follow-up)

**Audit date:** 2026-05-24 (afternoon)
**Scope:** Full public + member + admin surface, design system, content,
performance, PWA, SEO, consent.
**Method:** Static code review, building on
`ui-ux-audit.md` (which has been delivered across Sprints 1–3). Findings
below are NEW or are previous items where the fix is still incomplete.
Runtime / browser testing was not performed; items tagged
"verify in browser" need on-device confirmation.

## Sprint completion (2026-05-24, evening)

Bundle 1–4 of the "Suggested next sprint" landed in a single pass:

| Item | Status | Notes |
|---|---|---|
| N1 granular consent banner | ✅ shipped | `cookie-consent.js` now exposes Decline / Customize / Accept; Customize reveals Analytics + Advertising checkboxes that map to `analytics_storage` vs `ad_*`. Storage migrated to `{a,m}` JSON; legacy strings honored on read. |
| N2 PWA update toast | ✅ shipped | `sw.js` no longer auto-`skipWaiting`s; `pwa-register.js` watches `updatefound`, shows "Refresh to update" toast, and reloads on `controllerchange`. |
| N3 admin promote confirm | ✅ shipped | `page-scripts/admin-1.js:1203` now wraps the submit in `window.confirm` with the typed email and a one-liner explaining the blast radius. |
| N4 PWA splash + description | ✅ shipped | `manifest.webmanifest` background_color flipped to `#0f172a`; description matches the homepage meta. Also added `categories` and `shortcuts` (Pol2 bonus). |
| P5 reputation-scale OG/Twitter | ✅ shipped | Canonical + full OG/Twitter set added to `forum-reputation-scale.html`. |
| C3 sitemap lastmod drift | ✅ shipped | Reviewed sitemap drift — `npm run sync:sitemap` reflects actual git history; the two stale entries are accurate because those files weren't touched after 2026-05-23. |
| P1 FAQ search dead-state | ✅ shipped | `faq.html` input no longer ships `disabled`; pre-load typing is buffered and replayed; fetch failure now disables the input and writes "Search index unavailable" to the status live region. |
| F1 resend verification inline | ✅ shipped | `page-scripts/member-1.js` masks the destination email, surfaces "Verification email sent to k***@…", and runs a 30s countdown disable on the submit button. |
| F2 Stripe secret saved badge | ✅ shipped | `admin.html` adds Saved / Not configured badges next to each secret field, driven from `state.stripeSettings.hasStripe*` in `renderStripeSettings`. |
| C1 contact response window | ✅ shipped | `contact.html` now states 5/20 business days and links to a new `accessibility.html#response-times` anchor. |
| C2 contact related-strip | ✅ shipped | `contact.html` gained the `.legal-related-strip` block near its hero (the other legal pages already had it). |

Pol2 was picked up incidentally while editing the manifest.

---

## Verification of the previous audit (Sprints 1–3)

Re-checked against current code on `claude/site-audit-ui-ux-content-G8W9r`:

| Previous item | Status | Notes |
|---|---|---|
| C1 auth flash on `member.html` | ✅ shipped | CSS class swap in early-bootstrap is in place. |
| C2 calculator `aria-describedby` + multiple-of-6 rule | ✅ shipped | Visible on `calculator.html:197-200`. |
| C3 name-calculator visible labels | ✅ shipped | |
| C4 password strength always visible | ✅ shipped | |
| C5 account-recovery step-1 form hidden after submit | ✅ shipped | `requestForm.setAttribute('hidden','')` at `account-recovery-1.js:132`. |
| C6 forum skeleton + empty state + char counter | ✅ shipped | `forum-1.js:135-184, 236-250`. |
| C7 GemaBot in-flight guard | ✅ shipped | `isAgentRequestInFlight` + `askAgentButton.disabled` at `ai-agent-1.mjs:2024-2054`. |
| C8 prose width cap (`70ch`) | ✅ shipped | |
| C9 accessibility statement re-write | ✅ shipped | |
| C10 alt-text audit | ✅ shipped | |
| C11 early-bootstrap inlined | 🚫 **won't fix** | Inlining the script would require `script-src 'unsafe-inline'`, which CSP deliberately excludes and `scripts/check-no-inline-scripts.mjs` enforces. The original C11 was misframed — the external request is the cheaper trade vs. weakening CSP `script-src`. Recording here so future audits don't re-flag. |
| C12 privacy TL;DR | ✅ shipped | |
| L7 print stylesheet | ✅ shipped | `theme-deferred.css:162`, `theme.css:2395`. |
| M9 resend countdown live | ✅ shipped | `account-recovery-1.js:82-100` uses `setInterval`. |
| Pol8 badge timeout/error state | ✅ partial | error path exists (`badge-1.js:103-104`); no explicit 10s network timeout. |
| Pol9 theme-toggle `aria-pressed` | ✅ shipped | `public-theme.js:34-37` updates label + pressed. |

The audit was largely well-delivered. The items that follow are gaps that
remain or new issues introduced by recent work.

---

## ⚠️ Critical findings (fix first)

### N1. Cookie banner is still binary; no granular categories
**File:** `cookie-consent.js:106-116`
The banner only renders "Decline all" / "Accept all". GDPR (and the
ICO's UK guidance) requires that users be able to consent to specific
purposes — analytics vs ad personalization vs ad storage — without
having to accept all of them as a bundle. Today, the only way to opt
in to anonymous analytics is to also accept `ad_storage`,
`ad_user_data`, and `ad_personalization` (the banner literally grants
all four via `applyConsentMode`). The previous audit's A5 was marked
shipped on the strength of equal-weighted Accept/Decline buttons, but
the *granularity* requirement was not met.
**Impact:** Compliance risk in CONSENT_MODE_REGIONS (EU/UK). Users who
want analytics-only get nothing.
**Fix:** Add a third "Customize" button (or expand the panel in place)
that exposes two checkboxes — *Analytics* and *Advertising* — and
applies the chosen booleans through `gtag('consent', 'update', {…})`
independently. Persist as `{a:1,m:0}` style in localStorage rather
than the current `accepted`/`declined` string.

### N2. Service worker has no "new version available" UX
**Files:** `pwa-register.js` (no `updatefound` listener), `sw.js`
(silent activation).
The SW does precache + runtime cache, but if a new version of the site
is deployed while a tab is open, the user never learns — they keep
running last visit's cached HTML/JS until they hard-refresh. There is
no toast, no `controllerchange` reload, no `skipWaiting` choreography.
**Impact:** Stale UI for returning visitors after deploys; users who
"install" the PWA effectively need to manually evict storage to see
fixes. Previous audit A4.
**Fix:** In `pwa-register.js`, after `register()` resolves, listen for
`registration.onupdatefound`, watch the new worker's `statechange` to
`installed`, then show a small "A new version is available — refresh
to apply" toast (use the existing `ui-feedback.js` pattern). On click,
call `skipWaiting` and reload via the `controllerchange` event.

### N3. Promoting a member to admin has no confirm step
**Files:** `admin.html:281-296`, `page-scripts/admin-1.js:1203-1222`
The "Promote premium members to admin" form posts immediately on
submit. A typo in the email field, or an autocomplete misfire, grants
admin access with no second-look UI and no undo affordance from this
screen.
**Impact:** Privilege escalation by mistake — high blast radius,
unrecoverable from this page. The blog/FAQ delete handlers in the
same file already use `window.confirm` for far less destructive
actions.
**Fix:** Wrap the submit handler in
`if (!window.confirm('Promote ' + email + ' to admin? Admins can edit
every page, post, and member. This cannot be undone from this form
(use Super Admin > demote).')) return;` Better: surface the matched
member's name/level in a modal preview before commit.

### N4. PWA install flashes the wrong background on dark devices
**File:** `manifest.webmanifest:9-10`
`background_color: #f8f5ef` (cream) is the light-mode color, but the
site honors `prefers-color-scheme: dark`. Users who install on a
dark-mode phone get a 200-400ms cream splash before the theme settles
to dark — visually jarring and brand-inconsistent. Also `description`
("Gematria calculators and research tools from Gematria.Today.") is
unchanged from a generic boilerplate; the home `<meta description>`
is much richer.
**Impact:** Poor first-launch impression for PWA installs; missed app
store / install picker copy opportunity.
**Fix:** Either flip the splash to the dark navbar tone (`#0f172a`)
to match `theme_color`, or generate a `media: '(prefers-color-scheme:
dark)'` variant via a `manifest-dark.webmanifest`. Update `description`
to mirror the homepage meta.

---

## ⚡ Important findings (fix soon)

### Public pages

- **P1.** `faq.html:145` — FAQ search input still ships with the
  `disabled` attribute on initial paint, waiting for an async tag
  fetch. If that fetch is slow or fails, the input never enables and
  users see a permanently dead search bar (with `placeholder="Search
  questions and answers…"`, which reads as a working control). The
  audit's P4 called this out and it was not addressed. Render enabled,
  fall back to in-page substring match until tags arrive, and surface
  a visible "Search index unavailable" state if the fetch errors.

- **P2.** ✅ shipped — `tools.html` keeps the "Tools" kicker and
  `<h1>Gematria Research Tools</h1>` visible for signed-in users
  while collapsing the marketing copy and help line. The hero box's
  vertical padding shrinks to zero for `auth-free / auth-premium /
  auth-lifetime` so the tool cards still land above the fold without
  costing orientation cues.

- **P3.** ✅ shipped — every "This is the way →" CTA now carries
  `aria-label="Start the free beginner path"` while keeping the
  visible brand-voice text: home (`index.html:253`), calculator
  nudge (`calculator.html:163`), results nudge
  (`gematria-results.html:124`), member dashboard
  (`member.html:421`), and `definitions.html:988`. The member
  dashboard's JS (`page-scripts/member-1.js:822`) removes the
  override when the visible text flips to the self-describing
  "Continue Level N" variant. Closes cross-cutting theme #2.

- **P4.** ✅ shipped — `index.html` now ships a real first slide
  ("Read the latest gematria research" → `/blog.html`) inside the
  carousel instead of a placeholder skeleton, so the initial paint
  has meaningful content while the module fetches real posts. A
  matching `<noscript>` panel sits right after the section to cover
  JS-disabled visitors (the `d-none` on the section is required by
  the admin module-toggle, which only runs in JS, so the fallback
  has to live outside it). Module-disabled state still hides both.

- **P5.** `forum-reputation-scale.html` is missing both
  `<link rel="canonical">` and any Open Graph / Twitter Card tags
  (only `<title>` + `<meta description>`). The page is publicly
  linked from the forum header and is indexed (`robots: index,
  follow`), so any share to social or messaging apps will fall back
  to the host's default preview.
  **Fix:** Add canonical + the same OG/Twitter set used on
  `forum.html`. Optional: a small SVG hero for share previews.

### Forms & account flows

- **F1.** Member dashboard "resend verification" form
  (`member.html`, region `#resendVerificationAlert`) — the alert
  region exists but the JS path doesn't render an inline success
  state with the destination email. Users hit submit, get a generic
  alert, and have to scroll to find out whether anything happened.
  Mirror the recovery pattern: "Verification email sent to
  k***@kevandmel.com. Check spam if you don't see it within
  5 minutes." Disable the button for 30 s after success.

- **F2.** `admin.html:319-330` (Stripe secret + webhook signing
  secret fields) — the fields start `disabled` with a "Change"
  toggle, but there is no positive indicator that a value is on file.
  An admin reopening the page cannot tell "have we already saved
  Stripe credentials, or is this a blank slot?" without inspecting
  another screen. Add a small status badge per field — *Saved*
  (green) or *Not configured* (amber) — driven by a boolean from
  `/api/admin-secrets-status`.

- **F3.** ✅ shipped — All three calculators now expose a per-input
  `role="alert"` error region (`#lookup-input-error`,
  `#multi-cipher-input-error`, `#name-form-error`) wired into the
  input's `aria-describedby`. Inline validation failures — empty
  query, "must be a multiple of 6", missing names — set
  `aria-invalid="true"` on the offending input, write the message
  into the per-input region, and shift focus back to the input.
  Typing into the input clears the invalid state. The big
  `#calculator-error` panel is now reserved for backend / network
  failures, not user-input mistakes.

### Security headers / infrastructure

- **S1.** ✅ shipped — `netlify.toml` now carries an inline comment
  above the CSP explaining that `style-src 'unsafe-inline'` is a
  deliberate budget item (every public page still ships per-page
  `<style>` blocks), and that `script-src` stays clean of
  `'unsafe-inline'` enforced by `scripts/check-no-inline-scripts.mjs`.
  Future tightening still requires externalizing the per-page CSS.

- **S2.** ✅ shipped — `netlify.toml` now documents the deliberate
  omission of `Cross-Origin-Embedder-Policy` with an inline comment:
  COEP would block cross-origin sub-resources (Follow.It, jsdelivr)
  that lack CORP/CORS, and the site doesn't currently need
  crossOriginIsolated APIs.

### Content / legal

- **C1.** `contact.html:128` — "Response window: We aim to review
  legitimate requests as promptly as practical." This is materially
  weaker than the SLA published on `accessibility.html` (5/20 business
  days). Align the wording — "5 business days for general inquiries,
  20 business days for privacy/accessibility requests" — and link to
  the accessibility statement so the commitments don't drift.

- **C2.** Footer cross-link strip is present on legal pages
  (`site-legal-links`), but each individual legal page still doesn't
  expose a "Related: Terms / Privacy / Accessibility / Disclaimer"
  inline strip near the top of its `<main>`. Users entering deep via
  search land in a long page with the related-doc nav only at the
  very bottom. Audit's L3 was partially addressed via the footer; an
  inline strip above the TOC would close the loop.

- **C3.** Sitemap (`sitemap.xml`) — `searchbot.html` and
  `forum-reputation-scale.html` have `lastmod: 2026-05-23` while
  every other entry is `2026-05-24`. Sprint-3 work touched their
  surrounding pages; either bump these (if they were actually
  edited) or leave a comment in the sitemap-generator function
  explaining why some pages keep an older lastmod. The
  inconsistency invites confusion the next time someone audits this.

---

## 💡 Polish (low-priority, high-quality wins)

- **Pol1.** ✅ shipped — beginner-path promo `<h2>` on the home page
  now uses `.h5` instead of `.h6` so it visually outranks the
  `.feature-card-icon__title` h3s (1.25rem vs 1.15rem), matching
  the semantic order.

- **Pol2.** ✅ mostly shipped — `categories` and `shortcuts` already
  landed alongside N4 (see Sprint completion table above). `screenshots`
  is deliberately deferred: the field requires real PNG/JPEG/WebP
  captures for install-picker previews, and adding placeholder SVGs
  would mislead the picker. Track as a future pass once we generate
  real captures via `npm run screenshot`.

- **Pol3.** ✅ shipped — added a generic `--space-1`..`--space-6`
  ladder to `theme.css` (matching the existing forum values), then
  rewrote `forum-theme.css` so every `--forum-space-N` aliases to
  `var(--space-N)`. Forum spacing is now in lockstep with the main
  scale; a future change in `theme.css` propagates automatically.
  Closes original audit's D2.

- **Pol4.** ✅ shipped — `accessibility.html` now ends "What we've
  audited" with a methodology line linking to
  `/accessibility-audit.md` (the WCAG 2.5.5 / Target Size audit
  report). Public commitments now point at the per-pattern fixes.

- **Pol5.** ✅ shipped — `pwa-register.js:117` wraps the Apple-PUA
  Share glyph in `<span aria-hidden="true" style="font-family:-apple-system,…">`
  so even if iOS gating is bypassed on a non-Apple device, the
  glyph degrades to the system font instead of rendering as a tofu
  box. The popup itself remains gated to iOS Safari via
  `shouldShowIosInstallPopup`.

- **Pol6.** ✅ shipped — footer one-liner now varies by top-level
  area instead of repeating "a suite of research tools" everywhere:
  Tools/calculators get "research tools and calculators."; member +
  admin surfaces get "your member workspace."; Privacy / Terms /
  Disclaimer / Accessibility / Contact get "policies, disclosures,
  and support."; learning pages (Basics, Guide, Why English,
  Definitions, FAQ, Blog) get "gematria, explained from the basics
  up." The home page and `404.html` keep the umbrella original.

- **Pol7.** ✅ shipped — `page-scripts/password-strength-helpers.js`
  now owns the shared `STRENGTH_STYLES`, `HINT`, and `score`/`styleFor`
  for both register flows. `member-1.js` and `gematria-account-setup-1.js`
  drop their local copies and read through `window.GematriaPasswordStrength`;
  both pages load the helper before the page script. Account-recovery
  uses a stricter scoring formula and is left untouched.

- **Pol8.** ✅ shipped — `theme-deferred.css` print block now also
  normalizes `main`, `.content-panel`, `.card`, `.feature-card`,
  `.faq-card`, `.hero-panel`, `.legal-copy`, and `.stat-card` to
  white-on-black. Long-form pages (Guide, Why English, Definitions)
  no longer print with the parchment `--brand-surface` tint.

- **Pol9.** ✅ shipped — all three calculator heroes now lead with
  "← All tools · {kicker}" linking back to `/tools.html`, making
  the journey from `tools.html`/`gematria-guide.html` round-trip.
  Lives in the existing `.section-kicker` so the link inherits the
  amber treatment and stays inline with the eyebrow.

- **Pol10.** ✅ already shipped — `definitions.html:429-430` adds
  `▾` / `▴` via `.glossary-toc-toggle::after` for the mobile
  Sections toggle (originally L6). False positive in this audit;
  recording here so future sweeps don't re-flag.

---

## Sprint shipped 2026-05-24 (follow-up quick wins)

Round 1:
- **M8** (original audit) — GemaBot's "Save calculation" modal title
  is now "Save this calculation" and the body explicitly distinguishes
  one-result saves from the full chat save (`ai-agent.html:483-487`).
- **P3** (original audit) — `autocomplete="off"` removed from
  `calculator.html` and `multi-cipher-calculator.html` lookup inputs;
  name-calculator already used proper `given-name`/`additional-name`/
  `family-name`.
- **Pol4** — accessibility methodology link added (above).
- **Pol6** — area-specific footer copy across 23 pages (above).
- **Pol9** — "← All tools" back-link in calculator heroes (above).
- **Pol10** — verified already shipped.

Round 2:
- **P7** (original audit) — each calculator now ends with a small
  methodology + last-updated line: `calculator.html` and
  `name-calculator.html` cite the Base-6 cipher and link to
  basics / why-english-gematria / definitions; `multi-cipher-calculator.html`
  appends the same to its "About the seven ciphers" panel.
- **Pol1** — home beginner-path promo heading promoted from `.h6`
  to `.h5` to outrank feature cards visually (above).
- **Pol5** — Apple-PUA share glyph wrapped in `-apple-system` span
  so it degrades gracefully outside iOS Safari (above).
- **Pol7** — password strength meter scoring + styles extracted to
  `page-scripts/password-strength-helpers.js`, consumed by both
  register flows via `window.GematriaPasswordStrength` (above).
- **Pol8** — print stylesheet now normalizes panel backgrounds to
  white-on-black so long-form prints don't waste ink on the
  parchment tint (above).

Round 3:
- **Pol2** — `categories` + `shortcuts` were already shipped with
  N4; `screenshots` deferred as a real-capture-only field (above).
- **Pol3** — `--space-1..6` added to `theme.css`; `forum-theme.css`
  rewrites `--forum-space-N` to alias `--space-N`. Closes
  original audit's D2 (forum-theme token convergence).
- **A6** (original audit) — PWA prompts are now keyboard-dismissable
  via Escape: iOS install popup, native install CTA, and the
  "new version" update toast each register/remove their own
  `keydown` handler that wires Escape to the same dismiss path as
  the close button. Mouse-only paths still work unchanged.

Round 4 (nav cluster from the original audit):
- **N1** — Tools mega-menu toggle is now a pure `<button type="button">`
  with `data-bs-toggle="dropdown"` and `aria-haspopup="true"`, no href.
  Click can only open the dropdown; the "Compare tools →" footer link
  carries the direct path to `/tools.html`. `scripts/sync-nav.mjs`
  regex extended to allow `nav-mega-footer` to receive the active
  state on `/tools.html`. Propagated via `npm run sync-nav` to all
  29 nav-bearing pages.
- **N2** — added a defensive `:focus-visible` rule in `theme.css` for
  raw `input` / `textarea` / `select` that don't carry the
  `.form-control` / `.form-select` / `.form-check-input` classes,
  closing the gap where a third-party widget could leak the native
  or Bootstrap-blue focus ring.
- **N3** — verified the search pill is already inside the mobile
  drawer (not the visible navbar header). Added a ≤400px media
  query that hides the "Ask SiteSeeker" text label and tightens the
  pill padding so the four-pill action row clears 360px containers.
  The `aria-label="Ask SiteSeeker (press /)"` keeps the announcement
  intact for screen readers.

---

## Cross-cutting themes (refresh)

1. **Recent micro-refactors landed cleanly.** The Sprint-1/2/3 work
   substantially raised the floor — auth flashes, validation
   feedback, prose width, print, and most accessibility commitments
   are now real. Remaining gaps cluster around **release/deploy UX**
   (SW updates, manifest splash, CSP tightening), **destructive
   admin actions** (no confirm on promote), and **consent
   compliance** (binary banner).
2. **`'This is the way' / 'Quick Calculator'` brand pivot is
   consistent** across hero, nudges, and member CTAs (recent commit
   history confirms a deliberate sweep). Worth one final check:
   screen-reader labels everywhere this idiomatic phrase replaced
   a verb-object label.
3. **The previous audit doc is excellent record-keeping** — keep
   the practice. The "shipped on …" annotations make Sprint review
   trivial. Suggest doing the same with this follow-up.

---

## Suggested next sprint

If shipping one more sprint, the highest-leverage bundle is:

1. **N1** (granular consent) + **N2** (PWA update toast) + **N3**
   (admin promote confirm) — compliance + safety in <1 day.
2. **N4** + **P5** + **C3** — polish that protects share/install
   surfaces.
3. **P1** + **F1** + **F2** — close out the "form goes silent"
   class of bugs. ~half a day.
4. **C1** + **C2** — content alignment, copy only.

Rough estimate: 1.5–2 days of work to take the site from B+/A- to a
defensible A.

---

## Method notes

- Static review only. Browser/runtime issues (live contrast,
  cookie-banner geolocation, install-prompt keyboard interaction)
  need on-device confirmation.
- File:line references reflect the audit-day tree on branch
  `claude/site-audit-ui-ux-content-G8W9r`.
- Three findings from initial scan were false positives and have
  been removed after verification:
  - GemaBot in-flight submit-guard (was complete in `ai-agent-1.mjs`).
  - Theme-toggle `aria-pressed`/`aria-label` updates (complete in
    `public-theme.js`).
  - Account-recovery resend countdown (complete in
    `account-recovery-1.js`).
  - Forum thread-list empty state (complete in `forum-1.js`).
  Documenting these here so future audits don't re-flag them.
