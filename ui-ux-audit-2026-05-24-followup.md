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
| C11 early-bootstrap inlined | ❌ **still external** | `index.html:4` still loads `/early-bootstrap.js` as a separate request. |
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

- **P2.** `tools.html:121-125` — The hero is *display:none* for all
  signed-in users (`auth-free`, `auth-premium`, `auth-lifetime`). The
  comment ("Logged-in members already know what these tools are")
  trades navigation context for one row of vertical space; without
  the hero, returning members land directly on a grid with no page
  H1 in view above the fold. Keep at least the `<h1>` and a one-line
  kicker so screen readers and orientation cues survive.

- **P3.** ✅ shipped — every "This is the way →" CTA now carries
  `aria-label="Start the free beginner path"` while keeping the
  visible brand-voice text: home (`index.html:253`), calculator
  nudge (`calculator.html:163`), results nudge
  (`gematria-results.html:124`), member dashboard
  (`member.html:421`), and `definitions.html:988`. The member
  dashboard's JS (`page-scripts/member-1.js:822`) removes the
  override when the visible text flips to the self-describing
  "Continue Level N" variant. Closes cross-cutting theme #2.

- **P4.** Featured blog carousel on `index.html:288` still uses
  `d-none` (`data-module="blog_home_slider"`). Server-render at least
  the first slide so JS-disabled / failed-load users see featured
  content. Audit P5 was marked shipped on `blog.html` but the home
  embed is the same anti-pattern.

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

- **S1.** `netlify.toml:116` — CSP includes
  `style-src 'self' … 'unsafe-inline'`. Every public page ships
  inline `<style>` blocks, so this can't be tightened without first
  externalizing them. Track this as a budget item: move per-page
  styles into either `theme.css` or a `page-scripts/<page>.css`
  bundle and drop `'unsafe-inline'` from style-src. Until then,
  document the deliberate choice somewhere visible (the audit doc,
  for example) so future contributors don't assume CSP is fully
  locked down.

- **S2.** `netlify.toml` headers — no `Cross-Origin-Embedder-Policy`
  is set. Combined with COOP `same-origin`, COEP would be required
  for crossOriginIsolated APIs (SharedArrayBuffer, high-res timers).
  This is a non-issue *today*, but if the GemaBot adds any heavy
  client compute later you'll want it. Add a comment in the toml
  noting that COEP is intentionally omitted while embeddable assets
  (e.g. Follow.It) need cross-origin access.

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

- **Pol1.** `index.html:249` — beginner-path promo heading is
  `<h2 class="h6">`. The semantic level is correct (it's a section
  heading) but visually styled as h6 inside an aside while the next
  section uses `<h3 class="feature-card-icon__title">`. The visual
  hierarchy reads "small → bigger → bigger", which inverts the
  semantic order. Either downstyle the feature cards or upstyle the
  promo heading; pick one rhythm.

- **Pol2.** `manifest.webmanifest` — no `categories`, no
  `screenshots`, no `shortcuts`. Adding
  `"shortcuts": [{name:"Calculator", url:"/calculator.html"}, …]`
  unlocks long-press menu actions on Android installs at near-zero
  cost.

- **Pol3.** `forum-theme.css` still declares its own
  `--forum-space-*` token ladder rather than aliasing the main
  `theme.css` tokens. Audit's D2 explicitly flagged this; the file
  hasn't converged. Convert each forum token to
  `--forum-space-1: var(--spacing-1, 0.25rem);` etc., or drop the
  shadowed declarations entirely.

- **Pol4.** `accessibility.html` lists known limitations but does
  not link to the live `accessibility-audit.md` doc that backs the
  WCAG 2.5.5 work. Two clicks from "Read our methodology" → the audit
  file would make the public commitment auditable.

- **Pol5.** `pwa-register.js:113-117` — iOS install instructions use
  the literal `􀈂` glyph for the Share icon. On any device that
  isn't iOS, this renders as a tofu box (and on some macOS Safari
  versions too). Wrap it with `font-family: -apple-system` so other
  devices that hit the rule still render gracefully — or just hide
  the icon char entirely when not on iOS.

- **Pol6.** Footer copy on all pages: "Gematria.Today — a suite of
  research tools." is identical across 40+ pages. Consider adding a
  one-line context per top-level area (Tools / Members / Legal) so
  the footer doubles as a wayfinding cue.

- **Pol7.** `member.html` and `gematria-account-setup.html` both
  have password strength meters; the labels arrays are defined
  separately in each file
  (`STRENGTH_LABELS = ['Too short','Weak','Fair','Good','Strong']`).
  Extract to a shared helper to avoid drift when copy changes.

- **Pol8.** `theme-deferred.css` — print stylesheet hides
  `.skip-link` and nav (good), but doesn't normalize background
  colors. Long-form pages (`gematria-guide.html`,
  `why-english-gematria.html`) still print with the parchment
  `--brand-surface` tint, wasting ink. Add
  `@media print { body, main, .content-panel { background: #fff !important; color: #000; } }`.

- **Pol9.** `tools.html` and `gematria-guide.html` link to the
  individual calculators, but the calculators don't link back. Add a
  small "← Back to all tools" affordance in the calculator hero so
  the journey is two-way.

- **Pol10.** `definitions.html` mobile sidebar toggle still labels
  itself "Sections" without a `▾` chevron — audit's L6 wasn't
  addressed in any sprint. The affordance reads as a static heading
  on mobile, not a toggle.

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
