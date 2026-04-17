# Reusing this basic site code for any adaptation

This guide is the shared playbook for adapting this codebase into any niche website (services, ecommerce, nonprofit, church, portfolio, media, etc.).

## 1) Start with the canonical source of truth

Always make page/content changes in `public/` first.

- Deployable pages and scripts live in `public/`.
- Root-level page files are mirrors for compatibility and should not be manually edited.
- After updates, run root sync so mirrors stay current.

Core commands:

```bash
npm run sync-root-pages
npm run check-root-pages
```

## 2) Define adaptation scope before editing

Before changing code, lock in:

- Business type and primary conversion goal (book call, purchase, donation, signup, etc.)
- Required pages and user journeys
- Features to keep/disable (forum, blog, news, membership, chatbot)
- Must-have integrations (email, payments, analytics, CRM)
- Content ownership and launch timeline

This avoids rework and keeps page architecture clean.

## 3) Rebrand global identity

Update global brand elements everywhere they appear:

- Site name and tagline
- `<title>` and meta descriptions
- Open Graph/Twitter previews
- Canonical URLs
- Logo and favicon assets
- Footer legal/company copy

Primary files:

- `public/index.html`
- Shared static pages in `public/*.html`
- `public/assets/` for branding graphics

## 4) Restructure information architecture (IA)

Replace niche-specific navigation with your adaptation-specific sitemap.

Typical page set to decide:

- Home
- Product/Service pages
- About/Team
- Blog/Resources (optional)
- Contact/Lead form
- Legal pages (privacy, terms, disclaimer, accessibility)

Ensure header and footer links are consistent across all pages.

## 5) Tune module toggles for the target build

This repository supports modular feature gating through:

- `public/site-modules.js`

Action:

- Edit `DEFAULT_MODULES` to enable only features needed for the adaptation.
- Keep unnecessary modules off to reduce UI noise and maintenance overhead.

Examples of modules often disabled in simple brochure builds:

- `forum`
- `knowbot`
- `gemabot`
- `membership`

## 6) Adapt design tokens and component styling

Apply a cohesive visual system update in:

- `public/theme.css`
- Any page-level inline styles that remain

Recommended adaptation pass:

- Brand color palette
- Typography hierarchy
- Spacing rhythm (section padding, card spacing)
- Button variants and form controls
- Card/table/alert visual consistency
- Responsive breakpoints and mobile readability

## 7) Replace homepage and key page modules with domain content

Swap out existing topic content with adaptation-specific blocks:

- Hero value proposition + primary CTA
- Trust signals (logos, testimonials, outcomes)
- Offer/service/product highlights
- FAQ or objections section
- Final conversion CTA

For each page, confirm:

- Purpose is clear in first viewport
- CTA matches business goal
- Content is scannable on mobile

## 8) Update conversion flows and form schemas

For lead or transaction workflows:

- Update form fields to collect useful qualification data
- Verify corresponding Netlify functions in `netlify/functions/`
- Validate success/failure states and error messages
- Confirm outbound email/payment integrations are configured

If adaptation does not need dynamic workflows, simplify to static/contact flow only.

## 9) SEO, accessibility, and compliance baseline

Before launch, verify:

- Unique title/description per indexed page
- Correct canonical URLs and social preview metadata
- Semantic headings (`h1` → `h2` structure)
- Meaningful alt text for images
- Keyboard-focus visibility and form labels
- Updated `public/privacy.html`, `public/terms.html`, and relevant legal language

## 10) Sync adaptation guides and root mirrors

When adding/updating adaptation guides (`*-site-adaptation-guide.md`), keep generated HTML in sync:

```bash
npm run sync:site-adaptation-guides
npm run check:site-adaptation-guides
```

Also sync root mirrors after page/script changes:

```bash
npm run sync-root-pages
npm run check-root-pages
```

## 11) Quality checks before deploy

Minimum checks:

```bash
npm run check:site-adaptation-guides
npm run check-root-pages
npm run test
npm run lint
```

If a check fails, fix the issue before release.

## 12) Launch checklist for every adaptation

- [ ] Brand copy/assets replaced globally
- [ ] Navigation and routes are valid
- [ ] Required modules enabled, unnecessary modules disabled
- [ ] Forms submit successfully and endpoints respond as expected
- [ ] SEO metadata and social previews updated
- [ ] Legal/compliance pages updated
- [ ] Root mirror and guide sync checks pass
- [ ] Smoke test complete on mobile + desktop

---

## Recommended execution order (fastest reliable path)

1. Define scope and page map
2. Rebrand identity and navigation
3. Update modules and styling system
4. Rewrite homepage + key conversion pages
5. Wire/verify forms and integrations
6. Run sync + QA commands
7. Deploy and monitor

Using this order keeps adaptation work consistent, reduces regression risk, and makes this base code reusable across future niches.
