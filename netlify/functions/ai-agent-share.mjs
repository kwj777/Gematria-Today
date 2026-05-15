const SITE_ORIGIN = 'https://gematria.today';
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function trimValue(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}


function toImageUrl(topic, total, root) {
  const imageUrl = new URL('/api/ai-agent-share-image', SITE_ORIGIN);
  imageUrl.searchParams.set('topic', topic);
  imageUrl.searchParams.set('total', total);
  imageUrl.searchParams.set('root', root);
  return imageUrl.toString();
}

function buildShareHtml(params) {
  const topic = trimValue(params.get('topic') || 'Gematria Agent Result', 90);
  const total = trimValue(params.get('total') || '?', 24);
  const root = trimValue(params.get('root') || '?', 24);

  const appUrl = new URL('/ai-agent.html', SITE_ORIGIN);
  appUrl.searchParams.set('sharedTopic', topic);
  appUrl.searchParams.set('sharedTotal', total);
  appUrl.searchParams.set('sharedRoot', root);

  const imageUrl = toImageUrl(topic, total, root);
  const title = `GemaBot: ${topic}`;
  const description = `Gematria lookup for ${topic}: total ${total} • digital root ${root}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(appUrl.toString())}" />

    <meta property="og:site_name" content="Gematria.Today" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(appUrl.toString())}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(title)}" />

    <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl.toString())}" />
    <script>window.location.replace(${JSON.stringify(appUrl.toString())});</script>
  </head>
  <body>
    <main>
      <p>Redirecting to <a href="${escapeHtml(appUrl.toString())}">GemaBot</a>…</p>
    </main>
  </body>
</html>`;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { allow: 'GET' },
      body: 'Method not allowed',
    };
  }

  const params = new URLSearchParams(event.queryStringParameters || {});
  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=120',
    },
    body: buildShareHtml(params),
  };
}
