import { ensureAdminSchema, formatFeed, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, fetchWithTimeout, getClientIp, getProtectionConfig, logRequestAudit, withCachedJson } from './_security.mjs';

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

function decodeXmlRecursively(value = '', maxPasses = 3) {
  let decoded = String(value);
  for (let index = 0; index < maxPasses; index += 1) {
    const nextValue = decodeXml(decoded);
    if (nextValue === decoded) break;
    decoded = nextValue;
  }
  return decoded;
}

function stripHtml(value = '') {
  return decodeXmlRecursively(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptText(value, maxLength = 180) {
  const clean = stripHtml(value);
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength).trimEnd()}…`;
}

function getTagValue(block, tagNames) {
  for (const tagName of tagNames) {
    const directPattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i');
    const directMatch = block.match(directPattern);
    if (directMatch?.[1]) return directMatch[1].trim();
    if (tagName === 'link') {
      const atomHrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
      if (atomHrefMatch?.[1]) return atomHrefMatch[1].trim();
    }
  }
  return '';
}

function parseDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function formatDisplayDate(value) {
  const parsed = parseDate(value);
  return parsed ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(parsed) : '';
}

function parseRssOrAtom(xml) {
  const itemBlocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  if (!itemBlocks.length) return null;
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
  if (!items.length) return null;
  items.sort((left, right) => right.sortTimestamp - left.sortTimestamp);
  return items[0];
}

async function fetchLatestArticle(url) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'user-agent': 'EndTimes.Today RSS Preview/1.0',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
    }, getProtectionConfig().wordnikTimeoutMs);

    if (!response.ok) return { error: `Feed request failed (${response.status})` };

    const xml = await response.text();
    const latestArticle = parseRssOrAtom(xml);
    return latestArticle ? { latestArticle } : { error: 'No articles found in feed' };
  } catch (error) {
    return { error: error.message || 'Unable to fetch feed' };
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'public-feeds' });
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    await applyRateLimit(sql, event, {
      scope: 'public-feeds-ip',
      key: getClientIp(event),
      limit: 20,
      windowMs: 60_000,
      blockMs: 10 * 60_000,
      message: 'Too many feed refresh requests.',
    });

    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'public-feeds' }),
      route: 'public-feeds',
      ttlSeconds: 300,
      compute: async () => {
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
        return { items: feedItems };
      },
    });

    await logRequestAudit(sql, event, {
      route: 'public-feeds',
      action: 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
    });

    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=300, stale-while-revalidate=120',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load feeds' }, error.headers || {});
  }
}
