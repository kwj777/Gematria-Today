import { ensureAdminSchema, formatPost, getSqlClient, syncBootstrapAdminUser } from './_admin.mjs';
import { assertSiteModuleEnabled } from './_site-modules.mjs';

const SITE_ORIGIN = 'https://gematria.today';
const FEED_PATH = '/blog.xml';
const BLOG_PATH = '/blog.html';
const FEED_TITLE = 'Gematria.Today Blog';
const FEED_DESCRIPTION = 'Latest articles from Gematria.Today blog.';
const MAX_ITEMS = 50;

export function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toAbsoluteUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return `${SITE_ORIGIN}${BLOG_PATH}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${SITE_ORIGIN}${raw}`;
  return `${SITE_ORIGIN}/${raw}`;
}

export function formatRfc822Date(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toUTCString();
  return parsed.toUTCString();
}

export function extractDescription(post) {
  const summary = stripHtml(post.summary || '');
  if (summary) return summary;
  const body = stripHtml(post.body || '');
  if (!body) return 'Read the latest gematria research article on Gematria.Today.';
  return body.length > 220 ? `${body.slice(0, 220).trimEnd()}…` : body;
}

export function buildItem(post) {
  const postUrl = toAbsoluteUrl(`/blog/${encodeURIComponent(post.slug)}`);
  const description = extractDescription(post);
  const publishedAt = post.publishedAt || post.createdAt;
  return `<item>
  <title>${escapeXml(post.title || 'Untitled post')}</title>
  <link>${escapeXml(postUrl)}</link>
  <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
  <description>${escapeXml(description)}</description>
  <pubDate>${escapeXml(formatRfc822Date(publishedAt))}</pubDate>
</item>`;
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
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    await assertSiteModuleEnabled(sql, 'blog');
    const rows = await sql`
      SELECT * FROM posts
      WHERE
        COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
        AND COALESCE(hide_from_blog, FALSE) = FALSE
      ORDER BY COALESCE(published_at, created_at) DESC
      LIMIT ${MAX_ITEMS}
    `;
    const posts = rows.map(formatPost);
    const latestDate = posts[0]?.publishedAt || posts[0]?.createdAt || new Date().toISOString();
    const feedBody = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeXml(FEED_TITLE)}</title>
  <link>${escapeXml(`${SITE_ORIGIN}${BLOG_PATH}`)}</link>
  <description>${escapeXml(FEED_DESCRIPTION)}</description>
  <language>en-us</language>
  <atom:link href="${escapeXml(`${SITE_ORIGIN}${FEED_PATH}`)}" rel="self" type="application/rss+xml" />
  <lastBuildDate>${escapeXml(formatRfc822Date(latestDate))}</lastBuildDate>
  ${posts.map(buildItem).join('\n  ')}
</channel>
</rss>
`;

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/rss+xml; charset=UTF-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=120',
      },
      body: feedBody,
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 500,
      headers: { 'content-type': 'text/plain; charset=UTF-8', ...(error.headers || {}) },
      body: error.message || 'Failed to generate RSS feed',
    };
  }
}
