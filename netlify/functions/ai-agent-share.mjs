const SITE_ORIGIN = 'https://endtimes.today';
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;
const IMAGE_FORMAT = 'jpg';

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


function toTransformedImageUrl(sourceUrl) {
  const encodedSource = encodeURIComponent(sourceUrl);
  return `${SITE_ORIGIN}/.netlify/images?url=${encodedSource}&w=${IMAGE_WIDTH}&h=${IMAGE_HEIGHT}&fit=cover&fm=${IMAGE_FORMAT}`;
}

function buildShareHtml(params) {
  const topic = trimValue(params.get('topic') || 'Gematria Agent Result', 90);
  const total = trimValue(params.get('total') || '?', 24);
  const root = trimValue(params.get('root') || '?', 24);

  const appUrl = new URL('/ai-agent.html', SITE_ORIGIN);
  appUrl.searchParams.set('sharedTopic', topic);
  appUrl.searchParams.set('sharedTotal', total);
  appUrl.searchParams.set('sharedRoot', root);

  const imageSource = new URL('/.netlify/functions/ai-agent-share-image', SITE_ORIGIN);
  imageSource.searchParams.set('topic', topic);
  imageSource.searchParams.set('total', total);
  imageSource.searchParams.set('root', root);

  const imageUrl = toTransformedImageUrl(imageSource.toString());
  const title = `Gematria AI Agent: ${topic}`;
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

    <meta property="og:site_name" content="EndTimes.Today" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(appUrl.toString())}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
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
      <p>Redirecting to <a href="${escapeHtml(appUrl.toString())}">Gematria AI Agent</a>…</p>
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
