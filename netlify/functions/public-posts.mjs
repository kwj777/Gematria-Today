import { ensureAdminSchema, formatPost, getSqlClient, jsonResponse, syncBootstrapAdminUser } from './_admin.mjs';
import { getOptionalAuthenticatedSession } from './_auth.mjs';
import { promoteDueScheduledPosts } from './_posts.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, getClientIp, logRequestAudit, withCachedJson } from './_security.mjs';
import { assertSiteModuleEnabled } from './_site-modules.mjs';

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

export function buildInternalLinkTargets(posts, currentSlug = '') {
  const targets = [
    { phrase: 'Word/Phrase Calculator', href: '/calculator.html' },
    { phrase: 'gematria calculator', href: '/calculator.html' },
    { phrase: 'calculator', href: '/calculator.html' },
    { phrase: 'name lookup page', href: '/name-calculator.html' },
    { phrase: 'name calculator', href: '/name-calculator.html' },
    { phrase: 'names', href: '/name-calculator.html' },
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

// Links the first match of each target in one text node. Every target is
// matched against the original text and its anchor is only built once all of
// them are placed: splicing each anchor in as soon as it was found let a later,
// shorter target match inside the markup of an earlier one, so "gematria
// calculator" came out as an anchor nested in the href of another anchor
// (href="/<a ... href="/calculator.html">calculator</a>.html").
function linkifyTextToken(text, targets, linkedTargets) {
  const spans = [];
  targets.forEach((target) => {
    const normalizedPhrase = String(target?.phrase || '').toLowerCase();
    if (!target?.phrase || !target?.href || linkedTargets.has(normalizedPhrase)) {
      return;
    }
    const pattern = new RegExp(`(^|[^\\w])(${escapeRegex(target.phrase)})(?=[^\\w]|$)`, 'gi');
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const start = match.index + match[1].length;
      const end = start + match[2].length;
      if (spans.every((span) => end <= span.start || start >= span.end)) {
        spans.push({ start, end, href: target.href });
        linkedTargets.add(normalizedPhrase);
        return;
      }
      // This match sits inside a phrase an earlier, longer target already
      // links; look further along.
      pattern.lastIndex = match.index + 1;
    }
  });
  if (!spans.length) {
    return text;
  }
  spans.sort((left, right) => left.start - right.start);
  let output = '';
  let cursor = 0;
  spans.forEach(({ start, end, href }) => {
    output += `${text.slice(cursor, start)}<a class="news-inline-link" href="${escapeHtml(href)}">${text.slice(start, end)}</a>`;
    cursor = end;
  });
  return `${output}${text.slice(cursor)}`;
}

export function linkifyHtmlContent(html, targets = []) {
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
    return linkifyTextToken(token, targets, linkedTargets);
  }).join('');
}

// A ?preview=true answer depends on who asks: an admin's session gets the
// drafts, anyone else the public list. Shared caches (Netlify's CDN, proxies)
// key on the URL alone, so a public header let them hand one viewer's answer
// to the other -- unpublished drafts to an outsider polling the preview URL,
// or a draft-less list to the admin. Only the cookie-independent, non-preview
// answer may be cached publicly.
export function postsCacheHeaders({ previewRequested = false } = {}) {
  if (previewRequested) {
    return {
      'cache-control': 'private, no-store',
      'netlify-cdn-cache-control': 'no-store',
      vary: 'Cookie',
    };
  }
  return { 'cache-control': 'public, max-age=120, stale-while-revalidate=60' };
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
    await assertSiteModuleEnabled(sql, 'blog');
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
    await promoteDueScheduledPosts(sql);

    const featuredOnly = event.queryStringParameters?.featured === 'true';
    const previewRequested = event.queryStringParameters?.preview === 'true';
    const previewMode = previewRequested && (
      String(user?.role || '').toLowerCase() === 'admin'
      || Boolean(user?.isAdmin)
    );
    const idFilter = String(event.queryStringParameters?.id || '').trim();
    const slugFilter = String(event.queryStringParameters?.slug || '').trim().toLowerCase();
    const detailMode = Boolean(idFilter || slugFilter);
    const limitValue = Number.parseInt(event.queryStringParameters?.limit || '', 10);
    const requestedLimit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 12) : null;
    const offsetValue = Number.parseInt(event.queryStringParameters?.offset || '', 10);
    const requestedOffset = Number.isFinite(offsetValue) ? Math.min(Math.max(offsetValue, 0), 10000) : 0;

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
            ORDER BY COALESCE(published_at, scheduled_publish_at, created_at) DESC
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
            ORDER BY COALESCE(published_at, scheduled_publish_at, created_at) DESC
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
            ORDER BY COALESCE(published_at, scheduled_publish_at, created_at) DESC
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
            ORDER BY COALESCE(published_at, scheduled_publish_at, created_at) DESC
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
            updatedAt: post.updatedAt,
          };
          // Lists only draw titles and summaries, so the rendered body is
          // built and sent for a single post (?id= or ?slug=) only. Sending
          // it with every list item shipped the whole archive's article HTML
          // to the blog index and the home page.
          if (!detailMode) {
            return summaryItem;
          }
          return {
            ...summaryItem,
            body: post.body,
            renderedBodyHtml: linkifyHtmlContent(
              normalizePostBodyHtml(post.body || ''),
              buildInternalLinkTargets(formattedPosts, post.slug)
            ),
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
      ...postsCacheHeaders({ previewRequested }),
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, { error: error.message || 'Failed to load posts' }, error.headers || {});
  }
}
