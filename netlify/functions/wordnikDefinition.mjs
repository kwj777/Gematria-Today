import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse as secureJsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, documentSecurityHeaders, fetchWithTimeout, getClientIp, getProtectionConfig, logRequestAudit, withCachedJson } from './_security.mjs';
import { extractKindFromEvent, isNameLookup } from './englishGematria.mjs';
// netlify.toml's [[headers]] blocks never reach a function response, so the
// noindex has to be set here. It is sent alongside the meta tag rather than
// instead of it: the header covers the error branches, which render bare HTML
// with no <head> for a meta tag to sit in.
const NOINDEX_HTML_HEADERS = Object.freeze({ 'x-robots-tag': 'noindex, nofollow' });

// The HTML branch renders Wordnik's text on the site's own origin, so it
// carries the site's document headers -- CSP included -- like every other
// server-rendered page. Its scripts live in /page-scripts/wordnik-definition-1.js
// because that CSP allows no inline script.
function toResponse(statusCode, payload, contentType = "application/json; charset=utf-8") {
  const isJson = contentType.startsWith("application/json");
  const body = isJson ? JSON.stringify(payload) : payload;
  return new Response(body, {
    status: statusCode,
    headers: isJson
      ? { 'content-type': contentType }
      : documentSecurityHeaders({ 'content-type': contentType, ...NOINDEX_HTML_HEADERS }),
  });
}

function toNetlifyResponse(statusCode, payload, extraHeaders = {}) {
  return secureJsonResponse(statusCode, payload, extraHeaders);
}

export function extractWordFromEvent(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  if ('queryStringParameters' in event) {
    return event.queryStringParameters?.word ?? null;
  }

  if ('rawUrl' in event && typeof event.rawUrl === 'string') {
    return new URL(event.rawUrl).searchParams.get('word');
  }

  return null;
}

export function buildWordnikDefinitionUrl(word) {
  const baseUrl = process.env.WORDNIK_BASE_URL ?? process.env.WORDNIK_URL_BASE;
  const apiKey = process.env.WORDNIK_API_KEY;

  if (!baseUrl) {
    throw new Error('Missing WORDNIK_BASE_URL environment variable');
  }

  if (!apiKey) {
    throw new Error('Missing WORDNIK_API_KEY environment variable');
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(`${encodeURIComponent(word)}/definitions`, normalizedBaseUrl);
  url.searchParams.set('api_key', apiKey);

  return url;
}

export function getStatusCode(error) {
  if (error.message?.startsWith('Missing required query parameter: word')) {
    return 400;
  }

  if (error.message?.startsWith('Missing WORDNIK_')) {
    return 500;
  }

  if (error.message?.startsWith('Wordnik request failed')) {
    return 502;
  }

  if (error.statusCode) {
    return error.statusCode;
  }

  return 500;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripHtmlTags(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// Marks where a rebuilt link goes back into the escaped text. A private-use
// character, removed from the input and never produced by decodeEntities, so
// the definition text cannot forge one.
const LINK_SLOT = '\uE000';

// Wordnik's text is HTML-ish. Its entities are decoded before the text is
// escaped again, so "&amp;" does not render as "&amp;amp;".
function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const code = /^#x/i.test(entity) ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff && code !== LINK_SLOT.codePointAt(0) ? String.fromCodePoint(code) : match;
  });
}

// Only an absolute http(s) URL survives. javascript:, data: and anything
// relative are dropped along with the link.
export function safeDefinitionHref(attributes) {
  const match = String(attributes ?? '').match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/i);
  if (!match) return null;
  try {
    const url = new URL(decodeEntities(match[1] ?? match[2] ?? match[3]).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// Definition text comes from Wordnik, which aggregates third-party sources, and
// is rendered as markup on this origin. Anchors used to be kept whole -- every
// attribute, any href scheme -- and any other `<a ...>` passed the tag strip
// untouched, so an onmouseover anchor or a javascript: link in a definition ran
// script for every visitor to that word. Each anchor is now rebuilt from
// scratch (an http(s) href, an optional target, a fixed rel), every other tag
// is removed, and all remaining text is escaped, which also neutralizes a tag
// left unclosed.
export function sanitizeInlineHtml(value) {
  const links = [];
  const withPlaceholders = String(value ?? '')
    .replaceAll(LINK_SLOT, '')
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_match, attributes, textContent) => {
      const label = escapeHtml(decodeEntities(stripHtmlTags(textContent)));
      const href = safeDefinitionHref(attributes);
      const targetAttribute = /\btarget\s*=\s*(['"]?)_blank\1/i.test(attributes) ? ' target="_blank"' : '';
      links.push(href ? `<a href="${escapeHtml(href)}"${targetAttribute} rel="noopener noreferrer">${label}</a>` : label);
      return `${LINK_SLOT}${links.length - 1}${LINK_SLOT}`;
    });
  return escapeHtml(decodeEntities(withPlaceholders.replace(/<[^>]*>/g, ' ')))
    .replace(new RegExp(`${LINK_SLOT}(\\d+)${LINK_SLOT}`, 'g'), (_match, index) => links[Number(index)])
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

function createCalculatorSearchLink(word) {
  const trimmedWord = String(word ?? '').trim();

  if (!trimmedWord) {
    return '';
  }

  const searchPath = `/calculator.html?query=${encodeURIComponent(trimmedWord)}`;
  return `<a class="calculator-word-link" href="${searchPath}">${escapeHtml(trimmedWord)}</a>`;
}

function linkifySearchWords(html) {
  return String(html ?? '')
    .split(/(<a\b[^>]*>.*?<\/a>)/gi)
    .map((segment) => {
      if (/^<a\b/i.test(segment)) {
        return segment;
      }

      return segment.replace(/\b([A-Za-z]{5,})\b/g, (_match, word) => createCalculatorSearchLink(word));
    })
    .join('');
}

function isHtmlRequest(request) {
  const acceptHeader = request.headers.get('accept') ?? '';
  return acceptHeader.includes('text/html');
}

function createDefinitionMeta(definition) {
  const details = [];

  if (definition.partOfSpeech) {
    details.push(`<span class="chip">${escapeHtml(definition.partOfSpeech)}</span>`);
  }

  if (definition.attributionText) {
    details.push(`<span class="chip muted">${escapeHtml(definition.attributionText)}</span>`);
  }

  return details.length > 0 ? `<div class="definition-meta">${details.join('')}</div>` : '';
}


const ALLOWED_RETURN_PATHS = new Set(['/', '/index.html', '/calculator.html', '/name-calculator.html']);

function sanitizeReturnPath(value) {
  const fallbackPath = '/';

  if (!value) {
    return fallbackPath;
  }

  try {
    const parsed = new URL(String(value), 'https://gematria.today');
    const normalizedPathname = parsed.pathname === '/calculator' ? '/calculator.html' : parsed.pathname;

    if (parsed.origin !== 'https://gematria.today' || !ALLOWED_RETURN_PATHS.has(normalizedPathname)) {
      return fallbackPath;
    }

    return `${normalizedPathname}${parsed.search}`;
  } catch {
    return fallbackPath;
  }
}

function createExamples(definition) {
  const examples = [];

  if (definition.exampleUses?.length) {
    examples.push(...definition.exampleUses.map((example) => stripHtmlTags(example.text)).filter(Boolean));
  }

  if (definition.citations?.length) {
    examples.push(...definition.citations.map((citation) => stripHtmlTags(citation.cite)).filter(Boolean));
  }

  const uniqueExamples = [...new Set(examples.map((value) => stripHtmlTags(value)).filter(Boolean))].slice(0, 3);

  if (uniqueExamples.length === 0) {
    return '';
  }

  const items = uniqueExamples.map((example) => `<li>${linkifySearchWords(escapeHtml(example))}</li>`).join('');
  return `<div class="examples"><h3>Examples</h3><ul>${items}</ul></div>`;
}

function renderDefinitionPage(payload, { returnPath = '/', isName = false } = {}) {
  const definitions = Array.isArray(payload.definitions) ? payload.definitions : [];
  const visibleDefinitions = definitions
    .map((definition) => ({
      definition,
      sanitizedText: linkifySearchWords(sanitizeInlineHtml(definition.text)),
    }))
    .filter(({ sanitizedText }) => Boolean(sanitizedText));

  const definitionItems = visibleDefinitions
    .map(({ definition, sanitizedText }, index) => `
        <article class="definition-card">
          <div class="definition-number">${index + 1}</div>
          <div class="definition-content">
            ${createDefinitionMeta(definition)}
            <p class="definition-text">${sanitizedText}</p>
            ${createExamples(definition)}
          </div>
        </article>`)
    .join('');

  const body = visibleDefinitions.length > 0
    ? definitionItems
    : '<p class="empty-state">No definitions were returned for this word.</p>';
  const canonicalPath = `/definition?word=${encodeURIComponent(payload.word)}${isName ? '&kind=name' : ''}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Definition: ${escapeHtml(payload.word)}</title>
    <!--
      This page is a reading aid for visitors who click a word on our own
      pages. Its body is Wordnik's definition text verbatim, so it is not ours
      to publish: republished as an indexable page it is somebody else's
      dictionary entry under our name, competing for the definition queries
      that dictionary owns. It used to be indexable and self-canonical, with
      the home page linking one every day for the Wordnik word of the day.

      noindex, not a robots.txt Disallow: Google has to be able to fetch the
      page to see this tag. Blocking the path would freeze the URLs already
      indexed exactly as they are.

      nofollow because linkifySearchWords turns every long word in the
      definition body into a /calculator.html?query= link, and those links are
      how a crawl walked into the words table in the first place.
    -->
    <meta name="robots" content="noindex,nofollow" />
    <script defer src="/page-scripts/wordnik-definition-1.js"></script>
    <style>
      :root { color-scheme: light; }
      body {
        font-family: Georgia, "Times New Roman", serif;
        margin: 0;
        background: #f6f8fa;
        color: #1f2328;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 2.5rem 1rem 4rem;
      }
      .page-header {
        background: white;
        border: 1px solid #d0d7de;
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 10px 30px rgba(31, 35, 40, 0.06);
      }
      h1 {
        font-size: clamp(2rem, 4vw, 3rem);
        margin: 0;
        text-transform: capitalize;
      }
      .subtitle {
        margin-top: 0.75rem;
        color: #57606a;
        font-family: Helvetica, Arial, sans-serif;
      }
      .top-controls {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 1rem;
      }
      .close-button {
        border: 1px solid #d0d7de;
        background: #ffffff;
        color: #24292f;
        border-radius: 999px;
        padding: 0.4rem 0.85rem;
        font: 600 0.95rem/1 Helvetica, Arial, sans-serif;
        cursor: pointer;
      }
      .close-button:hover {
        background: #f6f8fa;
      }
      .definitions {
        margin-top: 1.5rem;
        display: grid;
        gap: 1rem;
      }
      .definition-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 1rem;
        background: white;
        border: 1px solid #d0d7de;
        border-radius: 16px;
        padding: 1.25rem;
        box-shadow: 0 10px 30px rgba(31, 35, 40, 0.04);
      }
      .definition-number {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #ddf4ff;
        color: #0550ae;
        font: 700 1rem/1 Helvetica, Arial, sans-serif;
      }
      .definition-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        font-family: Helvetica, Arial, sans-serif;
      }
      .chip {
        display: inline-block;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        background: #eaeef2;
        font-size: 0.9rem;
      }
      .chip.muted, .muted { color: #57606a; }
      .definition-text {
        margin: 0;
        font-size: 1.1rem;
        line-height: 1.65;
      }
      .calculator-word-link {
        color: #0969da;
        text-decoration: underline;
        text-underline-offset: 0.14em;
      }
      .calculator-word-link:hover {
        color: #0550ae;
      }
      .examples {
        margin-top: 1rem;
        font-family: Helvetica, Arial, sans-serif;
      }
      .examples h3 {
        margin: 0 0 0.5rem;
        font-size: 1rem;
      }
      .examples ul {
        margin: 0;
        padding-left: 1.25rem;
      }
      .empty-state {
        margin-top: 1.5rem;
        padding: 1.25rem;
        background: white;
        border: 1px solid #d0d7de;
        border-radius: 16px;
        font-family: Helvetica, Arial, sans-serif;
      }
    </style>
  </head>
  <body data-canonical-path="${escapeHtml(canonicalPath)}" data-return-path="${escapeHtml(returnPath)}">
    <main>
      <div class="top-controls">
        <button id="close-definition-button" class="close-button" type="button" aria-label="Close this definition page">✕ Close</button>
      </div>
      <section class="page-header">
        <h1>${escapeHtml(payload.word)}</h1>
        <p class="subtitle">Dictionary-style definitions sourced from Wordnik.</p>
      </section>
      <section class="definitions">${body}</section>
    </main>
  </body>
</html>`;
}

async function fetchDefinition(sql, source, word, { isName = false } = {}) {
  const trimmedWord = String(word ?? '').trim();

  if (!trimmedWord) {
    throw new Error('Missing required query parameter: word');
  }

  const url = buildWordnikDefinitionUrl(trimmedWord);
  const response = await fetchWithTimeout(url, {}, getProtectionConfig().wordnikTimeoutMs);

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw Object.assign(
        new Error("Wordnik is busy right now. Please try again in a few minutes."),
        { statusCode: 429, upstreamStatus: 429, upstreamBody: errorText || response.statusText },
      );
    }
    throw Object.assign(
      new Error("We couldn't reach Wordnik just now. Please try again in a little while."),
      { statusCode: 502, upstreamStatus: response.status, upstreamBody: errorText || response.statusText },
    );
  }

  const payload = {
    word: trimmedWord,
    definitions: await response.json(),
  };

  await logRequestAudit(sql, source, {
    route: 'wordnikDefinition',
    action: 'lookup',
    outcome: 'origin_hit',
    metadata: isName ? { kind: 'name' } : { word: trimmedWord.toLowerCase() },
  });

  return payload;
}

// The name calculator asks whether each name it shows has a definition -- for
// every visitor, signed in or not -- and its "(definition)" link opens this
// page for the name. It sends kind=name, as it does to englishGematria: a name
// is a person, so it is fetched fresh instead of being kept in the shared
// response cache (the payload carries the name for its TTL and the cleanup
// grace period after it), and the audit entry records that a name was looked
// up, not which one.
async function lookupDefinition(sql, source, word, { isName }) {
  const compute = () => fetchDefinition(sql, source, word, { isName });
  if (isName) return { payload: await compute(), cached: false };
  return withCachedJson(sql, {
    cacheKey: buildCacheKey({ route: 'wordnikDefinition', word: String(word).trim().toLowerCase() }),
    route: 'wordnikDefinition',
    ttlSeconds: 600,
    compute,
  });
}

export default async function onRequest(request) {
  const requestUrl = new URL(request.url);
  const word = requestUrl.searchParams.get('word');
  const returnPath = sanitizeReturnPath(requestUrl.searchParams.get('returnTo'));
  const isName = isNameLookup(requestUrl.searchParams.get('kind'));

  if (!word?.trim()) {
    const payload = { error: 'Missing required query parameter: word' };
    return isHtmlRequest(request)
      ? toResponse(400, '<!doctype html><title>Error</title><p>Missing required query parameter: word</p>', 'text/html; charset=utf-8')
      : toResponse(400, payload);
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'wordnikDefinition' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(request, { sql });
    if (!user) {
      await applyRateLimit(sql, request, {
        scope: 'wordnikDefinition-ip',
        key: getClientIp(request),
        limit: 20,
        windowMs: 60_000,
        blockMs: 10 * 60_000,
        message: 'Too many definition lookups.',
      });
    }
    const cacheResult = await lookupDefinition(sql, request, word, { isName });
    const payload = cacheResult.payload;
    return isHtmlRequest(request)
      ? toResponse(200, renderDefinitionPage(payload, { returnPath, isName }), 'text/html; charset=utf-8')
      : toResponse(200, payload, 'application/json; charset=utf-8');
  } catch (error) {
    const statusCode = getStatusCode(error);
    return isHtmlRequest(request)
      ? toResponse(statusCode, `<!doctype html><title>Error</title><p>${escapeHtml(error.message)}</p>`, 'text/html; charset=utf-8')
      : toResponse(statusCode, { error: error.message });
  }
}

export async function handler(event) {
  const word = extractWordFromEvent(event);
  const isName = isNameLookup(extractKindFromEvent(event));

  if (!word?.trim()) {
    return toNetlifyResponse(400, { error: 'Missing required query parameter: word' });
  }

  try {
    assertEndpointEnabled({ publicRoute: true, expensive: true, route: 'wordnikDefinition' });
    const sql = getSqlClient();
    const { user } = await getOptionalAuthenticatedSession(event, { sql });
    if (!user) {
      await applyRateLimit(sql, event, {
        scope: 'wordnikDefinition-ip',
        key: getClientIp(event),
        limit: 20,
        windowMs: 60_000,
        blockMs: 10 * 60_000,
        message: 'Too many definition lookups.',
      });
    }
    const cacheResult = await lookupDefinition(sql, event, word, { isName });
    const payload = cacheResult.payload;
    return secureJsonResponse(200, payload, {
      'cache-control': isName ? 'private, max-age=600' : 'public, max-age=600, stale-while-revalidate=120',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return secureJsonResponse(getStatusCode(error), { error: error.message }, error.headers || {});
  }
}
