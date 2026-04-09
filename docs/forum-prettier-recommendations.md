# Forum UI polish recommendations

This plan focuses on making `public/forum.html` feel more modern and visual while keeping the current Bootstrap + `theme.css` stack.

## 1) Improve visual hierarchy

- Add a dedicated forum hero treatment with subtle gradient/background artwork behind the current header panel.
- Increase contrast between page sections (filters, create thread, thread list, thread detail) with distinct card elevation levels.
- Use a larger display style for the page title and reduce muted text density in the first viewport.

## 2) Redesign thread list cards

- Convert each thread row from plain list-group items into richer cards with:
  - category chip
  - title + one-line excerpt
  - metadata row (author, relative time, replies, reactions)
  - optional status badges (`locked`, `premium`, `answered`)
- Add clear hover/focus states and an active selection state when a thread is open.
- Add lightweight separators and improve vertical rhythm (`12/16/24px` spacing scale).

## 3) Strengthen typography system

- Define forum-specific type tokens in `theme.css` (e.g., `--forum-title-size`, `--forum-meta-size`).
- Use one readable body size for post text (16–18px) and tighten meta text to ~13px.
- Increase line-height in thread/reply bodies for longer-form readability.

## 4) Modernize composer UX

- Add helper text under title/body inputs (character guidance, markdown availability if supported).
- Add sticky action row for “Post thread” / “Post reply” on long forms.
- Add autosizing textarea and a compact formatting toolbar (bold, link, quote) if markdown is planned.

## 5) Introduce subtle color semantics

- Map each forum category to a stable color token (not only emoji/icon).
- Add soft tinted backgrounds for category chips for quick scanability.
- Reserve high-contrast colors for moderation/report/critical actions only.

## 6) Improve empty/loading states

- Replace plain loading text with skeleton placeholders for thread list and reply list.
- Add purposeful empty states:
  - “No threads yet” with CTA to create the first thread
  - “No search results” with clear reset filter action
- Include contextual illustrations/icons from the existing asset style.

## 7) Reply readability and trust cues

- Render replies in threaded cards with consistent avatar placeholders.
- Highlight OP or moderator responses with a soft border accent.
- Add inline reputation indicator and optional badge next to usernames.

## 8) Mobile-first polish

- Collapse filter controls into a compact drawer or segmented controls on small screens.
- Ensure sticky bottom CTA for creating thread/reply on mobile.
- Reduce horizontal overflow risk in metadata rows by using wrap-aware layouts.

## 9) Motion and interaction polish

- Add small transition timings (120–180ms) for hover, expand/collapse, and list refresh.
- Animate rules panel open/close instead of abrupt show/hide.
- Respect `prefers-reduced-motion` for all animation effects.

## 10) Quick implementation sequence

1. Add forum token variables and spacing/typography scales in `theme.css`.
2. Restyle thread list and thread detail containers.
3. Add loading/empty-state components.
4. Apply mobile-specific filter/composer refinements.
5. Add micro-interactions and motion accessibility pass.

## Optional “high impact” additions

- Add dark-mode-tuned forum surfaces if global dark mode exists.
- Add a “Trending threads” strip near the top for engagement.
- Add lightweight user profile popovers on author hover/tap.
