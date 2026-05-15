import { ensureAdminSchema, formatPost, getSqlClient, syncBootstrapAdminUser } from './_admin.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp, logRequestAudit } from './_security.mjs';

const SITE_ORIGIN = 'https://gematria.today';
const FALLBACK_IMAGE = '/assets/blog-hero-insights-16x9.svg';
const OGP_IMAGE_WIDTH = 1200;
const OGP_IMAGE_FORMAT = 'jpg';

const HERO_IMAGE_OVERRIDES = Object.freeze({
  'amillennialism-what-it-is-and-isn-t': '/assets/amillennialism-post-01-graphic.svg',
});


function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toAbsoluteUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `${SITE_ORIGIN}${raw.startsWith('/') ? raw : `/${raw}`}`;
}


function toShareImageUrl(value = '') {
  const absoluteUrl = toAbsoluteUrl(value);
  if (!absoluteUrl) return '';
  if (/\.svg(?:$|[?#])/i.test(absoluteUrl)) {
    const encodedSource = encodeURIComponent(absoluteUrl);
    return `${SITE_ORIGIN}/.netlify/images?url=${encodedSource}&w=${OGP_IMAGE_WIDTH}&fm=${OGP_IMAGE_FORMAT}`;
  }
  return absoluteUrl;
}


function getPostHeroImage(post) {
  const slug = String(post?.slug || '').trim().toLowerCase();
  return (
    post?.heroImageUrl ||
    post?.imageUrl ||
    post?.backgroundImageUrl ||
    post?.sliderImageUrl ||
    HERO_IMAGE_OVERRIDES[slug] ||
    FALLBACK_IMAGE
  );
}

function getShareDescription(post) {
  const summary = stripHtml(post?.summary || '');
  if (summary) {
    return summary.length > 220 ? `${summary.slice(0, 220).trimEnd()}…` : summary;
  }
  const body = stripHtml(post?.body || '');
  if (body) {
    return body.length > 220 ? `${body.slice(0, 220).trimEnd()}…` : body;
  }
  return 'Explore gematria research workflows, trusted methodology notes, and interconnected tools from Gematria.Today.';
}

function buildShareHtml(post) {
  const slug = String(post?.slug || '').trim();
  const title = String(post?.title || 'Gematria.Today Blog').trim();
  const description = getShareDescription(post);
  const canonicalUrl = `${SITE_ORIGIN}/blog/${encodeURIComponent(slug)}`;
  const appUrl = `${SITE_ORIGIN}/blog.html?post=${encodeURIComponent(slug)}#${encodeURIComponent(slug)}`;
  const imageUrl = toShareImageUrl(getPostHeroImage(post)) || toShareImageUrl(FALLBACK_IMAGE);
  const publishedIso = post?.publishedAt || post?.createdAt || new Date().toISOString();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Gematria.Today Blog</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

    <meta property="og:site_name" content="Gematria.Today" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />
    <meta property="article:published_time" content="${escapeHtml(new Date(publishedIso).toISOString())}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(title)}" />

    <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}" />
    <script>window.location.replace(${JSON.stringify(appUrl)});</script>
  </head>
  <body>
    <main>
      <p>Redirecting to <a href="${escapeHtml(appUrl)}">${escapeHtml(title)}</a>…</p>
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

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'blog-post-share' });
    const slug = String(event.pathParameters?.slug || '').trim().toLowerCase();
    if (!slug) {
      return {
        statusCode: 302,
        headers: { location: '/blog.html' },
        body: '',
      };
    }

    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);

    await applyRateLimit(sql, event, {
      scope: 'blog-post-share-ip',
      key: getClientIp(event),
      limit: 90,
      windowMs: 60_000,
      blockMs: 5 * 60_000,
      message: 'Too many requests for blog post metadata.',
    });

    const rows = await sql`
      SELECT * FROM posts
      WHERE
        COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
        AND LOWER(COALESCE(slug, '')) = ${slug}
      ORDER BY COALESCE(published_at, created_at) DESC
      LIMIT 1
    `;

    const post = rows[0] ? formatPost(rows[0]) : null;
    if (!post) {
      return {
        statusCode: 302,
        headers: { location: '/blog.html' },
        body: '',
      };
    }

    await logRequestAudit(sql, event, {
      route: 'blog-post-share',
      action: 'read',
      outcome: 'origin_hit',
      metadata: { slug },
    });

    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=120',
      },
      body: buildShareHtml(post),
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 500,
      headers: {
        'content-type': 'text/plain; charset=UTF-8',
        ...(error.headers || {}),
      },
      body: error.message || 'Failed to render blog post sharing metadata',
    };
  }
}
