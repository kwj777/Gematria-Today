import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const mode = process.argv.includes('--check') ? 'check' : 'write';
const rootDir = process.cwd();
const markdownPath = path.join(rootDir, 'public', 'architect-site-adaptation-guide.md');
const htmlPath = path.join(rootDir, 'public', 'architect-site-adaptation-guide.html');

function normalize(content) {
  return content.replace(/\r\n/g, '\n');
}

function escapeForScriptTag(content) {
  return content.replace(/<\/script>/gi, '<\\/script>');
}

function buildHtml(markdown) {
  const escapedMarkdown = escapeForScriptTag(markdown);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Architect Site Adaptation Guide</title>
    <meta name="description" content="Guide for adapting this codebase into an architecture portfolio and business website." />
    <link rel="stylesheet" href="/theme.css" />
    <style>
      main.guide-container {
        max-width: 920px;
        margin: 3rem auto;
        padding: 0 1rem 4rem;
      }
      .guide-content {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
        padding: 2rem;
      }
      .guide-content h1,
      .guide-content h2,
      .guide-content h3,
      .guide-content h4 {
        margin-top: 1.5rem;
      }
      .guide-content hr {
        margin: 2rem 0;
      }
      .guide-content code {
        background: #f4f5f7;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
      }
      .guide-content pre {
        background: #101826;
        color: #f8fafc;
        padding: 1rem;
        border-radius: 8px;
        overflow: auto;
      }
      .guide-content blockquote {
        border-left: 4px solid #d0d7de;
        margin-left: 0;
        padding-left: 1rem;
        color: #57606a;
      }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js" defer></script>
  </head>
  <body>
    <main class="guide-container">
      <article class="guide-content" id="guideContent" aria-live="polite"></article>
      <script type="text/plain" id="markdownSource">${escapedMarkdown}</script>
    </main>
    <script>
      window.addEventListener('DOMContentLoaded', () => {
        const markdownSource = document.getElementById('markdownSource');
        const guideContent = document.getElementById('guideContent');
        const markdown = markdownSource ? markdownSource.textContent : '';

        if (!window.marked) {
          guideContent.textContent = markdown;
          return;
        }

        marked.setOptions({
          gfm: true,
          breaks: false,
          headerIds: true,
          mangle: false,
        });
        guideContent.innerHTML = marked.parse(markdown);
      });
    </script>
  </body>
</html>
`;
}

const markdownSource = readFileSync(markdownPath, 'utf8');
const expectedHtml = buildHtml(markdownSource);

let currentHtml = '';
try {
  currentHtml = readFileSync(htmlPath, 'utf8');
} catch {
  currentHtml = '';
}

if (normalize(currentHtml) === normalize(expectedHtml)) {
  console.log('Architect adaptation guide HTML is already in sync.');
  process.exit(0);
}

if (mode === 'check') {
  console.error('public/architect-site-adaptation-guide.html is out of sync with public/architect-site-adaptation-guide.md.');
  console.error('Run: npm run sync:architect-guide');
  process.exit(1);
}

writeFileSync(htmlPath, expectedHtml, 'utf8');
console.log('Synced public/architect-site-adaptation-guide.html from markdown source.');
