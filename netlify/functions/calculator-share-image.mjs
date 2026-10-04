import { digitalRoot, englishGematria, gematriaLetters, isBaseRootValue } from './englishGematria.mjs';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

export function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function wrapSvgText(value, maxCharsPerLine = 60, maxLines = 3) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;
    if (lines.length >= maxLines - 1) {
      break;
    }
  }

  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  if (words.length && lines.length === maxLines) {
    const joined = lines.join(' ');
    if (joined.length < String(value || '').trim().length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxCharsPerLine - 1))}…`;
    }
  }

  return lines;
}

// Same cipher and label format as getPerLetterValuesLabel() on the calculator
// page: only A-Z carries a value, read through gematriaLetters() so the label
// follows the same normalization as the total.
export function getPerLetterValuesLabel(input) {
  const letters = Array.from(gematriaLetters(String(input || '')));
  return letters.length
    ? letters.map((char) => `${char}=${(char.charCodeAt(0) - 64) * 6}`).join(', ')
    : 'n/a';
}

// Every number on the card is recomputed from the words themselves. The share
// links still send total, digitalRoot, isBaseRoot, perLetterValues and totals,
// but reading them let anyone mint a gematria.today-branded card claiming any
// value for any word (?query=Obama&total=666), so they are ignored.
export function computeWordValues(query) {
  const text = String(query || '');
  if (!gematriaLetters(text)) {
    return { total: '?', digitalRoot: '?', isBaseRoot: false, perLetterValues: 'n/a' };
  }
  const total = Number(englishGematria(text));
  return {
    total: String(total),
    digitalRoot: String(digitalRoot(total)),
    isBaseRoot: isBaseRootValue(total),
    perLetterValues: getPerLetterValuesLabel(text),
  };
}

export function drawWordImage(searchParams) {
  const rawQuery = String(searchParams.get('query') || '').trim();
  const query = escapeXml(rawQuery || 'Lookup');
  const values = computeWordValues(rawQuery);
  const total = escapeXml(values.total);
  const root = escapeXml(values.digitalRoot);
  const isBaseRoot = values.isBaseRoot ? 'Yes' : 'No';
  const definitionPreview = String(searchParams.get('definitionPreview') || 'Definition preview unavailable.').trim();
  const perLetterValues = values.perLetterValues;
  const definitionLines = wrapSvgText(definitionPreview, 62, 2);
  const definitionText = definitionLines
    .map((line, index) => `<text x="120" y="${468 + (index * 28)}" fill="#d5e5f7" font-size="24" font-family="Inter, Arial, sans-serif">${escapeXml(line)}</text>`)
    .join('');

  return `
    <text x="600" y="108" fill="#f3f6fb" font-size="42" font-family="Inter, Arial, sans-serif" font-weight="700" text-anchor="middle">
      English Gematria Lookup
    </text>
    <text x="600" y="200" fill="#ffd66e" font-size="72" font-family="Inter, Arial, sans-serif" font-weight="800" text-anchor="middle">
      ${query}
    </text>
    <rect x="80" y="245" rx="16" ry="16" width="1040" height="340" fill="rgba(12, 27, 48, 0.7)" stroke="rgba(145, 176, 214, 0.5)" />
    <text x="120" y="320" fill="#f3f6fb" font-size="46" font-family="Inter, Arial, sans-serif" font-weight="700">Gematria: ${total}</text>
    <text x="120" y="385" fill="#c7d9ee" font-size="36" font-family="Inter, Arial, sans-serif">Digital Root: ${root}</text>
    <text x="120" y="425" fill="#c7d9ee" font-size="32" font-family="Inter, Arial, sans-serif">Base Rooted: ${isBaseRoot}</text>
    ${definitionText}
    <text x="120" y="568" fill="#9fc1e8" font-size="22" font-family="Inter, Arial, sans-serif">Per-letter values: ${escapeXml(perLetterValues)}</text>
  `;
}

export function drawNameImage(searchParams) {
  const names = ['name1', 'name2', 'name3']
    .map((key) => String(searchParams.get(key) || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  const lines = names.map((name, index) => {
    const safeName = escapeXml(name);
    const total = escapeXml(computeWordValues(name).total);
    const y = 300 + (index * 78);
    return `<text x="120" y="${y}" fill="#f3f6fb" font-size="44" font-family="Inter, Arial, sans-serif" font-weight="700">${safeName}: ${total}</text>`;
  }).join('');

  return `
    <text x="600" y="112" fill="#f3f6fb" font-size="42" font-family="Inter, Arial, sans-serif" font-weight="700" text-anchor="middle">
      Name Calculator Comparison
    </text>
    <text x="600" y="185" fill="#ffd66e" font-size="34" font-family="Inter, Arial, sans-serif" text-anchor="middle">
      ${escapeXml(names.join(' • ') || 'Name Results')}
    </text>
    <rect x="80" y="230" rx="16" ry="16" width="1040" height="340" fill="rgba(12, 27, 48, 0.7)" stroke="rgba(145, 176, 214, 0.5)" />
    ${lines || '<text x="120" y="340" fill="#f3f6fb" font-size="44" font-family="Inter, Arial, sans-serif">Run a name search to generate comparison results.</text>'}
  `;
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const type = String(url.searchParams.get('type') || 'word').toLowerCase();
    const content = type === 'name' ? drawNameImage(url.searchParams) : drawWordImage(url.searchParams);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
  <defs>
    <linearGradient id="bgBase" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1b31" />
      <stop offset="55%" stop-color="#15355d" />
      <stop offset="100%" stop-color="#254f79" />
    </linearGradient>
    <radialGradient id="bgGlowLeft" cx="18%" cy="20%" r="60%">
      <stop offset="0%" stop-color="rgba(113, 168, 255, 0.30)" />
      <stop offset="100%" stop-color="rgba(113, 168, 255, 0)" />
    </radialGradient>
    <radialGradient id="bgGlowRight" cx="86%" cy="74%" r="58%">
      <stop offset="0%" stop-color="rgba(255, 214, 110, 0.18)" />
      <stop offset="100%" stop-color="rgba(255, 214, 110, 0)" />
    </radialGradient>
  </defs>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bgBase)" />
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bgGlowLeft)" />
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bgGlowRight)" />
  <rect x="640" y="365" width="440" height="64" rx="16" ry="16" fill="rgba(11, 23, 40, 0.72)" stroke="rgba(159, 193, 232, 0.8)" />
  <text x="860" y="397" fill="#f4d77a" font-size="44" font-family="Inter, Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="middle">gematria.today</text>
  ${content}
</svg>`;

    return new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=600',
      },
    });
  } catch (error) {
    console.error('calculator-share-image failed', error);
    return new Response('Failed to render share image', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
};
