#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    file: '',
    output: 'json',
    status: 'draft',
    showOnHomepage: false,
    hideFromBlog: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--file' || arg === '-f') && argv[i + 1]) {
      options.file = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--status' && argv[i + 1]) {
      options.status = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--show-on-homepage') {
      options.showOnHomepage = true;
      continue;
    }
    if (arg === '--hide-from-blog') {
      options.hideFromBlog = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function markdownToHtml(markdown = '') {
  const lines = String(markdown || '').replaceAll('\r', '').split('\n');
  const htmlParts = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      htmlParts.push(`<h3>${trimmed.slice(4).trim()}</h3>`);
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList();
      htmlParts.push(`<h2>${trimmed.slice(3).trim()}</h2>`);
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      htmlParts.push(`<h1>${trimmed.slice(2).trim()}</h1>`);
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        htmlParts.push('<ul>');
        inList = true;
      }
      htmlParts.push(`<li>${trimmed.slice(2).trim()}</li>`);
      return;
    }

    flushList();
    htmlParts.push(`<p>${trimmed}</p>`);
  });

  flushList();
  return htmlParts.join('\n').trim();
}

function parseSimpleFrontmatter(lines = []) {
  const frontmatter = {};
  let currentKey = '';

  const normalizeScalarValue = (value = '') => {
    const trimmed = String(value ?? '').trim();
    const singleQuoted = trimmed.match(/^'(.*)'$/);
    if (singleQuoted) {
      return singleQuoted[1];
    }
    const doubleQuoted = trimmed.match(/^"(.*)"$/);
    if (doubleQuoted) {
      return doubleQuoted[1];
    }
    return trimmed;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const listMatch = trimmed.match(/^-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) {
        const existingValue = frontmatter[currentKey];
        frontmatter[currentKey] = [];
        if (typeof existingValue === 'string' && existingValue) {
          frontmatter[currentKey].push(existingValue);
        }
      }
      frontmatter[currentKey].push(normalizeScalarValue(listMatch[1]));
      return;
    }

    const keyValueMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!keyValueMatch) {
      return;
    }

    const [, rawKey, rawValue = ''] = keyValueMatch;
    currentKey = rawKey;
    frontmatter[currentKey] = normalizeScalarValue(rawValue);
  });

  return frontmatter;
}

function extractMarkdownDocument(markdown = '') {
  const normalized = String(markdown || '').replaceAll('\r', '');
  const lines = normalized.split('\n');
  const frontmatter = {};
  let bodyStartIndex = 0;

  if (lines[0]?.trim() === '---') {
    const frontmatterEndIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
    if (frontmatterEndIndex >= 0) {
      const rawFrontmatterLines = lines.slice(1, frontmatterEndIndex + 1);
      const parsedFrontmatter = parseSimpleFrontmatter(rawFrontmatterLines);
      Object.assign(frontmatter, parsedFrontmatter);
      bodyStartIndex = frontmatterEndIndex + 2;
    }
  }

  const seoPrefixPatterns = [
    {
      key: 'title',
      pattern: /^\\?\*\\?\*\s*seo-friendly title\s*:\s*\\?\*\\?\*\s*(.+)$/i
    },
    {
      key: 'summary',
      pattern: /^\\?\*\\?\*\s*meta description(?:\s*\((?:≤|<=|<)\s*160\s*chars\))?\s*:\s*\\?\*\\?\*\s*(.+)$/i
    },
    {
      key: 'tag',
      pattern: /^\\?\*\\?\*\s*tags?\s*\(3-5\)\s*:\s*\\?\*\\?\*\s*(.+)$/i
    },
    {
      key: 'suggestedWordCount',
      pattern: /^\\?\*\\?\*\s*suggested word count\s*:\s*\\?\*\\?\*\s*(.+)$/i
    }
  ];

  const cleanInlineMarkers = (value = '') => value
    .replaceAll('\\*\\*', '')
    .replaceAll('**', '')
    .trim();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    seoPrefixPatterns.forEach(({ key, pattern }) => {
      const match = trimmed.match(pattern);
      if (!match) {
        return;
      }
      const rawValue = match[1] || '';
      frontmatter[key] = cleanInlineMarkers(rawValue);
      if (!bodyStartIndex && key === 'suggestedWordCount') {
        bodyStartIndex = index + 1;
      }
    });
  });

  let bodyMarkdown = lines.slice(bodyStartIndex).join('\n').trim();
  if (!bodyMarkdown) {
    bodyMarkdown = normalized;
  }

  const bodyLines = bodyMarkdown.split('\n').map((line) => line.trim()).filter(Boolean);
  const firstHeading = bodyLines.find((line) => line.startsWith('# '));
  const titleFromHeading = firstHeading ? firstHeading.slice(2).trim() : '';
  const title = frontmatter.title || titleFromHeading;
  const summary = frontmatter.summary || frontmatter.description || '';
  const normalizedTags = (Array.isArray(frontmatter.tags) ? frontmatter.tags.join(', ') : String(frontmatter.tag || frontmatter.tags || ''))
    .split(/[;,]/)
    .map((token) => token.trim())
    .filter(Boolean)
    .join(', ');
  const tag = normalizedTags;
  const imageUrl = '';
  const sliderImageUrl = '';

  const bodyWordCount = bodyMarkdown
    .replace(/[`*_>#-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
  const estimatedReadMinutes = Math.max(1, Math.ceil(bodyWordCount / 200));
  const readTime = `${estimatedReadMinutes} min read`;

  return {
    title,
    slug: frontmatter.slug || '',
    summary,
    tag,
    category: frontmatter.category || '',
    date: frontmatter.date || '',
    readTime,
    imageUrl,
    sliderImageUrl,
    suggestedWordCount: frontmatter.suggestedWordCount || '',
    bodyMarkdown,
    body: markdownToHtml(bodyMarkdown)
  };
}

function formatCurlPayload(payload) {
  const escaped = JSON.stringify(payload, null, 2).replaceAll("'", "'\\''");
  return `curl -X POST http://localhost:8888/api/admin-posts \\\n  -H 'Content-Type: application/json' \\\n  -H 'Cookie: admin_session=<your_admin_cookie>' \\\n  --data '${escaped}'`;
}

function printHelp() {
  console.log(`Map a blog markdown file to the /api/admin-posts payload.

Usage:
  node scripts/map-markdown-post.mjs --file ./post.md [--status draft|published] [--output json|curl]

Options:
  -f, --file             Path to the markdown file (required)
      --status           Post status in payload (default: draft)
      --output           Output format: json or curl (default: json)
      --show-on-homepage Set showOnHomepage=true
      --hide-from-blog   Set hideFromBlog=true
  -h, --help             Show this help message

Mapping notes:
  **SEO-friendly title:** = title
  **Meta description (≤160 chars):** = summary
  **Tags (3-5):** = tag
  Anything after **Suggested word count:** = body
  readTime is estimated from body word count (~200 words/minute)
`);
}

async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.file) {
    throw new Error('Missing --file argument. Example: --file ./my-post.md');
  }

  const fullPath = path.resolve(process.cwd(), options.file);
  const rawMarkdown = await readFile(fullPath, 'utf8');
  const extracted = extractMarkdownDocument(rawMarkdown);

  if (!extracted.title) {
    throw new Error('Unable to infer a title. Add frontmatter `title:` or a first-level markdown heading.');
  }

  const payload = {
    title: extracted.title,
    slug: extracted.slug,
    summary: extracted.summary,
    tag: extracted.tag,
    readTime: extracted.readTime,
    imageUrl: extracted.imageUrl,
    sliderImageUrl: extracted.sliderImageUrl,
    body: extracted.body,
    status: options.status === 'published' ? 'published' : 'draft',
    showOnHomepage: options.showOnHomepage,
    hideFromBlog: options.hideFromBlog
  };

  if (options.output === 'curl') {
    console.log(formatCurlPayload(payload));
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
