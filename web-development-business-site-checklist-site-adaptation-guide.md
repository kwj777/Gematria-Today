# Web Development Business Site Checklist

Use this checklist to adapt this codebase into a **web development agency or freelance business site** with clear positioning, conversion-focused pages, qualified lead capture, and launch readiness controls.

## 1) Lock positioning and offer strategy first

- [ ] Define target client segment (local SMB, B2B SaaS, ecommerce, startups, nonprofits).
- [ ] Choose primary business outcome promise (more leads, faster site speed, higher conversion rates, scalable platform).
- [ ] Define service ladder (starter builds, growth redesigns, retainers).
- [ ] Pick one primary conversion event (book call, request audit, start project brief).
- [ ] Align messaging, page architecture, and forms to this single conversion goal.

## 2) Rebrand global identity and trust signals

- [ ] Replace site name, tagline, and brand narrative.
- [ ] Update `<title>`, meta descriptions, canonical URLs, and social share metadata.
- [ ] Replace logo and favicon assets.
- [ ] Update footer/company/legal contact language.
- [ ] Update `public/index.html`.
- [ ] Update shared pages in `public/*.html`.
- [ ] Update brand assets in `public/assets/`.

## 3) Replace navigation with agency-oriented IA

- [ ] Confirm top-level nav: Home, Services, Portfolio/Case Studies, Process, Pricing/Plans, About, Contact.
- [ ] Keep Blog/Resources only if content marketing is part of acquisition strategy.
- [ ] Ensure primary CTA appears in header on desktop and mobile.
- [ ] Ensure footer links match header architecture and legal requirements.

## 4) Build essential conversion pages

- [ ] Create or repurpose `public/services.html`.
- [ ] Create or repurpose `public/portfolio.html`.
- [ ] Create or repurpose `public/case-study.html`.
- [ ] Create or repurpose `public/process.html`.
- [ ] Create or repurpose `public/pricing.html`.
- [ ] Validate visitor flow: Home → Service detail → Contact/Book call.

## 5) Rework homepage for pipeline generation

- [ ] Add outcome-focused hero headline and subheadline.
- [ ] Add clear CTA buttons (“Book a Strategy Call”, “Request a Website Audit”, etc.).
- [ ] Add service overview cards.
- [ ] Add case-study preview with measurable results.
- [ ] Add social proof/testimonials and trust logos.
- [ ] Add final CTA section with next-step expectations.
- [ ] Ensure mobile scanning and CTA visibility above the fold.

## 6) Package services in buyer-friendly structure

- [ ] Define 3–5 productized offers (marketing sites, ecommerce, CRO, speed/SEO, maintenance).
- [ ] Document deliverables per offer.
- [ ] Document timeline ranges per offer.
- [ ] Document starting pricing model/range (or clear quote framework).
- [ ] Include success metric examples for each offer.

## 7) Configure modules for a clean agency build

- [ ] Review toggles in `public/site-modules.js`.
- [ ] Disable `forum` unless community is intentional.
- [ ] Disable `knowbot` unless it directly supports lead qualification.
- [ ] Disable `gemabot` unless required for scope.
- [ ] Disable `membership` unless client portals are part of delivery.
- [ ] Keep only modules that support acquisition and delivery.

## 8) Modernize visual system and UX consistency

- [ ] Update design tokens and component styles in `public/theme.css`.
- [ ] Standardize button hierarchy and form styles.
- [ ] Improve spacing rhythm and section scannability.
- [ ] Ensure WCAG-friendly contrast and keyboard focus visibility.
- [ ] Validate responsive behavior across major breakpoints.

## 9) Upgrade lead capture and qualification flow

- [ ] Update `public/contact.html` for project qualification fields.
- [ ] Capture project type, budget range, timeline, and required integrations.
- [ ] Include website URL/company context fields.
- [ ] Set confirmation messaging with SLA and next steps.
- [ ] Verify form handlers in `netlify/functions/` if dynamic processing is used.

## 10) Build repeatable case-study narrative format

- [ ] Include context/objective.
- [ ] Include constraints and strategy.
- [ ] Include implementation details and stack.
- [ ] Include quantified outcomes (speed, conversion, leads, revenue).
- [ ] Include post-launch support/optimization scope.

## 11) Baseline SEO, analytics, and compliance

- [ ] Ensure unique metadata for each indexable page.
- [ ] Verify canonical URL correctness and social image mapping.
- [ ] Validate semantic heading order and image alt text.
- [ ] Add/update analytics events for CTA clicks and form submissions.
- [ ] Update `public/privacy.html`, `public/terms.html`, `public/disclaimer.html`, and `public/accessibility.html`.

## 12) Sync artifacts and launch checks

- [ ] Run `npm run sync:site-adaptation-guides`.
- [ ] Run `npm run check:site-adaptation-guides`.
- [ ] Run `npm run sync-root-pages` if deployable pages/scripts changed.
- [ ] Run `npm run check-root-pages` if root/public mirror integrity is required.
- [ ] Run `npm run test` and `npm run lint` before deployment.
- [ ] Smoke test critical flows on desktop and mobile.
