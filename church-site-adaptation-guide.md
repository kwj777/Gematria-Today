# Reusing this basic site for a Church Website

If you want to adapt this codebase into a church website, you can keep the existing page framework and replace content, navigation, modules, and visuals for ministry goals.

## 1) Rebrand the site identity first

Update global identity across the homepage and shared pages:
- Site name and tagline
- Meta description, Open Graph, and Twitter preview tags
- Logo, favicon, and social preview image
- Footer organization details

Primary file to start with:
- `public/index.html`

Key changes:
- Replace current brand references with your church name, mission statement, and city.
- Update canonical URL and social image URLs to your church domain.
- Rewrite homepage hero copy around welcoming visitors and Sunday service information.

## 2) Redesign navigation around church visitor needs

A practical primary navigation for churches:
- Home
- New Here
- About
- Ministries
- Sermons
- Events
- Give
- Contact

Files to update:
- `public/index.html` (header and homepage sections)
- Other page templates in `public/` to match final navigation

Recommended new pages:
- `public/new-here.html`
- `public/about.html`
- `public/ministries.html`
- `public/sermons.html`
- `public/events.html`
- `public/give.html`
- `public/prayer.html`

## 3) Restructure homepage sections for church outcomes

Replace topic-specific sections with ministry-focused blocks:
- Hero with church welcome message and service times
- “Plan Your Visit” section (location, kids check-in, parking)
- Upcoming events highlights
- Latest sermon preview (video/audio + notes link)
- Ministries overview (kids, youth, adults, care)
- Prayer request and giving CTAs

Keep copy warm and simple, and use prominent action buttons.

## 4) Adjust visual design for warmth and clarity

Primary style files:
- `public/theme.css`
- Inline styles in `public/index.html` where applicable

Suggested design direction:
- Soft neutral background and accessible contrast
- Clear typography and generous spacing
- Large, authentic community photos
- Consistent button hierarchy for “Plan a Visit,” “Watch Sermons,” and “Give”

## 5) Disable modules that are not ministry-relevant

This repository supports feature toggles via:
- `public/site-modules.js`

Action:
- Keep only modules you need for launch.
- Disable forum/chatbot/member flows unless they support a defined ministry requirement.

## 6) Convert blog/news into Sermons + Devotionals

Recommended content model:
- **Sermons:** series title, speaker, date, scripture, media URL, notes
- **Devotionals/Updates:** short pastoral messages and church announcements

Likely touchpoints:
- `public/blog.html` (if repurposed)
- Related content functions in `netlify/functions/` if you keep dynamic publishing

## 7) Build a church-first contact flow

Update contact forms to capture:
- Prayer requests
- Pastoral care follow-up needs
- Volunteer interest areas
- New visitor follow-up preferences

Files to review:
- `public/contact.html`
- Any submission handlers in `netlify/functions/`

## 8) Define data structures for sermons and events (if dynamic)

Suggested **sermon** fields:
- `slug`
- `title`
- `series`
- `speaker`
- `scripture`
- `published_at`
- `video_url`
- `audio_url`
- `notes_markdown`

Suggested **event** fields:
- `slug`
- `name`
- `description`
- `location`
- `start_at`
- `end_at`
- `audience`
- `registration_url`

## 9) Accessibility and inclusion essentials

Church websites serve all age groups and abilities; prioritize:
- Strong color contrast and readable font sizing
- Keyboard-friendly navigation and form controls
- Alt text on all ministry and event imagery
- Captions/transcripts for sermon media where possible

You can use:
- `npm run accessibility:audit`

## 10) Local SEO and discoverability

Add/replace metadata with church-specific information:
- Organization name, denomination (if applicable), and address
- Service times and campus details
- Structured data for organization and events

Also ensure map links, phone number, and contact details are visible on key pages.

## 11) Security and moderation considerations

If you enable submissions (prayer requests, forms, comments):
- Validate and sanitize inputs server-side
- Avoid exposing sensitive prayer/care details publicly
- Restrict admin interfaces and monitor access logs

Review:
- `netlify/functions/_security.mjs`
- Admin-related functions in `netlify/functions/`

## 12) Launch checklist

- Replace all prior niche copy, imagery, and metadata
- Confirm service times, address, and contact details are correct
- Validate all CTAs, forms, and navigation links
- Test mobile UX for first-time visitors
- Run static checks and any relevant tests
- Sync root pages if required:
  - `npm run sync-root-pages`

---

## Estimated timeline

- **Fast MVP launch (static essentials): 16–28 hours**
  - Rebrand + homepage + nav: 5–8 hours
  - New Here, Sermons, Events, Give, Contact pages: 7–12 hours
  - QA, accessibility pass, and launch prep: 4–8 hours

- **Polished launch (design + dynamic content): 35–65 hours**
  - Includes sermon/event data modeling, improved media workflow, deeper UX polishing

## Suggested service packaging (optional)

If delivering as a client project, consider:
- **Setup package:** one-time build and migration
- **Monthly ministry support:** content updates, event posting, sermon uploads, and maintenance

This keeps the church site current without requiring internal technical overhead.
