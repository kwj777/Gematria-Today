import { ensureAdminSchema, formatPost, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';
import { getOptionalAuthenticatedSession } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineMarkdown(text = '') {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="news-inline-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function convertMarkdownToHtml(markdown = '') {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let paragraphLines = [];
  let inUnorderedList = false;
  let inOrderedList = false;
  let inCodeBlock = false;

  const closeParagraph = () => {
    if (!paragraphLines.length) return;
    html.push(`<p>${applyInlineMarkdown(paragraphLines.join(' '))}</p>`);
    paragraphLines = [];
  };
  const closeLists = () => {
    if (inUnorderedList) {
      html.push('</ul>');
      inUnorderedList = false;
    }
    if (inOrderedList) {
      html.push('</ol>');
      inOrderedList = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = String(line || '').trim();
    if (trimmed.startsWith('```')) {
      closeParagraph();
      closeLists();
      if (inCodeBlock) {
        html.push('</code></pre>');
        inCodeBlock = false;
      } else {
        html.push('<pre><code>');
        inCodeBlock = true;
      }
      return;
    }
    if (inCodeBlock) {
      html.push(`${escapeHtml(line)}\n`);
      return;
    }
    if (!trimmed) {
      closeParagraph();
      closeLists();
      return;
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeParagraph();
      closeLists();
      const level = Math.max(1, Math.min(6, headingMatch[1].length));
      html.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }
    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      closeParagraph();
      if (inOrderedList) {
        html.push('</ol>');
        inOrderedList = false;
      }
      if (!inUnorderedList) {
        html.push('<ul>');
        inUnorderedList = true;
      }
      html.push(`<li>${applyInlineMarkdown(unorderedMatch[1])}</li>`);
      return;
    }
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      closeParagraph();
      if (inUnorderedList) {
        html.push('</ul>');
        inUnorderedList = false;
      }
      if (!inOrderedList) {
        html.push('<ol>');
        inOrderedList = true;
      }
      html.push(`<li>${applyInlineMarkdown(orderedMatch[1])}</li>`);
      return;
    }
    paragraphLines.push(trimmed);
  });

  closeParagraph();
  closeLists();
  if (inCodeBlock) {
    html.push('</code></pre>');
  }
  return html.join('');
}

function normalizePostBodyHtml(value = '') {
  const raw = String(value || '').trim();
  if (!raw) {
    return '<p></p>';
  }
  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
  if (containsHtml) {
    return raw;
  }
  return convertMarkdownToHtml(raw);
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SERIES_ORDER_OVERRIDES = [
  {
    olderSlug: 'amillennialism-explained-complete-8-part-end-times-theology-series',
    newerSlug: 'amillennialism-what-it-is-and-isn-t'
  }
];

function applySeriesOrderOverrides(posts) {
  const ordered = [...posts];
  SERIES_ORDER_OVERRIDES.forEach(({ olderSlug, newerSlug }) => {
    const olderIndex = ordered.findIndex((post) => String(post.slug || '').toLowerCase() === olderSlug);
    const newerIndex = ordered.findIndex((post) => String(post.slug || '').toLowerCase() === newerSlug);
    if (olderIndex === -1 || newerIndex === -1 || olderIndex > newerIndex) return;
    const [olderPost] = ordered.splice(olderIndex, 1);
    const refreshedNewerIndex = ordered.findIndex((post) => String(post.slug || '').toLowerCase() === newerSlug);
    ordered.splice(refreshedNewerIndex + 1, 0, olderPost);
  });
  return ordered;
}

function buildInternalLinkTargets(posts, currentSlug = '') {
  const targets = [
    { phrase: 'Word/Phrase Calculator', href: '/calculator.html' },
    { phrase: 'gematria calculator', href: '/calculator.html' },
    { phrase: 'calculator', href: '/calculator.html' },
    { phrase: 'name lookup page', href: '/name-calculator.html' },
    { phrase: 'name calculator', href: '/name-calculator.html' },
    { phrase: 'names', href: '/name-calculator.html' },
    { phrase: 'news feed', href: '/news.html' },
    { phrase: 'FAQ', href: '/faq.html' },
    { phrase: 'premium research tools', href: '/premium-research.html' },
    { phrase: 'gematria guide', href: '/gematria-guide.html' },
    { phrase: 'gematria results archive', href: '/' },
    { phrase: 'related words', href: '/premium-research.html' },
  ];
  posts.forEach((post) => {
    if (!post?.slug || String(post.slug).toLowerCase() === String(currentSlug).toLowerCase()) return;
    const title = String(post.title || '').trim();
    if (title.length < 12) return;
    targets.push({ phrase: title, href: `/blog/${encodeURIComponent(post.slug)}` });
  });
  const seen = new Set();
  return targets
    .map((target) => ({ phrase: String(target.phrase || '').trim(), href: String(target.href || '').trim() }))
    .filter((target) => {
      const key = `${target.phrase.toLowerCase()}::${target.href}`;
      if (!target.phrase || !target.href || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.phrase.length - left.phrase.length);
}

function linkifyHtmlContent(html, targets = []) {
  const tokens = String(html || '').split(/(<[^>]+>)/g);
  const linkedTargets = new Set();
  let excludedDepth = 0;
  return tokens.map((token) => {
    if (!token) return token;
    if (token.startsWith('<')) {
      const openTagMatch = token.match(/^<([a-z0-9-]+)/i);
      const closeTagMatch = token.match(/^<\/([a-z0-9-]+)/i);
      if (openTagMatch) {
        const tagName = openTagMatch[1].toLowerCase();
        if (['a', 'button', 'code', 'pre', 'script', 'style', 'textarea'].includes(tagName) && !/\/>$/.test(token.trim())) {
          excludedDepth += 1;
        }
      } else if (closeTagMatch) {
        const tagName = closeTagMatch[1].toLowerCase();
        if (['a', 'button', 'code', 'pre', 'script', 'style', 'textarea'].includes(tagName) && excludedDepth > 0) {
          excludedDepth -= 1;
        }
      }
      return token;
    }
    if (excludedDepth > 0 || !token.trim()) {
      return token;
    }
    let updated = token;
    targets.forEach((target) => {
      const normalizedPhrase = String(target?.phrase || '').toLowerCase();
      if (!target?.phrase || !target?.href || linkedTargets.has(normalizedPhrase)) {
        return;
      }
      const pattern = new RegExp(`(^|[^\\w])(${escapeRegex(target.phrase)})(?=[^\\w]|$)`, 'i');
      if (!pattern.test(updated)) {
        return;
      }
      updated = updated.replace(pattern, (_, prefix, phrase) => `${prefix}<a class="news-inline-link" href="${escapeHtml(target.href)}">${phrase}</a>`);
      linkedTargets.add(normalizedPhrase);
    });
    return updated;
  }).join('');
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: false, route: 'public-posts' });
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'public-posts-ip',
        key: getClientIp(event),
        limit: 60,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many requests for published posts.',
      });
    }

    const featuredOnly = event.queryStringParameters?.featured === 'true';
    const previewRequested = event.queryStringParameters?.preview === 'true';
    const previewMode = previewRequested && String(user?.role || '').toLowerCase() === 'admin';
    const idFilter = String(event.queryStringParameters?.id || '').trim();
    const slugFilter = String(event.queryStringParameters?.slug || '').trim().toLowerCase();
    const detailMode = Boolean(idFilter || slugFilter);
    const limitValue = Number.parseInt(event.queryStringParameters?.limit || '', 10);
    const requestedLimit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 12) : null;
    const offsetValue = Number.parseInt(event.queryStringParameters?.offset || '', 10);
    const requestedOffset = Number.isFinite(offsetValue) && offsetValue > 0 ? offsetValue : 0;

    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({
        route: 'public-posts',
        featuredOnly,
        requestedLimit,
        requestedOffset,
        previewMode,
        idFilter: idFilter || null,
        slugFilter: slugFilter || null,
        detailMode
      }),
      route: 'public-posts',
      ttlSeconds: 120,
      compute: async () => {
        let rows;
        const effectiveLimit = requestedLimit ? requestedLimit + 1 : null;
        const effectiveOffset = detailMode ? 0 : requestedOffset;
        if (featuredOnly && requestedLimit) {
          rows = await sql`
            SELECT * FROM posts
            WHERE (
              COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
              OR (
                COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at <= NOW()
              )
            ) AND show_on_homepage = TRUE
            ORDER BY COALESCE(published_at, created_at) DESC
            LIMIT ${effectiveLimit}
            OFFSET ${effectiveOffset}
          `;
        } else if (featuredOnly) {
          rows = await sql`
            SELECT * FROM posts
            WHERE (
              COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
              OR (
                COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at <= NOW()
              )
            ) AND show_on_homepage = TRUE
            ORDER BY COALESCE(published_at, created_at) DESC
          `;
        } else if (requestedLimit) {
          rows = await sql`
            SELECT * FROM posts
            WHERE (
              COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
              OR (
                COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at <= NOW()
              )
              OR (${previewMode ? 1 : 0} = 1 AND COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft')
            )
              AND (${idFilter ? 1 : 0} = 0 OR id = ${idFilter})
              AND (${slugFilter ? 1 : 0} = 0 OR LOWER(COALESCE(slug, '')) = ${slugFilter})
            ORDER BY COALESCE(published_at, created_at) DESC
            LIMIT ${effectiveLimit}
            OFFSET ${effectiveOffset}
          `;
        } else {
          rows = await sql`
            SELECT * FROM posts
            WHERE (
              COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published'
              OR (
                COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at <= NOW()
              )
              OR (${previewMode ? 1 : 0} = 1 AND COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft')
            )
              AND (${idFilter ? 1 : 0} = 0 OR id = ${idFilter})
              AND (${slugFilter ? 1 : 0} = 0 OR LOWER(COALESCE(slug, '')) = ${slugFilter})
            ORDER BY COALESCE(published_at, created_at) DESC
          `;
        }
        const hasMore = Boolean(requestedLimit) && rows.length > requestedLimit;
        if (hasMore) {
          rows = rows.slice(0, requestedLimit);
        }
        const formattedPosts = applySeriesOrderOverrides(rows.map(formatPost));
        const items = formattedPosts.map((post) => {
          const summaryItem = {
            id: post.id,
            title: post.title,
            slug: post.slug,
            tag: post.tag,
            tags: post.tags,
            summary: post.summary,
            readTime: post.readTime,
            imageUrl: post.imageUrl,
            sliderImageUrl: post.sliderImageUrl,
            backgroundImageUrl: post.backgroundImageUrl,
            showOnHomepage: post.showOnHomepage,
            hideFromBlog: post.hideFromBlog,
            status: post.status,
            publishedAt: post.publishedAt,
            scheduledPublishAt: post.scheduledPublishAt,
            createdAt: post.createdAt,
          };
          if (!detailMode) {
            return summaryItem;
          }
          return {
            ...summaryItem,
            body: post.body,
            renderedBodyHtml: linkifyHtmlContent(normalizePostBodyHtml(post.body || ''), buildInternalLinkTargets(formattedPosts, post.slug)),
          };
        });
        const nextOffset = requestedOffset + items.length;
        return { items, previewMode, hasMore, nextOffset };
      },
    });

    await logRequestAudit(sql, event, {
      route: 'public-posts',
      action: featuredOnly ? 'read_featured' : 'read',
      outcome: cacheResult.cached ? 'cache_hit' : 'origin_hit',
      metadata: {
        id: idFilter || null,
        slug: slugFilter || null,
        featuredOnly,
        limit: requestedLimit,
        offset: requestedOffset,
        previewMode,
      },
    });

    return jsonResponse(200, cacheResult.payload, {
      'cache-control': 'public, max-age=120, stale-while-revalidate=60',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load posts' }, error.headers || {});
  }
}
