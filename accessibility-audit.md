# Accessibility Audit Report

Audit date: 2026-05-14
Files audited: site-wide (HTML root, /partials, /public) + theme.css
Focus: WCAG 2.5.5 — Target Size (44x44 CSS pixels minimum)

## Summary

A unified `.touch-target` utility was introduced in `theme.css` and applied
uniformly via shared selectors so that every undersized interactive control
on the site meets the 44x44 minimum without per-page HTML edits.

```css
.touch-target,
.btn-close,
a.badge,
.badge[href] {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

## Findings and Fixes

| # | Pattern | Before | After | Where |
|---|---|---|---|---|
| 1 | Bootstrap `.btn-close` (modal/dialog dismiss) | 24x24 default | 44x44 via grouped selector | theme.css; affects calculator.html, name-calculator.html, public/admin-reports.html, public/ai-agent.html, public/calculator.html, public/name-calculator.html |
| 2 | `.nav-search-link` (global nav, used by every page via partials/nav.html) | min-height 38px | min-height 44px | theme.css |
| 3 | Interactive badges (`a.badge`, `.badge[href]`) — blog post tags, premium-research word chips | ~22–28px tall | 44px min via grouped selector | theme.css; affects blog.html, public/blog.html, premium-research.html, public/premium-research.html, and any dynamic badge anchors |
| 4 | `.forum-category-chip` (anchor variant) | 14–16px tall (padding 0.125rem) | 44px min, padding 0.35rem 0.65rem | public/forum.html inline `<style>` |
| 5 | `.forum-profile-popover-close` (× button) | ~18–20px char-only button | 44x44 inline-flex | public/forum.html inline `<style>` |

## Already Compliant (verified)

- `.back-to-top-button` — 44x44 in theme.css
- `.navbar-toggler` — Bootstrap default ≥44px
- `.form-control`, `.form-select` — 2.75rem (44px) min-height in theme.css
- Bootstrap `.dropdown-item`, `.accordion-button` — adequate via default padding
- Text buttons (`.btn`, `.btn-sm` with label) — adequate when content is text

## Usage of `.touch-target`

The utility is available for any future icon-only or compact interactive
element. Add the class to the element directly when a CSS-only fix via a
shared selector is not appropriate:

```html
<button type="button" class="touch-target" aria-label="Copy">
  <svg>…</svg>
</button>
```

For controls that should be slightly larger (primary CTAs, mobile-first
buttons), use the pre-existing `.touch-target-lg` (48px) instead.

## Notes

- This is a baseline static audit (HTML patterns + CSS rules).
- It does not measure runtime focus order, color contrast, keyboard traps,
  or screen reader announcements.
