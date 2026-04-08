import { getAuthenticatedUser, jsonResponse, parseBody } from './_admin.mjs';

const STATIC_CONTENT_SETTINGS_KEY = 'static_content_workspace';
const MAX_QUERY_LENGTH = 400;
const MAX_RESULTS = 5;

const STATIC_PAGE_PATHS = {
  home: '/index.html',
  about: '/why-english-gematria.html',
  news: '/news.html',
  blog: '/blog.html',
  faq: '/faq.html',
  contact: '/contact.html',
  privacy: '/privacy.html',
  terms: '/terms.html',
};

function safeJsonParse(raw, fallback = {}) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function stripHtml(raw = '') {
  return String(raw || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input = '') {
  return Array.from(new Set(
    String(input || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  ));
}

function scoreDocument(query, terms, document) {
  const haystack = `${document.title} ${document.text}`.toLowerCase();
  let score = 0;

  for (const term of terms) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'g');
    const matches = haystack.match(regex);
    if (matches) {
      score += matches.length;
      if (document.title.toLowerCase().includes(term)) {
        score += 2;
      }
    }
  }

  if (query.length >= 6 && haystack.includes(query.toLowerCase())) {
    score += 4;
  }

  return score;
}

function buildSnippet(text, terms) {
  const plainText = String(text || '').trim();
  if (!plainText) return '';

  let matchIndex = -1;
  let matchLength = 0;
  const lower = plainText.toLowerCase();

  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
      matchLength = term.length;
    }
  }

  if (matchIndex === -1) {
    return plainText.slice(0, 220).trim();
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(plainText.length, matchIndex + matchLength + 140);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plainText.length ? '…' : '';
  return `${prefix}${plainText.slice(start, end).trim()}${suffix}`;
}

function buildAnswer(query, matches) {
  if (!matches.length) {
    return `I could not find a confident answer for "${query}" in the current site content. Try using more specific words from the page title or FAQ.`;
  }

  const top = matches[0];
  const additional = matches.slice(1, 3);
  const followup = additional.length
    ? ` I also found related references on ${additional.map((item) => item.title).join(' and ')}.`
    : '';

  return `${top.snippet}${followup}`;
}

async function loadCorpus(sql) {
  const [faqRows, postRows, staticRows] = await Promise.all([
    sql`SELECT id, question, answer FROM faqs WHERE is_published = TRUE ORDER BY sort_order ASC, created_at ASC LIMIT 1000`,
    sql`SELECT id, slug, title, summary, body FROM posts WHERE COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published' ORDER BY COALESCE(published_at, created_at) DESC LIMIT 200`,
    sql`SELECT setting_value FROM admin_settings WHERE setting_key = ${STATIC_CONTENT_SETTINGS_KEY} LIMIT 1`,
  ]);

  const corpus = [];

  for (const row of faqRows || []) {
    const title = stripHtml(row.question || 'FAQ entry');
    const text = stripHtml(row.answer || '');
    if (!title && !text) continue;
    corpus.push({
      id: `faq:${row.id}`,
      type: 'faq',
      title: title || 'FAQ entry',
      text,
      url: '/faq.html',
    });
  }

  for (const row of postRows || []) {
    const title = stripHtml(row.title || 'Blog post');
    const summary = stripHtml(row.summary || '');
    const body = stripHtml(row.body || '');
    const text = `${summary} ${body}`.trim();
    if (!title && !text) continue;
    const safeSlug = String(row.slug || '').trim();
    corpus.push({
      id: `post:${row.id}`,
      type: 'post',
      title: title || 'Blog post',
      text,
      url: safeSlug ? `/blog.html?post=${encodeURIComponent(safeSlug)}#${encodeURIComponent(safeSlug)}` : '/blog.html',
    });
  }

  const workspace = safeJsonParse(staticRows?.[0]?.setting_value, {});
  const pages = workspace?.pages && typeof workspace.pages === 'object' ? workspace.pages : {};

  for (const [pageId, content] of Object.entries(pages)) {
    if (!content || typeof content !== 'object') continue;
    const title = stripHtml(content.seoTitle || content.heroHeadline || pageId);
    const text = stripHtml([
      content.metaDescription,
      content.heroHeadline,
      content.heroBody,
      content.heroHeadlineSecondary,
      content.heroBodySecondary,
      content.staticHeadings,
      content.staticParagraphs,
      content.staticListItems,
      content.allStaticContent,
    ].filter(Boolean).join(' '));
    if (!title && !text) continue;
    corpus.push({
      id: `static:${pageId}`,
      type: 'page',
      title: title || pageId,
      text,
      url: STATIC_PAGE_PATHS[pageId] || `/${pageId}.html`,
    });
  }

  return corpus;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { sql } = await getAuthenticatedUser(event);
    const body = parseBody(event);
    const query = String(body?.query || '').trim().slice(0, MAX_QUERY_LENGTH);

    if (!query) {
      return jsonResponse(400, { error: 'query is required' });
    }

    const terms = tokenize(query);
    if (!terms.length) {
      return jsonResponse(400, { error: 'Please provide a more specific question.' });
    }

    const corpus = await loadCorpus(sql);
    const ranked = corpus
      .map((entry) => {
        const score = scoreDocument(query, terms, entry);
        return {
          ...entry,
          score,
          snippet: buildSnippet(entry.text, terms),
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((entry) => ({
        type: entry.type,
        title: entry.title,
        url: entry.url,
        snippet: entry.snippet,
        score: entry.score,
      }));

    return jsonResponse(200, {
      answer: buildAnswer(query, ranked),
      sources: ranked,
      query,
      corpusSize: corpus.length,
      siteOnly: true,
    });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    return jsonResponse(statusCode, { error: error?.message || 'Unable to run site chatbot search' }, error?.headers || {});
  }
}
