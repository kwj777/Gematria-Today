import { getOptionalAuthenticatedSession, getSqlClient, jsonResponse as secureJsonResponse } from './_auth.mjs';
import { applyRateLimit, assertEndpointEnabled, buildCacheKey, fetchWithTimeout, getClientIp, getProtectionConfig, logRequestAudit, withCachedJson } from './_security.mjs';
function toResponse(statusCode, payload, contentType = "application/json; charset=utf-8") {
  const body = contentType.startsWith("application/json") ? JSON.stringify(payload) : payload;
  return new Response(body, {
    status: statusCode,
    headers: { 'content-type': contentType },
  });
}

function toNetlifyResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

function extractWordFromEvent(event) {
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

function buildWordnikDefinitionUrl(word) {
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

function getStatusCode(error) {
  if (error.message?.startsWith('Missing required query parameter: word')) {
    return 400;
  }

  if (error.message?.startsWith('Missing WORDNIK_')) {
    return 500;
  }

  if (error.message?.startsWith('Wordnik request failed')) {
    return 502;
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

function sanitizeInlineHtml(value) {
  return String(value ?? '')
    .replace(/<a\s+([^>]*?)href=(['"])(.*?)\2([^>]*)>(.*?)<\/a>/gi, (_match, beforeHref, _quote, href, afterHref, textContent) => {
      const hrefValue = escapeHtml(href);
      const label = escapeHtml(stripHtmlTags(textContent));
      const extraAttributes = `${beforeHref} ${afterHref}`;
      const targetBlank = /target\s*=\s*(['"])_blank\1/i.test(extraAttributes);
      const relValueMatch = extraAttributes.match(/rel\s*=\s*(['"])(.*?)\1/i);
      const relValue = relValueMatch ? escapeHtml(relValueMatch[2]) : 'noopener noreferrer';
      const targetAttribute = targetBlank ? ' target="_blank"' : '';
      return `<a href="${hrefValue}"${targetAttribute} rel="${relValue}">${label}</a>`;
    })
    .replace(/<(?!\/?a\b)[^>]*>/gi, ' ')
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
  return `<a class="calculator-word-link" href="${searchPath}" target="_blank" rel="noopener noreferrer">${escapeHtml(trimmedWord)}</a>`;
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


function sanitizeCalculatorPath(value) {
  const fallbackPath = '/calculator.html';

  if (!value) {
    return fallbackPath;
  }

  try {
    const parsed = new URL(String(value), 'https://endtimes.today');
    const normalizedPathname = parsed.pathname === '/calculator' ? '/calculator.html' : parsed.pathname;

    if (parsed.origin !== 'https://endtimes.today' || normalizedPathname !== '/calculator.html') {
      return fallbackPath;
    }

    return `${normalizedPathname}${parsed.search}`;
  } catch (_error) {
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

function renderDefinitionPage(payload, { calculatorPath = '/calculator.html' } = {}) {
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
  const canonicalPath = `/definition?word=${encodeURIComponent(payload.word)}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Definition: ${escapeHtml(payload.word)}</title>
    <link rel="canonical" href="${canonicalPath}" />
    <script>
      if (window.location.pathname.startsWith('/.netlify/functions/wordnikDefinition')) {
        window.history.replaceState({}, '', ${JSON.stringify(canonicalPath)});
      }
    </script>
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
  <body>
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
    <script>
      (() => {
        const closeButton = document.getElementById('close-definition-button');
        if (!closeButton) return;

        closeButton.addEventListener('click', () => {
          window.close();
          setTimeout(() => {
            if (!window.closed) {
              window.location.assign(${JSON.stringify(calculatorPath)});
            }
          }, 100);
        });
      })();
    </script>
  </body>
</html>`;
}

async function fetchDefinition(sql, source, word) {
  const trimmedWord = String(word ?? '').trim();

  if (!trimmedWord) {
    throw new Error('Missing required query parameter: word');
  }

  const url = buildWordnikDefinitionUrl(trimmedWord);
  const response = await fetchWithTimeout(url, {}, getProtectionConfig().wordnikTimeoutMs);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wordnik request failed with ${response.status}: ${errorText || response.statusText}`);
  }

  const payload = {
    word: trimmedWord,
    definitions: await response.json(),
  };

  await logRequestAudit(sql, source, {
    route: 'wordnikDefinition',
    action: 'lookup',
    outcome: 'origin_hit',
    metadata: { word: trimmedWord.toLowerCase() },
  });

  return payload;
}

export default async function onRequest(request) {
  const requestUrl = new URL(request.url);
  const word = requestUrl.searchParams.get('word');
  const calculatorPath = sanitizeCalculatorPath(requestUrl.searchParams.get('returnTo'));

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
    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'wordnikDefinition', word: String(word).trim().toLowerCase() }),
      route: 'wordnikDefinition',
      ttlSeconds: 600,
      compute: () => fetchDefinition(sql, request, word),
    });
    const payload = cacheResult.payload;
    return isHtmlRequest(request)
      ? toResponse(200, renderDefinitionPage(payload, { calculatorPath }), 'text/html; charset=utf-8')
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
    const cacheResult = await withCachedJson(sql, {
      cacheKey: buildCacheKey({ route: 'wordnikDefinition', word: String(word).trim().toLowerCase() }),
      route: 'wordnikDefinition',
      ttlSeconds: 600,
      compute: () => fetchDefinition(sql, event, word),
    });
    const payload = cacheResult.payload;
    return secureJsonResponse(200, payload, {
      'cache-control': 'public, max-age=600, stale-while-revalidate=120',
      'x-cache-status': cacheResult.cached ? 'hit' : 'miss',
    });
  } catch (error) {
    return secureJsonResponse(getStatusCode(error), { error: error.message }, error.headers || {});
  }
}
