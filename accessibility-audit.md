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

## Dark-mode contrast ratios (2026-05-24)

Static audit of the dark-theme palette against WCAG 2.1 (computed with the
standard 2.4-gamma sRGB formula). Page background is the gradient between
`#161c24` and `#10151d`; numbers below use the gradient midpoint `~#131820`.

### Body & surfaces

| Foreground | Background | Ratio | Pass |
|---|---|---|---|
| Body `#e6ebf2` | Page `#131820` | 14.87:1 | AAA |
| Body `#e6ebf2` | `--color-surface-dark` ≈ `#171e28` | 13.99:1 | AAA |
| `.text-muted` `rgba(230,235,242,0.72)` over surface | `#171e28` | 7.84:1 | AAA |

### Amber accents

| Foreground | Background | Ratio | Pass |
|---|---|---|---|
| `.section-kicker` `#fbbf24` | dark surface `#171e28` | 10.04:1 | AAA |
| `.section-kicker` `#fbbf24` | page `#131820` | 10.67:1 | AAA |
| Active `.btn-warning` `#fff` | `--brand-amber` `#b45309` | 5.02:1 | AA only (brand CTA — visual saturation is intentional) |
| `--brand-amber` `#b45309` as text | dark surface `#171e28` | 3.34:1 | decorative only — not used as body text |

### Breadcrumb (dark mode)

| Foreground | Background | Ratio | Pass |
|---|---|---|---|
| Active item `#f1f5f9` | surface `#171e28` | 15.30:1 | AAA |
| Link `#8ab4ff` | surface `#171e28` | 8.02:1 | AAA |
| Link hover/focus `#b3ccff` | surface `#171e28` | 10.38:1 | AAA |

### Tables (membership comparison)

| Foreground | Effective background | Ratio | Pass |
|---|---|---|---|
| Thead label `#e6ebf2` | `rgba(148,177,215,0.22)` over surface ≈ `#333e4f` | 9.02:1 | AAA |
| Premium thead label `#f5d97a` | `rgba(212,160,23,0.32)` over surface ≈ `#534823` | 6.51:1 | AA (one rung shy of AAA, deliberate hue) |
| Body cell `#e6ebf2` | odd-row stripe `rgba(148,177,215,0.05)` over surface ≈ `#1d2531` | 12.88:1 | AAA |

### Items by design

The two AA-only entries are knowingly accepted:

- **Filled brand CTA**: `--brand-amber #b45309` is the unified brand token
  for `.btn-warning`, `.btn-amber`, and the membership upgrade pill. It
  was deliberately darkened from `#d97706` (commit history in `theme.css:2-4`)
  to clear AA. Bumping further would change brand identity; we accept AA
  on the active filled CTA and pair it with non-color cues (border,
  hover/active state, cursor).
- **Premium thead amber label**: `#f5d97a` on the premium column header
  reads as warm gold against the broader surface and is deliberately
  desaturated; the cell labels themselves (off-white `#e6ebf2`) cover
  the AAA reading.

## Notes

- This is a baseline static audit (HTML patterns + CSS rules).
- It does not measure runtime focus order, keyboard traps,
  or screen reader announcements.
