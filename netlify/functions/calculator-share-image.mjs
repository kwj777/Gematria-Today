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

function drawWordImage(searchParams) {
  const query = escapeXml(searchParams.get('query') || 'Lookup');
  const total = escapeXml(searchParams.get('total') || '?');
  const digitalRoot = escapeXml(searchParams.get('digitalRoot') || '?');
  const isBaseRoot = String(searchParams.get('isBaseRoot') || '').toLowerCase() === 'true' ? 'Yes' : 'No';

  return `
    <text x="80" y="120" fill="#f3f6fb" font-size="42" font-family="Inter, Arial, sans-serif" font-weight="700">
      English Gematria Lookup
    </text>
    <text x="80" y="220" fill="#ffd66e" font-size="64" font-family="Inter, Arial, sans-serif" font-weight="800">
      ${query}
    </text>
    <rect x="80" y="280" rx="16" ry="16" width="1040" height="250" fill="rgba(12, 27, 48, 0.7)" stroke="rgba(145, 176, 214, 0.5)" />
    <text x="120" y="360" fill="#f3f6fb" font-size="46" font-family="Inter, Arial, sans-serif" font-weight="700">Gematria: ${total}</text>
    <text x="120" y="425" fill="#c7d9ee" font-size="36" font-family="Inter, Arial, sans-serif">Digital Root: ${digitalRoot}</text>
    <text x="120" y="485" fill="#c7d9ee" font-size="36" font-family="Inter, Arial, sans-serif">Base Rooted: ${isBaseRoot}</text>
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
    const y = 310 + (index * 78);
    return `<text x="120" y="${y}" fill="#f3f6fb" font-size="44" font-family="Inter, Arial, sans-serif" font-weight="700">${safeName}: ${total}</text>`;
  }).join('');

  return `
    <text x="80" y="120" fill="#f3f6fb" font-size="42" font-family="Inter, Arial, sans-serif" font-weight="700">
      Name Calculator Comparison
    </text>
    <text x="80" y="205" fill="#ffd66e" font-size="34" font-family="Inter, Arial, sans-serif">
      ${escapeXml(names.join(' • ') || 'Name Results')}
    </text>
    <rect x="80" y="250" rx="16" ry="16" width="1040" height="320" fill="rgba(12, 27, 48, 0.7)" stroke="rgba(145, 176, 214, 0.5)" />
    ${lines || '<text x="120" y="360" fill="#f3f6fb" font-size="44" font-family="Inter, Arial, sans-serif">Run a name search to generate comparison results.</text>'}
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
  ${content}
  <text x="80" y="590" fill="#9fc1e8" font-size="28" font-family="Inter, Arial, sans-serif">endtimes.today</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
};
