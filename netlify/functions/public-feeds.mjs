import { ensureAdminSchema, formatFeed, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';

const TAG_PATTERNS = {
  title: ['title'],
  link: ['link', 'id'],
  description: ['description', 'summary', 'content', 'content:encoded'],
  pubDate: ['pubDate', 'published', 'updated', 'dc:date'],
};

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripHtml(value = '') {
  return decodeXml(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function excerptText(value, maxLength = 180) {
  const clean = stripHtml(value);
  if (!clean) {
    return '';
  }

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength).trimEnd()}…`;
}

function getTagValue(block, tagNames) {
  for (const tagName of tagNames) {
    const directPattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const directMatch = block.match(directPattern);
    if (directMatch?.[1]) {
      return directMatch[1].trim();
    }

    if (tagName === 'link') {
      const atomHrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
      if (atomHrefMatch?.[1]) {
        return atomHrefMatch[1].trim();
      }
    }
  }

  return '';
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(value) {
  const parsed = parseDate(value);
  if (!parsed) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

function parseRssOrAtom(xml) {
  const itemBlocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  if (!itemBlocks.length) {
    return null;
  }

  const items = itemBlocks.map((block) => {
    const title = stripHtml(getTagValue(block, TAG_PATTERNS.title));
    const link = decodeXml(getTagValue(block, TAG_PATTERNS.link));
    const description = getTagValue(block, TAG_PATTERNS.description);
    const pubDate = getTagValue(block, TAG_PATTERNS.pubDate);

    return {
      title: title || 'Untitled article',
      link,
      excerpt: excerptText(description),
      publishedAt: pubDate,
      publishedAtLabel: formatDisplayDate(pubDate),
      sortTimestamp: parseDate(pubDate)?.getTime() ?? 0,
    };
  }).filter((item) => item.link || item.title || item.excerpt);

  if (!items.length) {
    return null;
  }

  items.sort((left, right) => right.sortTimestamp - left.sortTimestamp);
  return items[0];
}

async function fetchLatestArticle(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'EndTimes.Today RSS Preview/1.0',
        'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
    });

    if (!response.ok) {
      return { error: `Feed request failed (${response.status})` };
    }

    const xml = await response.text();
    const latestArticle = parseRssOrAtom(xml);
    if (!latestArticle) {
      return { error: 'No articles found in feed' };
    }

    return { latestArticle };
  } catch (error) {
    return { error: error.message || 'Unable to fetch feed' };
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    const rows = await sql`SELECT * FROM feeds WHERE is_active = TRUE ORDER BY created_at DESC`;
    const feedItems = await Promise.all(rows.map(async (row) => {
      const feed = formatFeed(row);
      const articleResult = await fetchLatestArticle(feed.url);
      return {
        ...feed,
        latestArticle: articleResult.latestArticle || null,
        latestArticleError: articleResult.error || null,
      };
    }));
    return jsonResponse(200, { items: feedItems });
  } catch (error) {
    return jsonResponse(500, { error: error.message || 'Failed to load feeds' });
  }
}
