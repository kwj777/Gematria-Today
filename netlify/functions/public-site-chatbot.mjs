import {
  ensureAdminSchema,
  getSqlClient,
  jsonResponse,
  parseBody,
  syncBootstrapAdminUser,
} from './_admin.mjs';
import { getOptionalAuthenticatedSession, getOrCreateVisitorSession } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, getClientIp, logRequestAudit } from './_security.mjs';

const MAX_QUERY_LENGTH = 400;
const MAX_RESULTS = 5;
const FAQ_ANSWER_MAX_LENGTH = 900;
const CONVERSATIONAL_PREFIXES = [
  'what about', 'how about', 'what is', 'what are', 'who is', 'who are', 'where is', 'where are',
  'tell me about', 'search for', 'search the site for', 'find', 'look up', 'show me', 'can you tell me about',
  'can you find', 'can you search for', 'please find', 'please search for', 'i want to know about',
  'i want to learn about', 'give me info on', 'give me information on', 'do you have any articles on',
  'do you have articles on', 'do you have any posts on', 'do you have posts on', 'do you have anything on',
  'do you have info on',
];
const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'for', 'from', 'have', 'i', 'in', 'is', 'it',
  'me', 'my', 'of', 'on', 'or', 'please', 'search', 'show', 'tell', 'that', 'the', 'this', 'to', 'up', 'what',
  'where', 'who', 'with', 'you', 'your',
]);
const LOW_SIGNAL_TERMS = new Set(['article', 'articles', 'info', 'information', 'page', 'pages', 'post', 'posts']);

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
      .filter((token) => !SEARCH_STOP_WORDS.has(token))
      .filter((token) => !LOW_SIGNAL_TERMS.has(token))
  ));
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugifyQuestion(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'faq-item';
}

function stripConversationalPrefix(rawQuery = '') {
  const normalized = String(rawQuery || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';

  let query = normalized;
  let prefixRemoved = true;

  while (prefixRemoved && query) {
    prefixRemoved = false;
    const lowered = query.toLowerCase();

    for (const prefix of CONVERSATIONAL_PREFIXES) {
      const normalizedPrefix = prefix.toLowerCase();
      const exactPrefixPattern = new RegExp(`^${escapeRegExp(normalizedPrefix)}$`, 'i');
      const prefixedPattern = new RegExp(`^${escapeRegExp(normalizedPrefix)}[\\s,.:;!?-]+`, 'i');

      if (exactPrefixPattern.test(lowered)) {
        query = '';
        prefixRemoved = true;
        break;
      }

      if (prefixedPattern.test(query)) {
        query = query.replace(prefixedPattern, '').trim();
        prefixRemoved = true;
        break;
      }
    }
  }

  return query.replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '').trim();
}

function scoreDocument(query, terms, document) {
  const haystack = `${document.title} ${document.text}`.toLowerCase();
  let score = 0;
  const matchedTerms = new Set();

  for (const term of terms) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'g');
    const matches = haystack.match(regex);
    if (matches) {
      score += matches.length;
      matchedTerms.add(term);
      if (document.title.toLowerCase().includes(term)) score += 2;
    }
  }

  let hasExactPhraseMatch = false;
  if (query.length >= 6 && haystack.includes(query.toLowerCase())) {
    score += 4;
    hasExactPhraseMatch = true;
  }

  const titleTerms = tokenize(document.title);
  const titleTermSet = new Set(titleTerms);
  const titleMatches = terms.filter((term) => titleTermSet.has(term)).length;
  const titleOverlap = titleTerms.length ? titleMatches / titleTerms.length : 0;
  const queryOverlap = terms.length ? titleMatches / terms.length : 0;

  if (document.type === 'faq' && titleMatches >= 2 && (titleOverlap >= 0.6 || queryOverlap >= 0.6)) {
    score += 20;
  }

  return { score, matchedTerms: matchedTerms.size, hasExactPhraseMatch, titleOverlap, queryOverlap };
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

  if (matchIndex === -1) return plainText.slice(0, 220).trim();

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(plainText.length, matchIndex + matchLength + 140);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plainText.length ? '…' : '';
  return `${prefix}${plainText.slice(start, end).trim()}${suffix}`;
}

function truncateForAnswer(text, maxLength) {
  const plain = String(text || '').trim();
  if (plain.length <= maxLength) return plain;
  const cutoff = plain.lastIndexOf(' ', maxLength);
  const safeCut = cutoff > maxLength - 80 ? cutoff : maxLength;
  return `${plain.slice(0, safeCut).trim()}…`;
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

  if (top.type === 'faq' && top.fullAnswer) {
    return `${truncateForAnswer(top.fullAnswer, FAQ_ANSWER_MAX_LENGTH)}${followup}`;
  }

  return `${top.snippet}${followup}`;
}

async function loadCorpus(sql) {
  const [faqRows, postRows] = await Promise.all([
    sql`SELECT id, question, answer FROM faqs WHERE is_published = TRUE ORDER BY sort_order ASC, created_at ASC LIMIT 1000`,
    sql`SELECT id, slug, title, summary, body FROM posts WHERE COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published' ORDER BY COALESCE(published_at, created_at) DESC LIMIT 200`,
  ]);

  const corpus = [];

  for (const row of faqRows || []) {
    const title = stripHtml(row.question || 'FAQ entry');
    const text = stripHtml(row.answer || '');
    if (!title && !text) continue;
    const slug = slugifyQuestion(row.question || '');
    corpus.push({
      id: `faq:${row.id}`,
      type: 'faq',
      title: title || 'FAQ entry',
      text,
      fullAnswer: text,
      url: `/faq.html?id=${encodeURIComponent(slug)}#faqPanel-${encodeURIComponent(slug)}`,
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

  return corpus;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'public-site-chatbot' });
    const sql = getSqlClient();
    await ensureAdminSchema(sql);
    await syncBootstrapAdminUser(sql);
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'public-site-chatbot-ip',
        key: getClientIp(event),
        limit: 25,
        windowMs: 60_000,
        blockMs: 5 * 60_000,
        message: 'Too many SiteSeeker requests. Please try again soon.',
      });
    }

    const { visitorSessionId, isNew: isNewVisitor, visitorCookie } = getOrCreateVisitorSession(event);
    const body = parseBody(event);
    const rawQuery = String(body?.query || '').trim().slice(0, MAX_QUERY_LENGTH);
    const query = stripConversationalPrefix(rawQuery);

    if (!rawQuery) return jsonResponse(400, { error: 'query is required' });

    const terms = tokenize(query);
    if (!terms.length) return jsonResponse(400, { error: 'Please provide a more specific question.' });

    const corpus = await loadCorpus(sql);
    const rankedEntries = corpus
      .map((entry) => {
        const { score, matchedTerms, hasExactPhraseMatch } = scoreDocument(query, terms, entry);
        const minTermMatches = terms.length >= 2 ? 2 : 1;
        const passesRelevanceGate = hasExactPhraseMatch || matchedTerms >= minTermMatches;
        return {
          ...entry,
          score,
          matchedTerms,
          hasExactPhraseMatch,
          passesRelevanceGate,
          snippet: buildSnippet(entry.text, terms),
        };
      })
      .filter((entry) => entry.score > 0 && entry.passesRelevanceGate)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    const ranked = rankedEntries.map((entry) => ({
      type: entry.type,
      title: entry.title,
      url: entry.url,
      snippet: entry.snippet,
      score: entry.score,
    }));

    await logRequestAudit(sql, event, {
      route: 'public-site-chatbot',
      action: 'search',
      outcome: ranked.length ? 'success' : 'no_match',
      metadata: { queryLength: query.length, resultCount: ranked.length, visitorSessionId },
    });

    const responseHeaders = { 'cache-control': 'no-store' };
    if (isNewVisitor) responseHeaders['set-cookie'] = visitorCookie;
    return jsonResponse(200, {
      answer: buildAnswer(query, rankedEntries),
      sources: ranked,
      query,
      highlightTerms: terms,
      corpusSize: corpus.length,
      siteOnly: true,
    }, responseHeaders);
  } catch (error) {
    return jsonResponse(error?.statusCode || 500, { error: error?.message || 'Unable to run site chatbot search' }, error?.headers || {});
  }
}
