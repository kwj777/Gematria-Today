// Eleventy builds the public pages from src/ into _site/. Netlify's publish
// directory points at _site (see netlify.toml).
//
// Only site content is published. publish = "." used to serve the entire
// repository -- database schemas, tests, build scripts and serverless function
// source included. Everything below is excluded deliberately; if you add a
// directory the browser genuinely needs, allow it explicitly rather than
// loosening the list.
import { readdirSync } from 'node:fs';
import { loadPartials, renderNav, renderFooter } from './scripts/lib/page-chrome.mjs';

const PASSTHROUGH_EXCLUDE = new Set([
  // Build input, build output, VCS and local tooling.
  '.git',
  '.github',
  '.claude',
  '.gitignore',
  'node_modules',
  '_site',
  'src',
  'artifacts',

  // Server-side and repo tooling. Netlify reads functions from the repository
  // (build.functions), not from the publish directory, so excluding these does
  // not affect deploys.
  'netlify',
  'scripts',
  'sql',
  'tests',
  'docs',
  'package.json',
  'package-lock.json',
  'netlify.toml',
  'eleventy.config.mjs',
  'LICENSE',
  '.nvmrc',

  // Gated content. The guides are readable only through
  // super-admin-static-page, which bundles them via included_files. Publishing
  // them here would let a direct request bypass that check.
  'secure',
]);

// Root markdown is internal documentation and is not published -- except where
// a page actually links to it. accessibility.html links to the audit report.
const PUBLISHED_MARKDOWN = new Set(['accessibility-audit.md']);

// .env, .env.local, .env.production: `netlify env:pull` writes the real
// database URL and API keys into these. They are gitignored, so a Netlify
// build never sees one -- but a local build would copy it into _site/, and
// `netlify deploy --dir=_site` would then serve it at /.env.
const isLocalEnvFile = (name) => name === '.env' || name.startsWith('.env.');

const partials = await loadPartials(process.cwd());

export default function (eleventyConfig) {
  // Pages are authored as .html and rendered with Nunjucks so the shortcodes
  // below work without renaming every file.
  eleventyConfig.setTemplateFormats(['html']);

  // The page's own filename drives which nav link is active and which footer
  // tagline it gets -- same mapping the old sync script used.
  const pageFileName = (page) => `${page.filePathStem.replace(/^\//, '')}.html`;

  eleventyConfig.addShortcode('nav', function nav() {
    return renderNav(partials.nav, pageFileName(this.page));
  });

  eleventyConfig.addShortcode('footer', function footer() {
    return renderFooter(partials.footer, pageFileName(this.page));
  });

  // Site content only -- see PASSTHROUGH_EXCLUDE above.
  for (const entry of readdirSync(process.cwd(), { withFileTypes: true })) {
    if (PASSTHROUGH_EXCLUDE.has(entry.name)) continue;
    if (isLocalEnvFile(entry.name)) continue;
    if (entry.isFile() && entry.name.endsWith('.md') && !PUBLISHED_MARKDOWN.has(entry.name)) continue;
    eleventyConfig.addPassthroughCopy(entry.name);
  }

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
    },
    htmlTemplateEngine: 'njk',
  };
}
