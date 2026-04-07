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
  const topic = truncate(url.searchParams.get('topic') || 'Gematria Agent Result', 72);
  const total = String(url.searchParams.get('total') || '?').trim();
  const root = String(url.searchParams.get('root') || '?').trim();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#101f33" />
      <stop offset="100%" stop-color="#315f8e" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <text x="72" y="102" fill="#ffd66e" font-size="34" font-family="Inter, Arial, sans-serif" font-weight="700">Gematria AI Agent • Shared Result</text>
  <text x="72" y="190" fill="#ffffff" font-size="62" font-family="Inter, Arial, sans-serif" font-weight="800">${escapeXml(topic)}</text>
  <rect x="72" y="240" rx="18" ry="18" width="1056" height="280" fill="rgba(8,16,28,.45)" stroke="rgba(190,214,238,.45)" />
  <text x="112" y="320" fill="#f4f8fc" font-size="44" font-family="Inter, Arial, sans-serif" font-weight="700">Gematria Total: ${escapeXml(total)}</text>
  <text x="112" y="382" fill="#d4e4f6" font-size="36" font-family="Inter, Arial, sans-serif">Digital Root: ${escapeXml(root)}</text>
  <text x="112" y="438" fill="#d4e4f6" font-size="32" font-family="Inter, Arial, sans-serif">Shared from endtimes.today/ai-agent lookup</text>
  <text x="72" y="586" fill="#a8c4e4" font-size="28" font-family="Inter, Arial, sans-serif">endtimes.today</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
