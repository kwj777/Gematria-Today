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

export default async function onRequest(request) {
  const url = new URL(request.url);
  const topic = truncate(url.searchParams.get('topic') || 'Gematria Agent Result', 48);
  const total = String(url.searchParams.get('total') || '?').trim();
  const root = String(url.searchParams.get('root') || '?').trim();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10233d" />
      <stop offset="100%" stop-color="#274e75" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <text x="80" y="120" fill="#f3f6fb" font-size="42" font-family="Inter, Arial, sans-serif" font-weight="700">
    English Gematria Lookup
  </text>
  <text x="80" y="220" fill="#ffd66e" font-size="64" font-family="Inter, Arial, sans-serif" font-weight="800">
    ${escapeXml(topic)}
  </text>
  <rect x="80" y="280" rx="16" ry="16" width="1040" height="250" fill="rgba(12, 27, 48, 0.7)" stroke="rgba(145, 176, 214, 0.5)" />
  <text x="120" y="360" fill="#f3f6fb" font-size="46" font-family="Inter, Arial, sans-serif" font-weight="700">Gematria: ${escapeXml(total)}</text>
  <text x="120" y="425" fill="#c7d9ee" font-size="36" font-family="Inter, Arial, sans-serif">Digital Root: ${escapeXml(root)}</text>
  <text x="120" y="485" fill="#c7d9ee" font-size="36" font-family="Inter, Arial, sans-serif">Generated from AI Agent lookup</text>
  <text x="80" y="590" fill="#9fc1e8" font-size="28" font-family="Inter, Arial, sans-serif">endtimes.today</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
