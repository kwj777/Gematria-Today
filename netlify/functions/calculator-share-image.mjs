const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapSvgText(value, maxCharsPerLine = 60, maxLines = 3) {
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

function drawWordImage(searchParams) {
  const query = escapeXml(searchParams.get('query') || 'Lookup');
  const total = escapeXml(searchParams.get('total') || '?');
  const digitalRoot = escapeXml(searchParams.get('digitalRoot') || '?');
  const isBaseRoot = String(searchParams.get('isBaseRoot') || '').toLowerCase() === 'true' ? 'Yes' : 'No';
  const definitionPreview = String(searchParams.get('definitionPreview') || 'Definition preview unavailable.').trim();
  const perLetterValues = String(searchParams.get('perLetterValues') || 'n/a').trim();
  const definitionLines = wrapSvgText(definitionPreview, 62, 2);
  const definitionText = definitionLines
    .map((line, index) => `<text x="120" y="${525 + (index * 28)}" fill="#d5e5f7" font-size="24" font-family="Inter, Arial, sans-serif">${escapeXml(line)}</text>`)
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
    <text x="120" y="385" fill="#c7d9ee" font-size="36" font-family="Inter, Arial, sans-serif">Digital Root: ${digitalRoot}</text>
    <text x="120" y="425" fill="#c7d9ee" font-size="32" font-family="Inter, Arial, sans-serif">Base Rooted: ${isBaseRoot}</text>
    <text x="120" y="468" fill="#9fc1e8" font-size="25" font-family="Inter, Arial, sans-serif">Definition: ${definitionLines.length ? '' : 'Definition preview unavailable.'}</text>
    ${definitionText}
    <text x="120" y="568" fill="#9fc1e8" font-size="22" font-family="Inter, Arial, sans-serif">Per-letter values: ${escapeXml(perLetterValues)}</text>
  `;
}

function drawNameImage(searchParams) {
  const names = ['name1', 'name2', 'name3']
    .map((key) => String(searchParams.get(key) || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const totals = String(searchParams.get('totals') || '').trim();
  const totalsLabel = totals ? totals.split(',').map((part) => part.trim()).filter(Boolean) : [];

  const lines = names.map((name, index) => {
    const safeName = escapeXml(name);
    const total = escapeXml(totalsLabel[index] || '?');
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
  const url = new URL(request.url);
  const type = String(url.searchParams.get('type') || 'word').toLowerCase();
  const content = type === 'name' ? drawNameImage(url.searchParams) : drawWordImage(url.searchParams);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10233d" />
      <stop offset="100%" stop-color="#274e75" />
    </linearGradient>
  </defs>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bg)" />
  <rect x="760" y="365" width="320" height="64" rx="16" ry="16" fill="rgba(11, 23, 40, 0.72)" stroke="rgba(159, 193, 232, 0.8)" />
  <text x="920" y="406" fill="#f4d77a" font-size="44" font-family="Inter, Arial, sans-serif" font-weight="700" text-anchor="middle">endtimes.today</text>
  ${content}
</svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
};
