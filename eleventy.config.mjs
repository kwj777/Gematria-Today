// Eleventy builds the public pages from src/ into _site/. Netlify's publish
// directory points at _site (see netlify.toml).
//
// Scope note: this migration deliberately preserves what the site serves today.
// publish = "." previously published the whole repository, so everything that is
// not the build input or a local tool directory is passed through unchanged --
// including sql/, scripts/, tests/ and netlify/. Narrowing that is a separate,
// intentional change: remove entries from PASSTHROUGH_EXCLUDE below.
import { readdirSync } from 'node:fs';
import { loadPartials, renderNav, renderFooter } from './scripts/lib/page-chrome.mjs';

// Not content: the build input, the build output, VCS and tooling directories.
const PASSTHROUGH_EXCLUDE = new Set([
  '.git',
  '.claude',
  'node_modules',
  '_site',
  'src',
  'artifacts',
]);

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

  // Everything the old publish = "." served, minus the build input/output.
  for (const entry of readdirSync(process.cwd(), { withFileTypes: true })) {
    if (PASSTHROUGH_EXCLUDE.has(entry.name)) continue;
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
