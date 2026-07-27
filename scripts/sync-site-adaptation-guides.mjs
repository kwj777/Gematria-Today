import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const mode = process.argv.includes('--check') ? 'check' : 'write';
const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'secure', 'site-adaptation-guides');
const guidePattern = /-site-adaptation-guide\.md$/;

function normalize(content) {
  return content.replace(/\r\n/g, '\n');
}

function escapeForScriptTag(content) {
  return content.replace(/<\/script>/gi, '<\\/script>');
}

function toTitle(fileName) {
  const baseName = fileName.replace(/-site-adaptation-guide\.md$/, '');
  const words = baseName
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const label = words.length ? `${words.join(' ')} Site Adaptation Guide` : 'Site Adaptation Guide';
  return label;
}

function buildHtml(markdown, titleText) {
  const escapedMarkdown = escapeForScriptTag(markdown);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${titleText}</title>
    <meta name="description" content="Guide for adapting this codebase into a niche website implementation." />
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
    <script src="/assets/vendor/marked/marked.umd.js" defer></script>
  </head>
  <body>
    <main class="guide-container">
      <article class="guide-content" id="guideContent" aria-live="polite"></article>
      <script type="text/plain" id="markdownSource">${escapedMarkdown}</script>
    </main>
    <script src="/site-adaptation-guide-renderer.js" defer></script>
  </body>
</html>
`;
}

const guideFiles = readdirSync(rootDir)
  .filter((name) => guidePattern.test(name))
  .sort();

if (guideFiles.length === 0) {
  console.log('No site adaptation markdown guides found.');
  process.exit(0);
}

const drifted = [];
for (const mdFileName of guideFiles) {
  const markdownPath = path.join(rootDir, mdFileName);
  const htmlFileName = mdFileName.replace(/\.md$/, '.html');
  const htmlPath = path.join(outputDir, htmlFileName);

  const markdownSource = readFileSync(markdownPath, 'utf8');
  const expectedHtml = buildHtml(markdownSource, toTitle(mdFileName));

  let currentHtml = '';
  try {
    currentHtml = readFileSync(htmlPath, 'utf8');
  } catch {
    currentHtml = '';
  }

  if (normalize(currentHtml) !== normalize(expectedHtml)) {
    drifted.push({ mdFileName, htmlFileName, expectedHtml, htmlPath });
  }
}

if (drifted.length === 0) {
  console.log(`Site adaptation guide HTML is in sync (${guideFiles.length} file(s)).`);
  process.exit(0);
}

if (mode === 'check') {
  console.error('The following site adaptation guide HTML files are out of sync:');
  for (const item of drifted) {
    console.error(` - ${item.htmlFileName} (source: ${item.mdFileName})`);
  }
  console.error('Run: npm run sync:site-adaptation-guides');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

for (const item of drifted) {
  writeFileSync(item.htmlPath, item.expectedHtml, 'utf8');
  console.log(`Synced ${item.htmlFileName} from ${item.mdFileName}`);
}

console.log(`Synced ${drifted.length} site adaptation guide file(s).`);
