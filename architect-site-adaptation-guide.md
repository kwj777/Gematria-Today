# Reusing this basic site for a House Designer / Architect brand

If you want to turn this codebase into an architecture portfolio/business site, you can keep the existing structure and swap content, styling, and modules.

## 1) Rebrand core identity (first step)

Update global identity values on homepage and shared pages:
- Site title, meta description, Open Graph/Twitter tags
- Brand name in navbar and footer
- Favicon and logo assets

Primary file to start with:
- `public/index.html`

Key changes:
- Replace "EndTimes.Today" and gematria-related copy with your architecture studio identity.
- Update canonical URL and social preview image to your own domain and project image.
- Replace homepage hero headline/subheadline and CTA buttons with architecture-focused actions (e.g., "View Projects", "Book a Consultation").

## 2) Replace navigation and page IA (information architecture)

Current nav includes News/Blog/Gematria/FAQ/member features. For an architect site, change this to:
- Home
- Projects (Portfolio)
- Services
- About
- Process
- Testimonials
- Contact

Files to edit:
- `public/index.html` (header/nav + homepage sections)
- Other page files in `public/` to match your chosen nav structure

Recommended new pages:
- `public/projects.html`
- `public/project-detail.html`
- `public/services.html`
- `public/about.html`
- `public/process.html`
- `public/testimonials.html`

## 3) Rework homepage sections for architecture goals

Replace current topic-specific cards/carousels with:
- Hero with one strong project image and clear value proposition
- Featured projects grid (3–6 projects)
- Services snapshot (Residential, Renovation, Commercial, Interior Architecture)
- Design process timeline (Discovery → Concept → Development → Delivery)
- Social proof (client quotes/awards)
- Final CTA to contact/consultation

Use image-heavy layouts with short copy and clear calls to action.

## 4) Visual system updates (high impact)

Adapt style tokens and component appearance in:
- `public/theme.css`
- Any inline styles in `public/index.html`

Suggested design adjustments:
- Lighter neutral palette (off-white, charcoal, stone tones)
- Larger whitespace rhythm
- Serif + sans-serif pairing for premium studio feel
- Larger image cards with subtle hover effects
- Cleaner buttons and less saturated accent colors

## 5) Disable irrelevant modules/features

This repo supports module toggles through `public/site-modules.js`.

For an architecture site, you likely want to disable forum/chatbot/membership style modules unless you explicitly need them.

File:
- `public/site-modules.js`

Action:
- Set only the modules you still need in `DEFAULT_MODULES`.

## 6) Convert blog/news engine into case studies/journal

If you still want content marketing:
- Rename "Blog" to "Journal" or "Insights"
- Use post templates for case studies:
  - Project brief
  - Constraints
  - Design approach
  - Materials
  - Outcome/results

Likely touchpoints:
- `public/blog.html`
- Admin/content endpoints only if you keep dynamic publishing

## 7) Replace lead capture and contact workflow

For architecture businesses, contact quality matters more than raw volume.

Update contact forms to capture:
- Project type
- Property location
- Estimated budget range
- Timeline
- Scope summary

Files to review:
- `public/contact.html`
- Any related Netlify function handling submissions in `netlify/functions/`

## 8) Portfolio data model (if you want dynamic project pages)

If you want CMS-like project management, add a structured project model with:
- `slug`
- `project_name`
- `project_type`
- `location`
- `year`
- `area`
- `services`
- `cover_image_url`
- `gallery[]`
- `challenge`
- `solution`
- `materials`
- `results`

Then render it on project list/detail pages via serverless endpoints.

## 9) SEO & local business optimization

Add/replace schema and metadata with:
- `LocalBusiness` / `Architect` schema
- Service area pages (city/neighborhood specific)
- Project-specific metadata for each case study

Also ensure every project image has descriptive alt text.

## 10) Production checklist before launch

- Replace all gematria/topic-specific copy and assets.
- Verify nav links and page routes.
- Run module toggle defaults for the final architecture build.
- Check mobile typography and image cropping.
- Validate forms and conversion flow.
- Run root-page sync if you changed deployable pages:
  - `npm run sync-root-pages`

---


## Estimated timeline to go live

Typical timelines depend on how much dynamic functionality you keep, but for most small studio websites this is a realistic range:

- **Fast MVP launch (mostly static pages): 18–30 hours**
  - Rebrand identity/copy + asset swap: 4–6 hours
  - Homepage + navigation rebuild: 4–6 hours
  - Create core pages (Projects, Services, About, Contact): 6–10 hours
  - Mobile QA, SEO metadata pass, launch checks: 4–8 hours

- **Polished launch (custom styling + tighter content): 35–60 hours**
  - Everything in MVP scope, plus:
  - Stronger design system pass, refined responsive behavior, improved imagery/layout rhythm
  - Better project storytelling sections and conversion-focused contact UX

- **Dynamic portfolio/CMS-style launch: 60–110+ hours**
  - Includes data modeling, API wiring, admin/content workflow, QA hardening, and deployment validation

### Suggested planning buffer

Add **20–30% contingency** for content delays, image rework, domain/email setup, and late copy revisions.

If you want to ship quickly, target an MVP in 1 week of focused part-time execution (or 2–4 full working days), then iterate post-launch.

## Pricing guidance (dynamic portfolio + monthly admin)

For a U.S.-based freelance/small-studio market, a practical starting structure is:

- **One-time build (dynamic portfolio scope): $7,500–$18,000**
  - Lower end (~$7.5k–$10k): lean design customization, fewer templates, simple CMS workflow
  - Mid range (~$10k–$14k): stronger UI polish, richer case-study templates, better QA/content migration
  - Higher end (~$14k–$18k+): advanced interactions, deeper SEO setup, analytics/reporting, and process automation

- **Monthly admin/maintenance fee: $300–$1,500 per month**
  - **Light ($300–$500/mo):** hosting oversight, plugin/dependency updates, basic uptime checks, minor text/image edits
  - **Standard ($600–$900/mo):** light content uploads, monthly reporting, SEO hygiene, small UX tweaks
  - **Growth ($1,000–$1,500+/mo):** ongoing portfolio publishing support, CRO iterations, campaign landing pages, faster response SLA


### Does this include the value of the existing basic site code?

**Yes — it should.** The ranges above are meant to price the delivered business outcome, not only "new hours typed."

When reusing a completed base code system, you can price in one of two clear ways:

- **Outcome/value pricing (recommended):** keep the full project price range because the client is buying speed, reduced risk, and a proven foundation.
- **Line-item pricing:** show a separate "base platform license/reuse credit" line (often **$2,000–$6,000+** depending on capability) plus customization labor.

A simple proposal structure:
- Base platform/reuse value
- Architecture-specific customization
- Content migration + QA + launch
- Monthly admin retainer

This avoids the common mistake of underpricing just because the foundation already exists.

### A simple quote formula

Use this formula so pricing stays consistent:

`Project Price = (estimated hours × your rate) + 15–25% risk buffer + pass-through tools`

Example with dynamic scope:
- 80 hours × $120/hr = $9,600
- +20% buffer = $1,920
- + tools/setup (~$300)
- **Quote total ≈ $11,800**

### Recommended packaging

To avoid undercharging, offer 3 tiers and anchor to value:
- **Dynamic Starter:** around $8k + $400/mo
- **Dynamic Pro (recommended):** around $12k + $750/mo
- **Dynamic Premium:** around $16k + $1,200/mo

If they request frequent new pages, rapid edits, or ongoing content ops, use a monthly retainer with clear included hours and overage rate.

## Practical minimum viable conversion (fast path)

If you want the quickest high-quality transformation:
1. Rebrand `public/index.html` + `public/theme.css`
2. Create `projects.html`, `services.html`, `about.html`, `contact.html`
3. Disable unneeded modules in `public/site-modules.js`
4. Replace all hero/OG assets in `public/assets/`
5. Keep only one content stream (Journal) or remove it entirely

This gets you to a clean architecture website quickly, and you can add dynamic project management later.
