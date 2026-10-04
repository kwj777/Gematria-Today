// Renders the static pages' share-card artwork to 1200x630 PNG.
//
// The page art is SVG, but no social platform renders image/svg+xml in a share
// card -- Facebook, X, LinkedIn, Slack and iMessage all show an image-less card
// for it. og:image and twitter:image therefore point at the PNGs this script
// writes to assets/og/, which are committed. Run it after changing one of the
// source SVGs:
//
//   node scripts/build-og-images.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { resolveFontFiles } from '../netlify/functions/_fonts.mjs';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_DIRECTORY = 'assets/og';

// `fit` follows CSS object-fit. Most 16:9 artwork only loses a sliver top and
// bottom under `cover`. The 4:3 overview would lose its headline and footer,
// and the relevance hero its bottom caption row, so those two are letterboxed
// on a continuation of their own background gradient instead.
export const OG_IMAGE_SOURCES = Object.freeze([
  { source: 'assets/blog-hero-insights-16x9.svg', fit: 'cover' },
  { source: 'assets/calculator-hero-constellation.svg', fit: 'cover' },
  { source: 'assets/gematria-agent-hero-share.svg', fit: 'cover' },
  { source: 'assets/gematria-guide-og.svg', fit: 'cover' },
  { source: 'assets/gematria-selling-points.svg', fit: 'contain', background: ['#0b1730', '#214f86'] },
  { source: 'assets/name-calculator-hero-identity.svg', fit: 'cover' },
  { source: 'assets/three-based-words-patterns-16x9.svg', fit: 'cover' },
  { source: 'assets/why-english-gematria-backdrop-compact-16x9.svg', fit: 'cover' },
  { source: 'assets/why-english-gematria-relevant-hero-16x9.svg', fit: 'contain', background: ['#0b1027', '#22154f'] },
]);

// The artwork names proprietary faces (Arial, Georgia, Courier New...) that a
// browser finds on the viewer's machine. resvg does no font substitution, so
// each is followed by a metric-compatible open face where the build machine has
// one, and by the bundled Fraunces/Inter otherwise. Without this the Arial copy
// in the overview card is set in the wider Inter and runs out of its boxes.
const FAMILY_FALLBACKS = Object.freeze({
  arial: ['Liberation Sans', 'Arimo'],
  helvetica: ['Liberation Sans', 'Arimo'],
  'trebuchet ms': ['Liberation Sans', 'Arimo'],
  'courier new': ['Liberation Mono', 'Cousine'],
  consolas: ['Liberation Mono', 'DejaVu Sans Mono'],
  menlo: ['DejaVu Sans Mono', 'Liberation Mono'],
  'jetbrains mono': ['DejaVu Sans Mono', 'Liberation Mono'],
  monospace: ['DejaVu Sans Mono', 'Liberation Mono'],
  georgia: ['Fraunces'],
  serif: ['Fraunces'],
});

export function addFamilyFallbacks(svg) {
  return String(svg).replace(/font-family(\s*=\s*"|\s*:\s*)([^";<>]+)/g, (_match, separator, list) => {
    const families = [];
    for (const family of list.split(',').map((name) => name.trim()).filter(Boolean)) {
      families.push(family);
      const fallbacks = FAMILY_FALLBACKS[family.replace(/^['"]|['"]$/g, '').toLowerCase()] || [];
      // Unquoted on purpose: resvg-js 2.6 skips a quoted family that is not
      // first in the list when explicit font files are loaded.
      for (const fallback of fallbacks) {
        if (!families.includes(fallback)) families.push(fallback);
      }
    }
    return `font-family${separator}${families.join(', ')}`;
  });
}

export function toOgImagePath(source) {
  const name = source.split('/').pop().replace(/\.svg$/i, '.png');
  return `${OG_IMAGE_DIRECTORY}/${name}`;
}

// Nests the artwork inside a card-sized SVG and lets preserveAspectRatio do the
// crop or letterbox, so the source file itself is never edited.
export function fitSvgToCard(svg, { fit = 'cover', background = [] } = {}) {
  const aspect = fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
  const inner = String(svg)
    .replace(/^\s*<\?xml[^>]*\?>\s*/, '')
    .replace(/<svg\b([^>]*)>/, (_match, attributes) => {
      const kept = attributes.replace(/\s(?:x|y|width|height|preserveAspectRatio)="[^"]*"/g, '');
      return `<svg${kept} x="0" y="0" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" preserveAspectRatio="${aspect}">`;
    });
  const [from, to = from] = background;
  const backdrop = from
    ? `<defs><linearGradient id="og-card-backdrop" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs><rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="url(#og-card-backdrop)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}">${backdrop}${inner}</svg>`;
}

export function renderOgImage(entry, { root = process.cwd() } = {}) {
  const svg = fitSvgToCard(addFamilyFallbacks(readFileSync(join(root, entry.source), 'utf8')), entry);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    // The bundled faces keep Inter and Fraunces in the cards; system fonts
    // supply the metric-compatible stand-ins named by addFamilyFallbacks().
    font: {
      fontFiles: resolveFontFiles('assets/fonts', root),
      loadSystemFonts: true,
      defaultFontFamily: 'Inter',
    },
  });
  return resvg.render().asPng();
}

function main() {
  mkdirSync(OG_IMAGE_DIRECTORY, { recursive: true });
  for (const entry of OG_IMAGE_SOURCES) {
    const target = toOgImagePath(entry.source);
    writeFileSync(target, renderOgImage(entry));
    console.log(`wrote ${target}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
