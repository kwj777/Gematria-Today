# Gematria.Today — Site-Wide UI/UX Audit

**Audit date:** 2026-05-24
**Scope:** All public pages, member/account flows, admin entry points, design system, accessibility, performance, PWA, and cookie/consent behavior.
**Method:** Static code review across HTML/CSS/JS, cross-referenced with existing `accessibility-audit.md`. No runtime browser testing was performed; findings flagged "verify in browser" need on-device confirmation.

---

## Executive summary

Gematria.Today is a **structurally mature static site** with a deliberate design system, accessible foundations, and good performance hygiene (preloaded fonts, deferred scripts, service worker, PWA manifest). The previous touch-target audit was applied cleanly.

The remaining gaps cluster in three areas:

1. **First-load and async UX** — pages depend heavily on JavaScript to populate hero/dashboard content, with `d-none` containers and no skeleton fallback. On slow networks or JS failures, users see blank panels or contradictory auth states.
2. **Microcopy and form feedback** — labels are accurate but error messaging, validation constraints, and "what happens next" copy are buried in helper text or rely on hidden DOM that JS reveals after submit.
3. **Information architecture in member, forum, and legal areas** — comprehensive content, but discoverability, cross-linking, and at-a-glance summaries are weak relative to the educational pages (which are very strong).

Overall grade: **B+** — solid foundations, clear path to A-tier with the ⚠️ Critical items below.

---

## ⚠️ Critical findings (fix first)

These materially block, mislead, or exclude users.

### C1. Blank-page flash on auth-gated pages
**Files:** `member.html:141`, `index.html` auth nav (`.nav-auth--anon` / `.nav-auth--member` toggled in JS).
The dashboard's main container starts as `d-none` and is unhidden by JS after auth check. There's no skeleton or loading state. Navbar auth buttons can briefly render both anon and member CTAs (or neither) before JS settles, depending on cookie read timing.
**Fix:** Set the auth class on `<html>` or `<body>` from `early-bootstrap.js` (already runs synchronously) so first paint is correct. Add a skeleton grid for `member.html` matching final layout.

### C2. Calculator value constraints invisible until submit
**Files:** `calculator.html:197-200`, plus all calculators.
Inputs accept words *or* numeric gematria values, but only "multiples of 6" for numbers. That constraint sits in `<p class="form-text">` *below* the input. There's no `aria-describedby` link from the input to the help text, no `aria-invalid="true"` flip on error, and no inline `role="alert"` region.
**Fix:** Wire `aria-describedby` to the help text, add an inline error region, and surface the multiple-of-6 rule in the placeholder or label suffix.

### C3. Name calculator labels visually hidden
**Files:** `name-calculator.html:145-148`.
First/middle/last name labels use `.visually-hidden`. Screen readers are fine; sighted users on mobile only see placeholders, which disappear on focus.
**Fix:** Show labels visibly on all viewports (small text above each input), or use floating labels.

### C4. Password mismatch + strength feedback hidden until submit
**Files:** `member.html:281` (`d-none` mismatch alert), `gematria-account-setup.html:215-219` (strength bar hidden by default), `account-recovery.html:214-220`.
Validation regions start with `d-none`; real-time JS toggles them. Users get no inline feedback while typing.
**Fix:** Render always-visible empty regions with `aria-live="polite"`. Always populate the strength meter as soon as the user types one character. Add live text ("Weak / Fair / Strong") next to the bar.

### C5. Account-recovery step 1 form stays visible after submit
**Files:** `account-recovery.html:141-189`.
After submission, the success panel appears *below* the form rather than replacing it. Keyboard and screen-reader users must scroll past the now-irrelevant form to find the confirmation.
**Fix:** Hide the step-1 form (`hidden` attribute + ARIA) when the success panel renders, and move focus to the success heading.

### C6. Forum: no empty state, no character counter, JS-only with weak fallback
**Files:** `forum.html:225, 317, 346, 364-373`.
Thread list (`#threadList`) is empty on first paint with no spinner or empty-state copy. Compose/reply textareas have `maxlength="5000"` but no live character count. Trending section renders an empty grid when zero threads exist.
**Fix:** Add a loading skeleton, an empty-state message ("No threads yet — start the conversation"), and a live char-count region with `aria-describedby` from each textarea.

### C7. GemaBot accepts spam submits while busy
**Files:** `ai-agent.html:285, 406-427`.
Form sets `aria-busy="true"` but the submit button is not disabled while a response is generating. Repeated clicks fire concurrent requests, costing API credits and confusing the chat log.
**Fix:** Disable submit (and Enter-to-submit) while `aria-busy`. Auto-scroll the chat log to the latest message on assistant reply.

### C8. No global prose line-length limit on wide screens
**Files:** `theme.css` (only `max-width: 52ch` at line 1006 in a narrow scope), `why-english-gematria.html`, `gematria-guide.html`, blog posts.
On 1440px+ displays, body text stretches well past 90ch, harming readability of long-form content.
**Fix:** Add `max-width: 70ch` (or `clamp(60ch, 100%, 75ch)`) to `article > p`, `.prose p`, blog body containers.

### C9. Accessibility statement is too vague to be a real commitment
**File:** `accessibility.html`.
Lists "Our approach" and "Known limitations" but names no specific pages, no WCAG version targeted, no remediation timeline, no expected response time for issues, no last-updated date.
**Fix:** Add (a) explicit WCAG 2.1 AA target, (b) list of audited vs unaudited pages, (c) known gaps (calculator dynamic results, forum, admin), (d) a response SLA ("we aim to respond within 5 business days"), (e) visible last-updated date.

### C10. Inconsistent / missing alt text on hero images
**Files:** `blog.html:171` (no alt), `calculator.html:131-137` (good alt), `faq.html:152-160` (good alt).
SVG heroes carry narrative meaning. Screen-reader users miss this on `blog.html`.
**Fix:** Audit every `<img>` site-wide. Decorative → `alt=""`. Meaningful → descriptive alt. Add to the editorial checklist.

### C11. Render-blocking inline script in head
**File:** `index.html:4` and equivalents — `<script src="/early-bootstrap.js">` runs synchronously before stylesheets.
At 2KB it's small, but it blocks first paint waiting for a network fetch (not inline).
**Fix:** Either inline the contents in `<head>` (no fetch), or move the visual parts (theme attribute) to an inline `<style>` swap, with auth-class logic running after.

### C12. Privacy policy lacks at-a-glance summary
**File:** `privacy.html:109` (effective date buried), no TL;DR section.
Users want to know in 5 seconds: "Do you sell my data? Use cookies? Share with whom?" The current page jumps straight into "Who we are."
**Fix:** Add a 3–4 line summary card before the TOC ("We do not sell your data. We use Google Analytics with consent in the EU/UK. Payment data is handled by Stripe. Full details below."), and elevate the effective date into the hero.

---

## ⚡ Important findings (fix soon)

### Navigation & global

- **N1.** Tools mega-menu toggle uses `href="/tools.html"` AND has a "Compare tools →" footer link. The toggle role is ambiguous — clicking the label may navigate away unexpectedly. Either drop the href or change the toggle to a pure dropdown button. (`partials/nav.html`)
- **N2.** No global form-control `:focus-visible` rule; some inputs may inherit Bootstrap's default blue ring instead of brand amber. (`theme.css`)
- **N3.** Mobile SiteSeeker search pill sits at the trailing edge of the navbar. On 360px viewports it competes for space with the hamburger and theme toggle. Consider an in-hero search on mobile or moving the pill into the drawer.

### Design system

- **D1.** Disabled amber button (`--brand-amber-disabled-bg: #b8a48a` on white) contrast ≈ 4.2:1 — passes AA by a hair, fails AAA. Pick a token that comfortably clears both.
- **D2.** `forum-theme.css` defines parallel spacing (`--forum-space-1..6`), typography clamps, and shadows instead of aliasing the main tokens. Maintenance debt — converge into `theme.css`.
- **D3.** No `font-size-adjust` on fallback stacks; expect 2–4% CLS when Fraunces 700 swaps in. Add `font-size-adjust: 0.5` (approximate) on body and headings, or use the Google Fonts size-adjusted fallback technique.
- **D4.** No semantic `--color-text` token for light-mode body text; inline hex `#35414f` recurs (e.g. `index.html:40`). Promote to a token.

### Public pages

- **P1.** Homepage hero `.hero-panel--compact .lead { display: none; }` on mobile (`index.html:67`) — removes the elevator pitch on the smallest screens. Keep a shortened version visible.
- **P2.** `form-control-lg` (Bootstrap 1.125rem ≈ 18px) avoids the iOS zoom trap, but inline-styled inputs on the hero quick-calc (`index.html:52-54`) need verification. Confirm computed `font-size >= 16px` on all calculator inputs.
- **P3.** `autocomplete="off"` on the calculator input (`calculator.html:200`) disables useful history. Remove or set to `autocomplete="on"`.
- **P4.** FAQ search input is `disabled` on initial load (`faq.html:145`), waiting on async tag fetch. Render an enabled input immediately and route early queries client-side.
- **P5.** Blog featured carousel is `d-none` by default with JS reveal (`blog.html:288`). If JS fails, featured content vanishes. Render server-side defaults and let JS enhance.
- **P6.** Follow.It embed has placeholder attributes `attr-a attr-b` (`blog.html:228`) — looks like an incomplete integration.
- **P7.** No "last updated" / methodology link on calculator pages. Add a small footer line linking to the guide or methodology section for credibility.

### Member & community

- **M1.** Comparison table for free vs premium is below the fold and below the signup tabs on `member.html`. Move above the tabs (or sticky) so visitors see what they're upgrading to before deciding to register.
- **M2.** Stripe checkout button (`member.html:492`) reads "Continue to Stripe" with no description of what happens next. Add "(opens Stripe secure checkout in a new tab)" and a lock icon.
- **M3.** Premium pricing ("$19 intro / year") doesn't explain renewal terms inline. Link to a short pricing FAQ or callout.
- **M4.** Logout button (`member.html:519`) is mixed into a button group with admin/profile actions. Visually elevate it or move it to a settings panel; add a confirm step.
- **M5.** Forum "Report thread" sits next to mod-only Lock/Delete buttons that are `d-none` for non-mods. The hidden affordances confuse moderators learning their tools and could leak via DOM inspection — tooltip + role-based labeling helps.
- **M6.** Forum "Premium members only" area filter is client-side only. Confirm server-enforced gating; if not, this is a security/UX disconnect.
- **M7.** GemaBot chat log lacks visual distinction between user and assistant turns (`ai-agent.html:93` — same dark background in dark mode). Add a clear visual treatment per role.
- **M8.** GemaBot "Save chat to dashboard" modal title says "Save calculation" — mismatched mental models. Clarify whether it saves a turn, the conversation, or just the latest calc.
- **M9.** Account-recovery resend countdown shown as static text (`account-recovery.html:186`) with no JS countdown updating. Either drive the timer or remove the suggestion of one.

### Content & legal

- **L1.** `gematria-guide.html` TOC (lines 161-176) is static. Make it sticky on `min-width: 992px` to match `definitions.html:144` pattern.
- **L2.** `why-english-gematria.html` has no in-page navigation despite being long-form. Add anchor TOC and at least one diagram (e.g., letter-value chart).
- **L3.** Legal pages (privacy, terms, disclaimer, accessibility) don't cross-link to one another. Add a small "Related: Privacy / Terms / Disclaimer / Accessibility" strip in each footer.
- **L4.** Standardize a visible "Last updated: <time datetime="...">..." line in every legal/educational page hero. Currently inconsistent across `basics`, `guide`, `privacy`, `terms`, `disclaimer`, and missing on `accessibility`.
- **L5.** Terms "Premium Membership" section (`terms.html:196-210`) is one dense `<ul>` with critical pricing buried in li #1. Break into definition list (`<dl>`) or sub-headed sections; pull pricing into a callout.
- **L6.** Definitions sidebar toggle on mobile (`definitions.html:633`) says "Sections" with no ▾ chevron — affordance unclear.
- **L7.** No `@media print` rules anywhere. Users printing the guide or legal pages get the navbar, footer, and dark backgrounds. Add a basic print stylesheet to `theme-deferred.css`.

### Accessibility, responsive, performance

- **A1.** `aria-atomic="true"` is on hero calculator output but missing from `blog.html:314` (post count) and `faq.html:147` (search status). Add for consistency.
- **A2.** Test horizontal scroll at 320px viewport on tools mega-menu, calculator hero, and definitions sidebar. Apply `overflow-x: clip` on `<body>` if needed as a safety net.
- **A3.** Document dark-mode contrast ratios for amber accents, table colors, breadcrumb links. Spot-check suggests pass, but no documentation exists.
- **A4.** Service worker (`sw.js`) refreshes caches silently. Add a "New version available — refresh to update" toast tied to the SW `updatefound` event.
- **A5.** Cookie consent banner (rendered at runtime by `cookie-consent.js`) was not statically verifiable. Manually test on EU/UK timezone: confirm "Decline all" is one click and equally weighted with "Accept all" (GDPR requirement). Confirm granular categories (analytics/marketing) are exposed if relied on.
- **A6.** Install-prompt UX (`pwa-register.js`) — verify the prompt is dismissable via keyboard, not just click.

---

## 💡 Polish (low-priority, high-quality wins)

- **Pol1.** Homepage hero "See related words →" link starts dim/inactive. Promote it to a stronger affordance once a value is entered (color change, micro-animation, or hint text "Press Enter to see matches").
- **Pol2.** Learning-path nudges repeat across pages (home, results, member). Consider one anchor per visit (cookie-flagged) to avoid banner fatigue.
- **Pol3.** SiteSeeker example questions presented as `.btn-outline-primary` (`searchbot.html`) — looks like form submits, but they prefill the textarea. Use a different visual (chips or pill links).
- **Pol4.** Tool comparison cards (`tools.html`) lack mini-previews. A small inline result example would shorten the gap between "describe" and "try."
- **Pol5.** Definition cards have no "Related: X, Y" cross-links between entries.
- **Pol6.** Add a "Print glossary" / "Export PDF" button on `definitions.html` for offline study.
- **Pol7.** "Clear conversation" in GemaBot should confirm before destroying history.
- **Pol8.** Badge page (`badge.html`) has no timeout state if API hangs. Add a 10s fallback "Couldn't load this badge — try again."
- **Pol9.** Theme toggle button has no `aria-pressed` label change between light/dark — screen readers don't hear the new state.
- **Pol10.** Disclaimer's AI-output language ("fabricated, hallucinated, not reviewed by a human") is accurate but alarmist. Reframe constructively: "AI outputs are generated automatically; please verify against primary sources before acting on them."
- **Pol11.** Offline page (`offline.html`) drops navbar/footer entirely; consider keeping the logo + a minimal "you're offline" badge for continuity.
- **Pol12.** Unsupported-browser page (`unsupported-browser.html`) doesn't name the user's current browser — adding `navigator.userAgentData.brand` (with fallback) would clarify what to upgrade.
- **Pol13.** Forum reputation scale (`forum-reputation-scale.html`) is excellent but unreachable from forum nav. Add a "Reputation explained" link in the forum header.
- **Pol14.** Footer is minimal across all pages — no email signup, no social, no quick-link grid. A modest expansion (3 columns: Learn, Tools, Legal) would aid orientation.

---

## Cross-cutting themes

1. **JS-dependent first paint.** A site-wide pattern of `d-none` containers populated by JS produces blank states, layout shifts, and auth-state flashing. Where possible, render a meaningful default in HTML; let JS *enhance*, not *create*.
2. **Microcopy under-invested.** Labels, placeholders, error messages, and "what happens next" lines are functional but rarely guiding. A microcopy pass focused on validation states, success messages, and CTAs would materially raise perceived quality.
3. **Soft cross-linking.** Educational content links to calculators excellently. The reverse (calculator → guide → glossary → blog) is weaker, and legal/community pages are nearly silos.
4. **Documentation drift.** `accessibility-audit.md` is great. The accessibility *page* is thin. Internal docs ahead of user-facing claims.

---

## Suggested roadmap

### Sprint 1 (1-2 weeks) — credibility & accessibility
- C1, C2, C3, C9, C10, C12, A1, A5, L4
- Eliminate the auth-state flash, the calculator constraint trap, and bring the accessibility statement up to a defensible claim.

### Sprint 2 (1-2 weeks) — member, forum, GemaBot UX
- C4, C5, C6, C7, M1, M2, M3, M4, M7
- Tighten the registration → dashboard → upgrade path and the forum/agent feedback loops.

### Sprint 3 (1 week) — content polish
- C8, C11, L1, L2, L3, L5, L7, P5, P6, D3
- Reading experience, performance budget, print support, deferred-script cleanup.

### Ongoing
- Microcopy pass across forms.
- Visual regression coverage for dark mode and 320px viewport.
- Manual screen-reader pass (NVDA + VoiceOver) on the seven primary user journeys (home → calculator → results → save → register → dashboard → upgrade).

---

## Method notes

- Static review only. Items tagged "verify in browser" require runtime testing.
- File:line references reflect the audit-day tree on branch `claude/site-ui-ux-audit-R8b5V`.
- The earlier WCAG 2.5.5 audit (`accessibility-audit.md`) was treated as already-shipped and was not re-evaluated.
