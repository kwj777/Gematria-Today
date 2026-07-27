# Gematria.Today — Full UI/UX Audit

**Audit date:** 2026-07-27
**Scope:** Entire surface — public pages, calculators, blog, educational and legal pages, member/auth flows, forum, GemaBot/SiteSeeker, the new server-generated `/w/:word` and `/v/:value` pages, admin surface, design system, PWA/offline, consent, and SEO plumbing.
**Method:** This is the first audit with **real runtime browser testing**, on top of deep static review. Built with `npm run build`, served `_site/` statically (no functions — every `/api/*` call 404s, which doubles as a backend-outage simulation), then drove Chromium via Playwright across 32 pages × two viewports (1440×900 light, 390×844 dark): screenshots, console/page-error capture, overflow checks, tab-order/focus-ring checks, and an interactive pass (dropdowns, Escape, theme toggle, hamburger, outside-tap close, empty submits). Also ran `scripts/accessibility-audit.mjs` and a custom internal link/anchor checker over every built page. Static review covered all page scripts, functions, and CSS, cross-checked against `ui-ux-audit.md` and `ui-ux-audit-2026-05-24-followup.md`.

---

## Executive summary

The foundations shipped by the previous two audits have **held**: every previously-shipped fix that was re-verified is still intact, and the runtime pass confirms the site's fundamentals actually work in a real browser — zero JS errors on 32 pages even with the entire backend down, no mobile overflow, working skip links, visible focus everywhere sampled, correct dropdown/hamburger/theme-toggle behavior, and graceful degradation on the home page, blog, FAQ, and calculators.

The problems now cluster in the **new and fast-moving surfaces**, which have not had the hardening the core pages received:

1. **Forum rendering is the single worst area** — member-authored content is interpolated into `innerHTML` unescaped (stored XSS reachable by any member, including into the admin report queue), fetch failures print raw `SyntaxError` text into the page, several action paths have no error handling at all, and the page has no footer.
2. **Money-path dead ends** — the signup "verify your email" instruction deletes itself after 6 seconds; every success/error message in the logged-in member dashboard renders into a hidden element; name-calculator result links dump users on the homepage; blog posts render with no visible title.
3. **The new `/w/`//v/` pages are 90% right but miss the last mile** — no Bootstrap JS (dead nav on the exact pages built to receive cold search traffic), no admin theme overrides, no security headers, self-canonicalizing case duplicates.
4. **Admin remains the least protected surface** — moderation and grant-premium actions fire with no confirmation, a transient API blip silently presents the login form, and dark mode breaks on report cards.

Overall grade: **B** — the core visitor journey is genuinely strong (A− on its own), but the Critical/High list below spans security, signup conversion, and community trust, and should be treated as one hardening sprint rather than a backlog.

---

## Runtime verification results (all passed)

Recording these so future audits don't re-test blind:

- **Zero JavaScript page errors** on all 32 tested pages, both viewports, both themes, with every API failing. All console errors were resource 404s only.
- **No horizontal overflow** at 390px anywhere tested.
- **Skip links** present and targeting real nodes; calculator tab order sane; **visible focus ring on every sampled tab stop**.
- No `<img>` without an `alt` attribute at runtime; no buttons/links without an accessible name detected.
- Desktop Tools/Learn **dropdowns open and close on Escape**; mobile **hamburger** opens with correct `aria-expanded` and **closes on outside tap** (recent commit verified working).
- **Theme toggle** flips light↔dark, updates `aria-pressed`, and persists across navigation.
- **Graceful degradation**: home page word-of-day and featured-posts panels show designed error states with escape hatches; blog falls back to static curated posts; calculator empty submit says "Please enter a word or phrase."
- **Internal link integrity**: scripted check of every `href`/`src`/anchor in every built page against files, redirects, and function routes found **zero broken internal links** (both my checker and an independent per-page pass).

## Prior-audit status

- Spot-verification across all areas found **no regressions** of items marked shipped in `ui-ux-audit-2026-05-24-followup.md` (in-flight guards, password meters, recovery flow focus management, forum skeletons/counters, consent banner, PWA update toast, promote-to-admin confirm, print styles, etc.).
- `C11` (inline early-bootstrap) remains correctly **won't-fix** (CSP trade-off) — not re-flagged.
- `Pol8` (badge fetch timeout) was "partial" and is **still open** — carried forward as L14.

---

## ⚠️ Critical

### C1. Forum renders member-authored content as raw HTML — stored XSS + broken rendering
**Files:** `page-scripts/forum-1.js:169, 176, 219, 246, 551-553`; server side `netlify/functions/member-forum.mjs:549-550`.
Thread titles and body previews in the list, reply bodies, trending-card titles, and the **admin moderation queue** (report reason, reporter username, details — attacker-controlled free text) are all interpolated into `innerHTML` without the `esc()` helper the same file uses elsewhere (the aria-label on the same card *is* escaped). The server stores title/body with only `.trim()`. Any member can post `<img src=x onerror=…>` and it executes for every reader, including admins reviewing reports. Even benignly, a legitimate title like `<3 gematria` silently vanishes.
**Fix:** wrap every interpolation in `esc()` (thread detail body already safely uses `textContent` at `forum-1.js:489`). Consider server-side sanitization as defense in depth.

---

## High

### H1. Forum error state leaks a raw JS exception and amputates the page *(runtime-verified)*
**Files:** `page-scripts/forum-1.js` (~10 catch sites: 558-586, 613, 634, and initial load).
With the API unreachable, forum.html renders a pink alert containing `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` — a raw `SyntaxError.message` — because every catch calls `showAlert(error.message)`. Any non-JSON response (maintenance page, 502 HTML, proxy error) surfaces verbatim. Below the alert the page just ends: `#forumApp` stays `d-none` and the page has no footer (H2), so there is no retry button, no rules card, nothing. Compare `calculator-1.js`, which wraps the same failure in "Something went wrong" + a Try again button.
**Fix:** map fetch/parse failures to friendly copy + a retry button; never print `error.message` raw into the DOM.

### H2. Four pages have no site footer *(runtime-verified)*
**Files:** `src/forum.html`, `src/forum-reputation-scale.html`, `src/premium-research.html`, `src/searchbot.html` — zero `{% footer %}` matches; confirmed in built output and screenshots.
Users on these pages lose the Learn/Tools/Community wayfinding grid and the Privacy/Terms/Contact strip. Forum is the landing point of the "community" funnel; it ends in whitespace.
**Fix:** add the footer shortcode (or at minimum the legal-links strip if the omission is deliberate for app-like pages).

### H3. Member dashboard feedback renders into a hidden element for logged-in users
**Files:** `src/member.html:208` (`#memberAlert` inside `#authSection`), `page-scripts/member-1.js:895` (auth section gets `d-none` when logged in).
Every `showAlert()` while signed in — "Payment received. Your premium membership is active." (`member-1.js:1463`), "Unable to delete history item." (`:1888`), "Stripe checkout was cancelled…" (`:2255`), "Profile saved…" (`:2575`), sync errors — writes into an invisible element. Screen readers get nothing either (`role="alert"` inside `display:none`).
**Fix:** move `#memberAlert` outside `#authSection`, or route logged-in feedback through the existing `window.showToast` primitive (`ui-feedback.js:479-517`).

### H4. Post-signup "verify your email" instruction self-destructs after 6 seconds
**Files:** `page-scripts/member-1.js:2340` (success alert), `:194-198` (6s auto-dismiss), `:679-683` ("Welcome back!" hero), `:2504-2510` (resend panel hidden until a *failed* login).
On member.html registration success, the only verification instruction is a success alert that auto-dismisses after 6 seconds; the view then flips to the login tab with a "Welcome back! Sign in below." hero — wrong for a brand-new unverified user. If the verification email never arrives (exactly the scenario recent commits targeted server-side), a user who looked away has zero on-page trace of what to do next.
**Fix:** render a persistent success panel (mirror `gematria-account-setup.html:178-193`, which does this correctly — email echo, spam hint, resend button), reveal `#resendVerificationPanel` immediately, and don't auto-dismiss this alert.

### H5. Generated `/w/`//v/` pages never load Bootstrap JS — nav is dead on arrival
**Files:** `netlify/functions/word-page.mjs:122-157` vs. real pages (`_site/calculator.html:244`).
The generated shell loads `early-bootstrap.js` + `site-bundle.js` but not `assets/vendor/bootstrap/js/bootstrap.bundle.min.js`, and `site-bundle.js` does not include Bootstrap's Collapse/Dropdown plugins. The injected nav relies on `data-bs-toggle`. Result: on mobile the hamburger does nothing; on desktop Tools/Learn never open — on the exact pages built to receive cold search traffic. The footer grid is the only working navigation.
**Fix:** add `<script defer src="/assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>` to `layout()`.

### H6. Name-calculator gematria values link to the homepage — a dead end
**Files:** `page-scripts/name-calculator-1.js:320-332`.
Every gematria total in a name result card links to `/?gematria=N&returnTo=…` in a new tab. Nothing on the home page reads a `gematria` param (repo-wide grep: only `gematria-results-1.js` and two functions do), and no redirect exists. The aria-label promises "Open words with gematria N"; the user lands on the homepage with the query silently ignored.
**Fix:** point at `/gematria-results.html?gematria=${total}&returnTo=…`.

### H7. Blog's advertised "/" search shortcut navigates users away from the blog
**Files:** `page-scripts/blog-2.js:1152-1168` vs. `nav-scroll.js:75-85` (shipped in `site-bundle.js:1788-1798`).
blog.html's search placeholder says "press /", and its handler focuses the input — but the global "/" shortcut also fires and unconditionally navigates to `/searchbot.html?focus=knowbot`. Neither checks `event.defaultPrevented`, so the input flashes focus, then the page leaves.
**Fix:** in `nav-scroll.js`, bail when `event.defaultPrevented` is true; keep `preventDefault()` in blog-2.js.

### H8. Blog post cards have no visible title — list *or* detail view
**Files:** `page-scripts/blog-2.js:1018` (card template), `blog-1.js` (`blog-detail-view` hides `#blogLandingHero`, the page's only `<h1>` — `src/blog.html:9-10, 100-104`).
The card template renders tags, read time, image, summary, buttons — never `post.title` (grep: title is used only for share metadata, series strips, related links, and image alt). In detail view the landing hero (and with it the `h1`) is hidden, so a post page can have **no title and no h1 anywhere on screen**. The search input even advertises "Search posts by title."
**Fix:** render `<h2 class="h4"><a href="…">${title}</a></h2>` in list cards; promote the title to an `<h1>` in detail view.

### H9. Results page fires one definition request per word, per keystroke
**Files:** `page-scripts/gematria-results-1.js:91-104, 229`.
`createWordItem` calls `hasDefinition(word)` (a Wordnik-backed fetch) for every list item, and the filter input re-renders the whole list on every keystroke with no debounce and no caching — a value with 200 matches costs 200 fetches on load and 200 more per character typed. Stalls mobile connections and hammers a rate-limited/paid function. Same per-card pattern exists (bounded, smaller lists) on both calculators (`calculator-1.js:718-745`, `name-calculator-1.js:374-395`).
**Fix:** memoize `hasDefinition` in a `Map`, debounce the filter, don't re-check already-rendered items.

### H10. Admin forum moderation applies destructive outcomes with zero confirmation
**Files:** `page-scripts/admin-forum-1.js:113-124, 179-194, 302-306`.
"Remove post", "Hide thread", "Warn user", and "Suspend" fire a PUT immediately on click; eight look-alike small buttons sit in a row, so a mis-click suspends a member with no confirm and no undo. Bulk Resolve also has no confirm. Category delete *does* confirm (`:243`) — the page is internally inconsistent.
**Fix:** `window.confirm` naming the user/thread on suspend/remove/hide/warn and bulk actions, mirroring the category-delete pattern.

### H11. Transient API failure on the admin dashboard silently "logs the admin out"
**Files:** `page-scripts/admin-1.js:878-909`.
`loadSession()` wraps the session check *and* `refreshDashboard()` (5 parallel fetches) in one try/catch; any single 500/network blip lands in the catch, which calls `setLoggedIn(false)` — the admin sees the login form with no error message despite a valid session.
**Fix:** catch `refreshDashboard()` separately and surface "Couldn't load dashboard data — retry."

### H12. Admin forum report cards are unreadable in dark mode
**Files:** `page-scripts/admin-forum-1.js:136` (`bg-white` card), `theme.css:933` (dark mode forces `.text-muted` to light).
Report cards hardcode `bg-white`; dark mode flips text light — light-gray text on a white card in the moderation queue.
**Fix:** drop `bg-white`, or add a `:root[data-bs-theme="dark"] .report-card` override. See also M32 for a site-wide `.bg-white` guard.

---

## Medium

### Word/value pages (new SEO surface)

- **M1. Admin theme customizations don't apply.** `word-page.mjs:141-144` omits the `/api/public-theme-css` preload every real page carries (`_site/calculator.html:36-37`). Owner-customized palettes silently don't reach the pages new visitors land on first. **Fix:** add the same preload + noscript pair (the promoter script is already in `site-bundle.js`).
- **M2. No security headers on generated pages.** `netlify.toml:380-409` headers don't apply to function responses; `word-page.mjs:228-236` sets only content-type and cache-control — no CSP, X-Frame-Options, or Referrer-Policy on `/w/*`, `/v/*`, or the words sitemaps. **Fix:** emit the header set from `htmlResponse()` via a shared constant.
- **M3. Case variants all self-canonicalize and index.** `word-page.mjs:191, 287, 300-301` — `/w/light`, `/w/Light`, `/w/LIGHT` each return 200, `index,follow`, and a different self-referencing canonical; the calculator permalink uses the user's exact casing (`calculator-1.js:685-694`), so mixed-case URLs occur naturally. Unbounded duplicate-content URLs per word. **Fix:** canonicalize to stored/lowercase form; 301 or at least point `rel=canonical` at the canonical casing.
- **M4. Related-words list is one enormous footer-styled column, capped at 200 with no way to see the rest.** `word-page.mjs:171-186` renders up to 200 words as `site-footer-list` (single-column, 0.85rem — `theme.css:1866-1881`); `related-word-list` has no CSS anywhere. Past 200, the only affordance is "Showing 200 of N." **Fix:** real multi-column styles with comfortable tap targets; give the >200 case an action (calculator search-by-value or pagination).
- **M5. Rate-limited and disabled-endpoint responses are raw JSON.** `word-page.mjs:316-321` returns `{"error":"…"}` as `application/json` for 429/404/503 thrown errors (limit 120/min/IP at `:243-250`). A person paging through word links — or a crawler burst after the 30k-URL sitemap submission — gets a bare JSON blob. **Fix:** render through `layout()` like the 404/500 paths, keep `retry-after`; consider a crawler allowance.

### Member, forum, bots

- **M6. member.html register: mismatched-password submit silently does nothing.** `member-1.js:11` references `registerPasswordMismatchAlert`, which doesn't exist in member.html, so `register-form.js:97-99` hits a null-safe no-op and returns — no alert, no focus, no `reportValidity`. **Fix:** show the page alert, focus the confirm field, drop the dead config.
- **M7. Account-setup form ships `novalidate` with no JS validation replacing it.** `gematria-account-setup.html:140`; `register-form.js` performs no required/minlength/email checks — an empty submit goes straight to the network. member.html's identical form omits `novalidate` and gets browser validation. **Fix:** remove `novalidate` or call `form.reportValidity()` before the fetch.
- **M8. Forum: five action paths have no error handling.** Thread-card click/Enter and trending-card click call `loadThread()` with no `.catch` (`forum-1.js:186, 192, 252`) — a failed fetch leaves the detail panel frozen at "Loading thread…" forever. `reportReply`/`deleteReply` bindings (`:223-229`) are also uncaught — a failed report gives zero feedback after the user typed a reason. **Fix:** add catches + reset the panel on failure.
- **M9. Forum composers have no busy state — double-submit posts duplicates.** `forum-1.js:597-636` never disables the submit button or sets `aria-busy` during the await; the API round trip plus two full reloads makes the window seconds long. **Fix:** disable + label-swap during submit (pattern exists in `register-form.js:115-118`).
- **M10. Forum report flow is a raw `window.prompt` with "spam" pre-filled.** `forum-1.js:504, 511` — Enter accidentally submits "spam"; free text is unvalidated (and rendered unescaped in the mod queue — C1); Cancel silently drops the report. **Fix:** small modal or inline radio list of reasons + optional details.
- **M11. No session-expiry handling in member dashboard or forum actions.** `member-1.js:568-583` has no 401 detection (failures land in the hidden alert per H3); forum's unauthorized detection exists only in `init()` (`forum-1.js:685-689`) — posting after expiry shows raw "Unauthorized" with no sign-in link. **Fix:** on 401, flip to logged-out view / reuse `showAuthRequiredAlert()`.
- **M12. GemaBot forced scroll + smooth-scroll ignores reduced motion.** `ai-agent-1.mjs:2073-2090` scrolls to bottom again after `finalize()` completes seconds later, yanking the viewport from wherever the user scrolled; `:745-753` hardcodes `behavior:'smooth'` (forum-1.js checks `prefers-reduced-motion` correctly at `:496-499`); `chatLog.scrollTop` write at `:746` is a no-op (not a scroll container). **Fix:** skip the post-finalize scroll if the user scrolled; gate smooth on the media query.
- **M13. Premium-research bounces non-premium visitors after a 1.8s flash; unescaped Wordnik echo.** `premium-research-1.js:233-246` renders a warning then hard-redirects to /member.html 1800ms later with no explanation at the destination; `renderWordnik` (`:72-75`) interpolates `payload.word`/`relationshipType`/result words into `innerHTML` unescaped (sibling `renderGematria` escapes). **Fix:** replace auto-redirect with a locked panel + upgrade CTA (or pass a query param member.html explains); escape the output.
- **M14. member.html saved-calculation titles render unescaped.** `member-1.js:1827` — `${item.queryText}` in `innerHTML` (the note field two lines down is escaped). A saved query containing `<` breaks the card. **Fix:** `escapeHtml(item.queryText)` (+ `:1828` fields).

### Public pages & calculators

- **M15. Blog newsletter email input is unlabeled and off-system** *(runtime + scanner-confirmed)*. `src/blog.html:176-179` — Follow.It embed: no label/aria-label/id (placeholder-only), raw browser-default input/button styling that clashes with the design system, submit navigates away to api.follow.it with no warning, and the `<h5>` breaks sidebar heading order (h2→h5→h3). **Fix:** `aria-label`, `.form-control`/`.btn` classes, new-tab or return handling, normalize headings.
- **M16. 404 page's search form throws the query away.** `src/404.html:130-141` submits `?q=` to searchbot, but nothing reads `q` (zero `URLSearchParams` hits in searchbot). Lost users retype. **Fix:** prefill (ideally auto-submit) from `q` on searchbot.
- **M17. Contact form fails silently on empty message.** `contact-1.js:75-80` with `novalidate` (`src/contact.html:105`): empty required message → just `messageEl.focus()`, no inline error, no `aria-invalid`, no live region — the exact pattern the calculators fixed (F3). **Fix:** mirror the calculator error pattern.
- **M18. /gematria-results.html without a value shows an infinite loading skeleton.** `gematria-results-1.js:203-208` sets developer-speak copy ("Missing gematria value in the page URL.") but never removes `#resultsLoadingShell`, which shimmers with `aria-busy="true"` forever. **Fix:** clear the shell; friendlier copy + CTA to the calculator.
- **M19. Guest "Save" behavior differs on all three calculators.** Calculator: shell ships visible then vanishes after session check (`calculator-1.js:592-605` vs `src/calculator.html:110`) — flash + layout shift, and the join CTA is hidden from its audience. Multi-cipher: popover pattern works (`multi-cipher-calculator-1.js:204-217`). Name calculator: `aria-disabled="true"` on a clickable button (`name-calculator-1.js:212-224`) and clicks never show the popover (`:985-989`). **Fix:** standardize on the multi-cipher pattern; ship the shell hidden; drop the bogus `aria-disabled`.
- **M20. tools.html's sample GemaBot answer contains fabricated gematria values.** `src/tools.html:668-679` claims 324 matches *truth* and *kingdom*, 336 matches *creator* and *sunrise* — all four are wrong under A=6…Z=156 (truth=522 per the same page's calculator card at `:479`; kingdom=438, creator=480, sunrise=630), and calls 12 "the smallest non-zero gap" (it's 6). Fabricated matches presented as marketing sample, on a research-credibility site. **Fix:** recompute with real values or drop the sentence.
- **M21. Calculator status lines aren't announced; one is dead.** `src/calculator.html:110` `#lookup-status` (receives "Calculating…", "Result copied…", and guest rate-limit **errors** via `calculator-1.js:1033`) has no `aria-live`/`role`; same for name-calculator `#status` (`src/name-calculator.html:87`); multi-cipher's `#multi-cipher-status` is only ever cleared. **Fix:** `role="status"` on all three; use or remove the dead one.
- **M22. Hard-coded `https://gematria.today/` internal links, including nav "Log in".** `src/_includes/nav.html:48, 54` (+ `gematria-guide.html:178`, `gematria-name-analysis.html:111`, `gematria-pattern-grouping.html:96`, `calculator-1.js:1140, 1149, 1181`, `name-calculator-1.js:336, 681`). Deploy previews and local dev silently punt users to production; `/member` also adds a 301 hop; several add `target="_blank"` to same-site links. **Fix:** make relative; reserve `_blank` for external.
- **M23. Reverse-lookup errors use a muted gray line instead of the error panel.** `calculator-1.js:1028-1036` — numeric-lookup failures (e.g. guest search limit) go to small `text-muted` `#lookup-status` (unannounced, no retry), while word-lookup failures get the red alert + focus + Retry (`:48-73`). **Fix:** route through `showCalculatorError`.

### Admin surface

- **M24. Session-expiry UX differs on every admin page; none pass `?next=`.** Hard redirect losing context (`admin-posts-1.js:592`, `admin-editorial-1.js:97`); linkless "Visit Admin to sign in" text (`admin-reports-1.js:436`, `admin-click-tracking-1.js:257`, `admin-chatbot-feedback-1.js:164`); mid-session 401s surface as raw "Request failed" — while `admin-1.js:841-876` already implements a safe `next` consumer. **Fix:** standardize on `/admin.html?next=<page>` + 401 detection in each `request()` helper.
- **M25. Admin login lands on the member page.** `admin-1.js:931` — "Unlock admin dashboard" redirects to `/member.html` when no `next` param. **Fix:** stay on admin (just `loadSession()`).
- **M26. Blog-post admin renders every post's full body + a complete edit form, unpaginated.** `admin-posts.mjs` has no LIMIT; `admin-posts-1.js:510-585` renders full body HTML, an 8-button toolbar, and a duplicate edit form per post; filters are status/date only. **Fix:** lazy body on `<details>`, inject edit form on demand, paginate ~20, add title search.
- **M27. Click-tracking detail table renders every event, re-filtered per keystroke.** `admin-click-tracking-1.js:181-208, 271` (no cap, no debounce; API unbounded; 365-day window offered). **Fix:** cap/paginate + debounce.
- **M28. Forum reports: up to 300 heavy cards, no pagination or count.** `admin-forum.mjs:121`, card template with 4 inputs + 8 buttons each. **Fix:** paginate ~25, show "showing X of Y".
- **M29. Admin form feedback lands off-screen; lifetimes inconsistent.** Alerts pinned above the fold (`admin.html:159-160`, `admin-forum.html:69`, `admin-posts.html:88-90`) with no scroll/focus on show; most persist forever, module-save clears at 10s (`admin-1.js:1141`), hub auto-hides **errors** at 6s (`admin-hub-2.js:8-15`). **Fix:** scroll+focus on show; auto-dismiss successes only.
- **M30. "Grant free premium membership" has no confirmation.** `admin-1.js:1200-1218` — a typo'd email grants a year of premium; sibling promote-to-admin got its confirm (prior N3). **Fix:** same confirm pattern echoing the email.
- **M31. Assorted admin input UX:** rejection reason via single-line `window.prompt` (`admin-editorial-1.js:133` — inline textarea like chatbot-feedback instead); hub site "removal" = blank the fields + Save, no per-row Remove, `#saveResult` has no `aria-live` (`admin-hub-2.js:378-401`, `admin-hub.html:176`); reports-page collapse toggles are bare ~20px chevrons, below the 24px minimum (`admin-reports.html:48-55, 175-210`, `theme.css:3054`); reports inline styles not theme-aware — light-on-light `.detail-report` in dark mode (`admin-reports.html:56-70`, `admin-reports-1.js:183, 262`); site-chatbot allows overlapping submissions (`admin-site-chatbot-1.js:128-167` — same class as prior C7).

### Design system & shared infrastructure

- **M32. Dark-mode `.bg-white` has no site override.** Root cause of H12 and a standing trap. **Fix:** `:root[data-bs-theme="dark"] .bg-white { background: var(--color-surface-dark) !important; }` mirroring the `#resultFeedbackPanel.bg-light` override at `theme.css:960`.
- **M33. z-index tokens for modal layering are inverted.** `theme.css:132-133` — `--z-modal: 2999` sits *below* `--z-modal-backdrop: 3000`. Latent today (only independent overlays use them) but any future modal+backdrop pair built on the tokens renders backdrop-over-dialog. **Fix:** swap.
- **M34. Working-overlay allowlist typo disables feedback on the name calculator.** `ui-feedback.js:66` (and shipped `site-bundle.js:481`): `'/namecalculator.html'` — real page is `/name-calculator.html`; `name-calculator-1.js:75-79` calls `showWorkingOverlay()` which no-ops there. Slow-connection users get no "Working…" state, unlike the main calculator. **Fix:** correct the path.
- **M35. Offline navigation to any uncached page silently serves the home page.** `sw.js:47-60` returns cached `/index.html` for every failed navigation; the well-built `offline.html` only appears if index isn't cached (it always is — precached). Offline tap on `/blog.html` → home page at the blog URL, no explanation. **Fix:** app-shell fallback for `/` only; `offline.html` otherwise.
- **M36. Consent cannot be changed after the first decision.** `cookie-consent.js:229` never re-shows the banner once localStorage is set; no "Cookie settings" affordance exists in footer or privacy page — while `src/privacy.html:175` promises "the controls on the Site". GDPR Art. 7(3) requires withdrawal as easy as consent. **Fix:** expose `reopen()` and add a "Cookie settings" link in the footer legal strip + privacy §Cookies.

---

## Low

- **L1. Calculator failure copy is developer jargon** *(runtime-verified)*: "Unexpected non-JSON response from server." (structure — heading + Try again — is right). Friendlier: "We couldn't reach the calculation service." Same class as H1 but properly wrapped.
- **L2. Word-of-day error panel leaves "Open in calculator" active with no word** *(runtime-verified)*: `home-page.js:288-306` failure branch never touches `calculatorCta` — a primary CTA pointing at an empty calculator inside an error panel. Hide/disable it; keep "Reload page" as the single action.
- **L3. Value-page word count disagrees with the visible list.** `word-page.mjs:210-216` counts unfiltered rows; `relatedList` filters blocklisted words + caps at 200 — "12 words share this value" above a list of 11. Count the publishable set.
- **L4. Value pages: wrong empty-state copy; junk values return 200.** "No *other* words…" on a page with no current word; `/v/999999999999` renders a live-looking dead page (noindex contains the SEO damage). Value-specific copy; 404 zero-row value pages.
- **L5. Silent fallback to a chrome-less generated page if partials fail to load.** `word-page.mjs:26-35` returns `''` on partial-read failure — the exact regression the "real site shell" commit fixed would ship silently. Log loudly and/or embed a minimal hardcoded fallback.
- **L6. Generated pages: no `BreadcrumbList` JSON-LD** (real pages have it — `_site/calculator.html:42-52`) despite rendering a visual breadcrumb; **no apple-touch-icon/theme-color/PWA meta** (`word-page.mjs:126-144`).
- **L7. GemaBot premium gate leaves example-prompt chips active — silent dead clicks.** Gate disables only form controls (`ai-agent-1.mjs:1295-1297`); chips (`ai-agent.html:389-394`) call `requestSubmit()` which is dropped at `:2106`. Disable the chips or flash the gate.
- **L8. GemaBot "Save chat" reports via blocking `window.alert()`** (`ai-agent-1.mjs:2185-2187`) — inconsistent with the site's toasts.
- **L9. SiteSeeker has no in-flight guard** (`searchbot-1.js:200-260`): concurrent submits race, last-to-arrive wins; Enter doesn't submit (GemaBot's does). Disable + "Searching…"; add the Enter handler.
- **L10. Members-only save popover's "Join" link is unreachable by keyboard** (`members-only-save-popover.js:65-80`): blur hides after 200ms before Tab can reach the link (WCAG 1.4.13). Cancel hide on `focusin` to the tip.
- **L11. Account-setup success panel: no focus move; pre-filled `role="status"` won't announce** (`gematria-account-setup-1.js:68-70`); resend button here has no 30s cooldown unlike both sibling flows (`:84-106`). Mirror account-recovery's `tabindex="-1"` + focus; add the cooldown.
- **L12. Name-calculator related-words failures masked as "No related words found."** (`name-calculator-1.js:795-803`). Carry an error flag.
- **L13. "See Full List in a New Window" fails silently under popup blockers** (`name-calculator-1.js:647-650`); generated window drops all site chrome/theme.
- **L14. Badge page still has no fetch timeout** (carried from Pol8): `badge-1.js:78-88` — hang = spinner forever. `AbortSignal.timeout(10000)`.
- **L15. Blog list fetches the entire archive two posts at a time** (`blog-2.js:609, 1299-1322`): N/2 sequential requests, full innerHTML re-render each — reflow under a reading user; "Load more" is vestigial. Raise page size; fetch on demand.
- **L16. Home quick-calc shows "0" for non-letter input with no explanation** (`home-page.js:390-443`). Caption "Only A–Z letters count" when total is 0 on non-empty input.
- **L17. gematria-results.html has no noscript fallback** (the three calculators have one). JS-off = skeleton forever.
- **L18. Learning-path progress bar math mismatches its label** (`src/gematria-basics.html:78-80`): `aria-valuemax=5 valuenow=2`, width 40%, label "Level 1/4".
- **L19. Consent banner: no focus move on show, Escape does nothing** (`cookie-consent.js:133-175`) — keyboard users reach it only at the end of tab order.
- **L20. Admin theme ignores OS dark preference** (`admin-theme.js:70-76` defaults light with its own key; public pages honor `prefers-color-scheme`) — white flash + light admin for dark-mode admins on first visit.
- **L21. Admin details:** "Publishing" card header is a nav link disguised as a collapse toggle (`admin.html:165-174`); admin nav sets differ per page (Reports/Click-Tracking/Chatbot-Feedback each appear on some navs only — needs one canonical partial); `admin-forum-reputation-scale.html` skips admin chrome entirely (no theme script, skip link — stays light for dark-mode admins); category edit rows have unassociated labels (`admin-forum-1.js:203-219`); WYSIWYG `contenteditable` divs have no accessible name (`admin-posts.html:104-116` — `for` doesn't bind to a div; also `document.execCommand` is deprecated); no unsaved-changes guard in the post editor (un-confirmed `type="reset"`, `beforeunload`); dead legacy publishing form still wired (`admin.html:163`, `admin-1.js:1360-1382` — `?loadProposal=` "succeeds" invisibly); color-picker + import file inputs need labels (scanner-confirmed: `admin-forum.html:170` + template `admin-forum-1.js:213`; `admin-posts.html:127` for parity with `admin.html:194`).
- **L22. Reduced-motion misses the PWA launch spinner.** `theme.css:4587` catch-all covers the other spinners but not `.pwa-launch-overlay__spinner` (`:3703-3709`) — infinite animation for reduced-motion users on every installed-app launch. Add it to the block.

## Polish

- **P1. Footer "Version: — · Check for updates" renders a bare em-dash when the version API is down** *(runtime-verified)*. Hide the line until resolved.
- **P2. Word pages: no `og:image`/`twitter:image`** (real pages ship both) — text-only share cards; **footer tagline drift** ("a suite of research tools." vs built "research tools and calculators.", `word-page.mjs:40`); **error pages canonicalize to the homepage** (`word-page.mjs:253-268, 324-329`) — omit canonical + add noindex there.
- **P3. Reputation scale promises "+5: Helpful upvote" but no upvote control exists anywhere** (`forum-reputation-scale.html:71`; grep: zero vote/react code client or server). Ship it or reword.
- **P4. GemaBot chat log semantics:** bare `aria-live="polite"` div announces the user's own turns and whole HTML tables (`ai-agent.html:388`); consider `role="log"` scoped to assistant turns. Tips never mention Enter sends / Shift+Enter newline.
- **P5. Dead home-page hooks** (`home-page.js:66, 228-241` target a carousel that no longer exists); hero deep-link static label differs from the JS-set label (`src/index.html:169` vs `home-page.js:419, 432`).
- **P6. FAQ deep links scroll but don't move focus** (`faq-1.js:281-303`) — add `button.focus()`.
- **P7. Glossary term buttons add a tab stop per term** (`glossary-popup.js:271-277`) — a dozen-plus extra stops on long educational pages; consider limiting.
- **P8. Admin micro-copy:** task "Done" button is `btn-outline-danger` (completing isn't destructive, `admin-1.js:724`); FAQ delete confirm is anonymous while post delete names the title (`:1495` vs `:1484`); save-note modal on name-calculator says "saved search" under a "Save results" title (`src/name-calculator.html:97-103`).
- **P9. Type-scale tokens barely adopted:** `--font-size-*` used ~8 times against ~60 hard-coded near-duplicate sizes (0.72/0.75/0.78/0.8/0.85/0.86/0.9/0.95rem) — the mechanism behind recurring drift. Route new work through tokens.
- **P10. Baseline-scanner hygiene:** `follow.it-verification-code.html` (third-party stub) triggers lang/main/h1 flags — exclude it from the scan or accept; the three `recoveryRequestType` radios are a **false positive** (wrapped in `<label class="recovery-radio-card">` inside a proper fieldset/legend — valid implicit labeling; optionally add `for`/`id` to silence tools).

---

## Strengths worth keeping (verified this audit)

- **Runtime resilience** is real, not aspirational: with the entire API down, 32 pages render with zero JS errors, designed error states, and working navigation (see Runtime verification results).
- **Calculator form UX is now exemplary** and should be the template for contact/account-setup: per-input `role="alert"` via `aria-describedby`, `aria-invalid`, focus-to-error, typing clears state, spinner + `aria-busy` submits, backend-error panels with Retry that receive focus.
- **The word-pages backend is thoughtfully engineered**: consistent junk-word policy across storage/render/sitemaps, escaped HTML/XML everywhere, chunked versioned sitemaps, noindex-but-render for thin content, calculator CTA on every page including 404s, and unusually good test coverage (`tests/word-page.test.mjs`).
- **PWA update flow is exemplary** (user-consent toast, no auto-skipWaiting, visibility-based checks, version stamp) and the SW **never caches sensitive paths** (`/admin`, `/member`, `/api/`).
- **Toast primitive a11y is right** (`ui-feedback.js:417-521`): live region, assertive danger, danger never auto-dismisses, reduced-motion, keyboard-dismissable.
- **Design-system fundamentals**: 60+ `:focus-visible` rules with a branded catch-all, `forced-colors` support, thorough print styles, 44px touch-target utilities, dark-mode form chrome.
- **Account-recovery flow** remains the gold standard for the site's async form UX (hidden step-1, focus to confirmation, masked email, live countdown) — H4's fix should copy it.
- **Admin loading states** are consistently good (skeletons + `aria-busy` + visually-hidden text), and the destructive confirms that exist (promote-to-admin, post/category/proposal deletes) are well done — the gaps (H10, M30) are omissions, not bad patterns.
- **Internal link integrity is perfect** across all built pages (two independent checks).

---

## Suggested sprints

**Sprint 1 — Security & trust (small diffs, highest stakes):**
C1 forum escaping (one file; `esc()` already exists) · M14 saved-titles escape · M13 Wordnik echo escape · M2 word-page security headers · H10 + M30 admin confirms.

**Sprint 2 — Stop losing users at the money paths:**
H4 persistent verification panel (copy account-setup's) + H3 `#memberAlert` relocation (closes the "signups lost to undelivered email" loop from the UI side) · H6 name-calculator dead link · H8 blog titles/h1 · H7 "/" shortcut collision · H1/H2 forum error state + footers · M16 404 search handoff.

**Sprint 3 — Word-pages parity (one function file):**
H5 Bootstrap JS · M1 theme CSS · M3 canonical casing · M4 related-list styling · M5 HTML error pages · L3-L6 + P2.

**Sprint 4 — Admin hygiene:**
H11 session-vs-data failure split · H12 + M32 dark-mode `.bg-white` · M24/M25 session-expiry standardization · M26-M28 pagination · M29 alert scroll/focus · M31 batch.

**Sprint 5 — Platform polish:**
M34 overlay typo (one line) · M35 offline fallback · M36 consent reopen · H9 + L15 fetch discipline · M21 status live regions · M12 scroll behavior · remaining Lows.

---

*Method note: runtime testing was static-serve only (no Netlify functions), so function-rendered pages (`/w/`, `/v/`) and authenticated states were reviewed statically; findings there are code-verified but tagged for on-device confirmation after deploy. Screenshots and the full per-page runtime report were generated in the session workspace and are reproducible via `npm run build` + Playwright against `_site/`.*
