import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { digitalRoot, englishGematria, isBaseRootValue } from './englishGematria.mjs';

// Print geometry: 8x10in at 300dpi. That is the whole point of this endpoint --
// the 1200x630 social card in calculator-share-image.mjs is a screen asset and
// falls apart in print, so the keepsake chart is rendered at full press
// resolution and only ever downsampled for the on-page preview.
export const CHART_WIDTH = 2400;
export const CHART_HEIGHT = 3000;
export const PREVIEW_WIDTH = 1200;

export const MAX_NAMES = 3;
export const MAX_NAME_LETTERS = 20;
export const MAX_MATCHES = 6;

const NAME_ROW_LABELS = ['FIRST', 'SECOND', 'THIRD'];

// Fraunces/Inter are the site faces but ship as woff2 only, which resvg cannot
// read. resolveFontFiles() picks up TTF/OTF cuts if they are ever added under
// assets/fonts/; until then these stacks fall through to whatever serif and
// sans the render host provides.
const DISPLAY_FONT = 'Fraunces, Georgia, DejaVu Serif, Times New Roman, serif';
const BODY_FONT = 'Inter, Helvetica Neue, Arial, DejaVu Sans, sans-serif';
const FONT_DIRECTORY = 'assets/fonts';

// Layout grid. Everything below the ladder sits at a fixed y so a one-name
// chart and a three-name chart share the same footer and medallion positions.
const CONTENT_LEFT = 240;
const CONTENT_RIGHT = 2160;
const LADDER_LEFT = 340;
const LADDER_RIGHT = 2060;
const LADDER_CONTENT_TOP = 640;
const LADDER_CONTENT_BOTTOM = 1516;
const LADDER_ROW_HEIGHT = 300;
// A row's label and name are drawn above its anchor and its tiles below it.
const ROW_RISE = 122;
const ROW_DROP = 154;
const LADDER_TOP_BIAS = 1 / 3;
const MEDALLION_CY = 1810;
const MEDALLION_R = 270;
const TITLE_MAX_SIZE = 128;
const TITLE_TWO_LINE_MAX_SIZE = 96;
const TITLE_MIN_SIZE = 44;
const TITLE_MAX_WIDTH = 1920;
const TITLE_RULE_Y = 600;
const TILE_MAX_WIDTH = 116;
const TILE_HEIGHT = 132;
const CHIP_WIDTH = 620;
const CHIP_HEIGHT = 96;
const CHIP_GAP = 30;
const CHIP_COLUMNS = 3;
const CHIPS_TOP = 2320;

export function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function truncate(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

// Only A-Z carries a value, matching getPerLetterValues() on the calculator
// page and englishGematria() on the server. Hyphens and apostrophes in a name
// are dropped from the ladder rather than rendered as valueless tiles.
export function getPerLetterValues(input) {
  return Array.from(String(input || '').toUpperCase())
    .filter((char) => char >= 'A' && char <= 'Z')
    .map((char) => ({ letter: char, value: (char.charCodeAt(0) - 64) * 6 }));
}

export function parseNames(searchParams) {
  return ['name1', 'name2', 'name3']
    .map((key) => String(searchParams.get(key) || '').trim())
    .filter(Boolean)
    .slice(0, MAX_NAMES);
}

export function parseMatches(searchParams) {
  return String(searchParams.get('matches') || '')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, MAX_MATCHES);
}

// The chart is a dated snapshot, so the caller may pin the calculation date --
// a reprint of a purchased chart has to show the day it was bought, not the day
// it was re-rendered. Anything unparseable falls back to today.
export function parseCalculatedOn(value, fallbackDate = new Date()) {
  const candidate = String(value || '').trim();
  const parsed = candidate ? new Date(candidate) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallbackDate;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Totals are recomputed from the names rather than read off the query string.
// A chart that will eventually be sold must not be forgeable by editing a
// `total=` parameter in the URL.
export function computeChart(names) {
  const rows = names.map((name, index) => {
    const letters = getPerLetterValues(name).slice(0, MAX_NAME_LETTERS);
    return {
      label: NAME_ROW_LABELS[index] || 'NAME',
      name: truncate(String(name).toUpperCase(), MAX_NAME_LETTERS + 4),
      letters,
      subtotal: Number(englishGematria(name)),
    };
  });

  const total = rows.reduce((sum, row) => sum + row.subtotal, 0);

  return {
    rows,
    fullName: rows.map((row) => row.name).join(' '),
    total,
    digitalRoot: digitalRoot(total),
    isBaseRoot: isBaseRootValue(total),
  };
}

// Rough advance-width estimate. resvg exposes no text metrics before
// rendering, so the display name is sized from an average glyph ratio measured
// against the bold serif cut and then clamped.
const DISPLAY_GLYPH_RATIO = 0.8;

export function fitDisplayFontSize(text, { maxWidth = TITLE_MAX_WIDTH, maxSize = TITLE_MAX_SIZE, minSize = TITLE_MIN_SIZE, ratio = DISPLAY_GLYPH_RATIO } = {}) {
  const length = String(text || '').length || 1;
  const size = Math.floor(maxWidth / (length * ratio));
  return Math.max(minSize, Math.min(maxSize, size));
}

// Balanced two-line split for long names. Shrinking a 41-character name to fit
// one line makes the headline of a framed print unreadable, so it wraps
// instead; a single unsplittable word still just shrinks.
export function splitTitleLines(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return [String(text || '').trim()].filter(Boolean);
  }

  let bestIndex = 1;
  let bestDelta = Infinity;
  for (let index = 1; index < words.length; index += 1) {
    const head = words.slice(0, index).join(' ').length;
    const tail = words.slice(index).join(' ').length;
    const delta = Math.abs(head - tail);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  }

  return [words.slice(0, bestIndex).join(' '), words.slice(bestIndex).join(' ')];
}

// The header always occupies the same vertical budget so the ladder below it
// never has to move: one line sits low and centred, two lines stack tighter.
export function layoutTitle(fullName) {
  const singleLineSize = fitDisplayFontSize(fullName);
  if (singleLineSize >= TITLE_TWO_LINE_MAX_SIZE) {
    return { lines: [String(fullName)], fontSize: singleLineSize, baselines: [505] };
  }

  const lines = splitTitleLines(fullName);
  if (lines.length < 2) {
    return { lines, fontSize: singleLineSize, baselines: [505] };
  }

  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const fontSize = fitDisplayFontSize('x'.repeat(longest), { maxSize: TITLE_TWO_LINE_MAX_SIZE });
  return { lines, fontSize, baselines: [455, 455 + Math.round(fontSize * 1.05)] };
}

export function computeTileMetrics(rows) {
  const longest = rows.reduce((max, row) => Math.max(max, row.letters.length), 0) || 1;
  const step = (LADDER_RIGHT - LADDER_LEFT) / longest;
  const width = Math.min(TILE_MAX_WIDTH, Math.max(48, step - 12));
  return {
    step,
    width,
    letterFontSize: Math.max(26, Math.round(width * 0.45)),
    valueFontSize: Math.max(18, Math.round(width * 0.29)),
  };
}

// Anchor of the first row, chosen so the whole stack is centred in the ladder
// region whether one name was entered or three.
export function computeLadderStartY(rowCount) {
  const regionHeight = LADDER_CONTENT_BOTTOM - LADDER_CONTENT_TOP;
  const contentHeight = ROW_RISE + Math.max(0, rowCount - 1) * LADDER_ROW_HEIGHT + ROW_DROP;
  // Bias the stack upward rather than centring it: the header rule is a hard
  // edge and the medallion below is a soft circle, so an even split reads as a
  // hole under the title on one- and two-name charts.
  const slack = Math.max(0, (regionHeight - contentHeight) * LADDER_TOP_BIAS);
  return LADDER_CONTENT_TOP + slack + ROW_RISE;
}

function buildLadder(rows) {
  const { step, width, letterFontSize, valueFontSize } = computeTileMetrics(rows);
  const startY = computeLadderStartY(rows.length);

  return rows.map((row, rowIndex) => {
    const y = startY + rowIndex * LADDER_ROW_HEIGHT;
    const tiles = row.letters.map(({ letter, value }, letterIndex) => {
      const cx = LADDER_LEFT + step * letterIndex + step / 2;
      return `
    <rect x="${(cx - width / 2).toFixed(1)}" y="${y + 22}" width="${width.toFixed(1)}" height="${TILE_HEIGHT}" rx="14" fill="rgba(10,24,44,0.55)" stroke="rgba(145,176,214,0.35)" stroke-width="2" />
    <text x="${cx.toFixed(1)}" y="${y + 82}" fill="#e8f0fa" font-size="${letterFontSize}" font-family="${BODY_FONT}" font-weight="600" text-anchor="middle">${escapeXml(letter)}</text>
    <text x="${cx.toFixed(1)}" y="${y + 134}" fill="#9fc1e8" font-size="${valueFontSize}" font-family="${BODY_FONT}" text-anchor="middle">${value}</text>`;
    }).join('');

    return `
    <text x="${CONTENT_LEFT}" y="${y - 92}" fill="#8fb3dc" font-size="30" font-family="${BODY_FONT}" letter-spacing="6">${escapeXml(row.label)}</text>
    <text x="${CONTENT_LEFT}" y="${y - 30}" fill="#f3f6fb" font-size="58" font-family="${DISPLAY_FONT}" font-weight="700">${escapeXml(row.name)}</text>
    <text x="${CONTENT_RIGHT}" y="${y - 30}" fill="#ffd66e" font-size="58" font-family="${DISPLAY_FONT}" font-weight="700" text-anchor="end">${row.subtotal}</text>${tiles}`;
  }).join('');
}

function buildMatches(matches) {
  if (!matches.length) {
    return `
    <text x="${CONTENT_LEFT}" y="${CHIPS_TOP + 60}" fill="#9fc1e8" font-size="40" font-family="${BODY_FONT}">No catalogued words share this value yet.</text>`;
  }

  return matches.map((word, index) => {
    const column = index % CHIP_COLUMNS;
    const row = Math.floor(index / CHIP_COLUMNS);
    const x = CONTENT_LEFT + column * (CHIP_WIDTH + CHIP_GAP);
    const y = CHIPS_TOP + row * (CHIP_HEIGHT + CHIP_GAP);
    return `
    <rect x="${x}" y="${y}" width="${CHIP_WIDTH}" height="${CHIP_HEIGHT}" rx="16" fill="rgba(10,24,44,0.5)" stroke="rgba(145,176,214,0.3)" stroke-width="2" />
    <text x="${x + CHIP_WIDTH / 2}" y="${y + 62}" fill="#d5e5f7" font-size="40" font-family="${BODY_FONT}" text-anchor="middle">${escapeXml(truncate(word.toUpperCase(), 22))}</text>`;
  }).join('');
}

function buildWatermark() {
  const rows = [0, 1, 2, 3, 4].map((index) => {
    const y = 420 + index * 560;
    return `<text x="${CHART_WIDTH / 2}" y="${y}" fill="#ffffff" font-size="150" font-family="${BODY_FONT}" font-weight="700" text-anchor="middle" letter-spacing="18" transform="rotate(-30 ${CHART_WIDTH / 2} ${y})">PREVIEW</text>`;
  }).join('');
  return `
  <g opacity="0.2">${rows}</g>`;
}

export function buildChartSvg({ chart, matches = [], watermark = false, calculatedOn = '' }) {
  const title = layoutTitle(chart.fullName);
  const titleMarkup = title.lines
    .map((line, index) => `<text x="${CHART_WIDTH / 2}" y="${title.baselines[index]}" fill="#ffd66e" font-size="${title.fontSize}" font-family="${DISPLAY_FONT}" font-weight="700" text-anchor="middle">${escapeXml(line)}</text>`)
    .join('\n  ');
  const baseRootColor = chart.isBaseRoot ? '#7ee0a8' : '#f3f6fb';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">
  <defs>
    <linearGradient id="chartBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1b31" />
      <stop offset="55%" stop-color="#15355d" />
      <stop offset="100%" stop-color="#1d4067" />
    </linearGradient>
    <radialGradient id="chartGlow" cx="50%" cy="58%" r="42%">
      <stop offset="0%" stop-color="rgba(255, 214, 110, 0.16)" />
      <stop offset="100%" stop-color="rgba(255, 214, 110, 0)" />
    </radialGradient>
  </defs>
  <rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="url(#chartBg)" />
  <rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="url(#chartGlow)" />
  <rect x="90" y="90" width="${CHART_WIDTH - 180}" height="${CHART_HEIGHT - 180}" fill="none" stroke="rgba(255, 214, 110, 0.45)" stroke-width="3" />
  <rect x="112" y="112" width="${CHART_WIDTH - 224}" height="${CHART_HEIGHT - 224}" fill="none" stroke="rgba(145, 176, 214, 0.25)" stroke-width="2" />

  <text x="${CHART_WIDTH / 2}" y="330" fill="#8fb3dc" font-size="36" font-family="${BODY_FONT}" letter-spacing="14" text-anchor="middle">ENGLISH GEMATRIA · BASE-6 CIPHER</text>
  ${titleMarkup}
  <line x1="700" y1="${TITLE_RULE_Y}" x2="1700" y2="${TITLE_RULE_Y}" stroke="rgba(255, 214, 110, 0.5)" stroke-width="2" />
${buildLadder(chart.rows)}

  <circle cx="${CHART_WIDTH / 2}" cy="${MEDALLION_CY}" r="${MEDALLION_R}" fill="rgba(10, 24, 44, 0.6)" stroke="rgba(255, 214, 110, 0.7)" stroke-width="4" />
  <text x="${CHART_WIDTH / 2}" y="${MEDALLION_CY - 110}" fill="#8fb3dc" font-size="34" font-family="${BODY_FONT}" letter-spacing="10" text-anchor="middle">FULL NAME TOTAL</text>
  <text x="${CHART_WIDTH / 2}" y="${MEDALLION_CY + 60}" fill="#ffd66e" font-size="190" font-family="${DISPLAY_FONT}" font-weight="700" text-anchor="middle">${chart.total}</text>

  <text x="700" y="2170" fill="#c7d9ee" font-size="46" font-family="${BODY_FONT}" text-anchor="middle">Digital Root <tspan fill="#f3f6fb" font-weight="700">${chart.digitalRoot}</tspan></text>
  <text x="1700" y="2170" fill="#c7d9ee" font-size="46" font-family="${BODY_FONT}" text-anchor="middle">Base Rooted <tspan fill="${baseRootColor}" font-weight="700">${chart.isBaseRoot ? 'YES' : 'NO'}</tspan></text>

  <text x="${CONTENT_LEFT}" y="2270" fill="#8fb3dc" font-size="32" font-family="${BODY_FONT}" letter-spacing="8">WORDS SHARING THIS VALUE</text>
${buildMatches(matches)}

  <line x1="${CONTENT_LEFT}" y1="2690" x2="${CONTENT_RIGHT}" y2="2690" stroke="rgba(145, 176, 214, 0.3)" stroke-width="2" />
  <text x="${CONTENT_LEFT}" y="2760" fill="#7fa3cc" font-size="30" font-family="${BODY_FONT}">Cipher: A=6 · B=12 · C=18 … Z=156</text>
  <text x="${CONTENT_RIGHT}" y="2760" fill="#7fa3cc" font-size="30" font-family="${BODY_FONT}" text-anchor="end">Calculated ${escapeXml(calculatedOn)}</text>
  <text x="${CHART_WIDTH / 2}" y="2870" fill="#ffd66e" font-size="42" font-family="${DISPLAY_FONT}" font-weight="700" text-anchor="middle">gematria.today</text>${watermark ? buildWatermark() : ''}
</svg>`;
}

// resvg only reads TTF/OTF. Passing an explicit list keeps a paid print off the
// host's default face; when no cuts are bundled we fall back to system fonts so
// the preview still renders rather than failing closed.
export function resolveFontFiles(directory = FONT_DIRECTORY) {
  try {
    const absolute = join(process.cwd(), directory);
    if (!existsSync(absolute)) {
      return [];
    }
    return readdirSync(absolute)
      .filter((entry) => /\.(ttf|otf)$/i.test(entry))
      .map((entry) => join(absolute, entry));
  } catch (_error) {
    return [];
  }
}

export function renderChartPng(svg, { width = CHART_WIDTH, fontFiles = resolveFontFiles() } = {}) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: fontFiles.length
      ? { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Inter' }
      : { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const names = parseNames(url.searchParams);

    if (!names.length) {
      return new Response('At least one name is required.', {
        status: 400,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    // Preview is the free, on-page asset: watermarked and capped at screen
    // resolution so it can never stand in for the purchased print.
    const isPreview = String(url.searchParams.get('preview') || '').toLowerCase() === '1';
    const chart = computeChart(names);
    const svg = buildChartSvg({
      chart,
      matches: parseMatches(url.searchParams),
      watermark: isPreview,
      calculatedOn: parseCalculatedOn(url.searchParams.get('calculatedOn')),
    });
    const png = renderChartPng(svg, { width: isPreview ? PREVIEW_WIDTH : CHART_WIDTH });

    return new Response(png, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('name-chart-image failed', error);
    return new Response('Failed to render name chart', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};
