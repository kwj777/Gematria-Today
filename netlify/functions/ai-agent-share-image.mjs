import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1200;
const HEIGHT = 630;

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function truncate(value, max = 70) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function normalizeSummaryLines(value = '', maxLines = 3, maxLineLength = 60) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!compact) return [];

  const words = compact.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxLineLength) {
      currentLine = candidate;
      continue;
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;
    if (lines.length >= maxLines) break;
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = truncate(lines[maxLines - 1], Math.max(12, maxLineLength - 1));
  }

  return lines.map((line) => escapeXml(line));
}

function buildSvg({ topic, total, root, summaryLines }) {
  const summaryBlock = summaryLines.length
    ? summaryLines
      .map((line, index) => `<text x="120" y="${485 + (index * 34)}" fill="#c7d9ee" font-size="30" font-family="Arial, Helvetica, sans-serif">${line}</text>`)
      .join('\n')
    : '<text x="120" y="485" fill="#c7d9ee" font-size="36" font-family="Arial, Helvetica, sans-serif">Generated from AI Agent lookup</text>';
  const summaryPanelHeight = summaryLines.length ? 280 + (summaryLines.length * 24) : 250;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bgBase" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1b31" />
      <stop offset="58%" stop-color="#15355d" />
      <stop offset="100%" stop-color="#244e78" />
    </linearGradient>
    <radialGradient id="bgGlowLeft" cx="20%" cy="18%" r="62%">
      <stop offset="0%" stop-color="rgba(113, 168, 255, 0.30)" />
      <stop offset="100%" stop-color="rgba(113, 168, 255, 0)" />
    </radialGradient>
    <radialGradient id="bgGlowRight" cx="84%" cy="76%" r="58%">
      <stop offset="0%" stop-color="rgba(255, 214, 110, 0.17)" />
      <stop offset="100%" stop-color="rgba(255, 214, 110, 0)" />
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgBase)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGlowLeft)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGlowRight)" />
  <text x="80" y="120" fill="#f3f6fb" font-size="42" font-family="Arial, Helvetica, sans-serif" font-weight="700">
    English Gematria Lookup
  </text>
  <text x="80" y="220" fill="#ffd66e" font-size="64" font-family="Arial, Helvetica, sans-serif" font-weight="800">
    ${escapeXml(topic)}
  </text>
  <rect x="80" y="280" rx="16" ry="16" width="1040" height="${summaryPanelHeight}" fill="rgba(12, 27, 48, 0.7)" stroke="rgba(145, 176, 214, 0.5)" />
  <text x="120" y="360" fill="#f3f6fb" font-size="46" font-family="Arial, Helvetica, sans-serif" font-weight="700">Gematria: ${escapeXml(total)}</text>
  <text x="120" y="425" fill="#c7d9ee" font-size="36" font-family="Arial, Helvetica, sans-serif">Digital Root: ${escapeXml(root)}</text>
  ${summaryBlock}
  <text x="80" y="590" fill="#9fc1e8" font-size="28" font-family="Arial, Helvetica, sans-serif">endtimes.today</text>
</svg>`;
}

export default async function onRequest(request) {
  const url = new URL(request.url);
  const topic = truncate(url.searchParams.get('topic') || 'Gematria Agent Result', 48);
  const total = String(url.searchParams.get('total') || '?').trim();
  const root = String(url.searchParams.get('root') || '?').trim();
  const summaryLines = normalizeSummaryLines(url.searchParams.get('summary') || '');

  const svg = buildSvg({ topic, total, root, summaryLines });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(pngBuffer, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=300',
    },
  });
}
