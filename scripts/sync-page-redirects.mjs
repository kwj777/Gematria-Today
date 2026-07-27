#!/usr/bin/env node
// Generates one extensionless-URL redirect per published page.
//
// This replaces a `/:page` -> `/:page.html` wildcard. That rule matched any
// single path segment, including one that already contained a dot, and it was
// only ever terminated by a static file existing at the target. Any path with
// no file behind it therefore redirected to itself + ".html" forever:
//
//   /favicon.ico -> /favicon.ico.html -> /favicon.ico.html.html -> ...
//
// Explicit rules cannot loop, and unmatched paths now fall through to 404.html
// the way they should.
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv.includes('--check') ? 'check' : 'write';
const rootDir = process.cwd();
const siteDir = join(rootDir, '_site');
const tomlPath = join(rootDir, 'netlify.toml');

const BEGIN = '# BEGIN generated page redirects -- run `npm run sync:redirects`';
const END = '# END generated page redirects';

if (!existsSync(siteDir)) {
  console.error('_site/ not found. Run `npm run build` first.');
  process.exit(1);
}

// Every page the build actually publishes, including passthrough admin pages.
const pages = readdirSync(siteDir)
  .filter((name) => name.endsWith('.html'))
  .map((name) => name.slice(0, -'.html'.length))
  .sort();

const block = [
  BEGIN,
  '# Extensionless URLs for every published page. Generated -- do not hand-edit.',
  ...pages.flatMap((page) => [
    '',
    '[[redirects]]',
    `  from = "/${page}"`,
    `  to = "/${page}.html"`,
    '  status = 301',
  ]),
  '',
  END,
].join('\n');

const toml = await readFile(tomlPath, 'utf8');
const beginIndex = toml.indexOf(BEGIN);
const endIndex = toml.indexOf(END);

if (beginIndex === -1 || endIndex === -1) {
  console.error(`Could not find the generated block markers in netlify.toml.\nExpected:\n  ${BEGIN}\n  ${END}`);
  process.exit(1);
}

const updated = `${toml.slice(0, beginIndex)}${block}${toml.slice(endIndex + END.length)}`;

if (updated === toml) {
  console.log(`Page redirects are up to date (${pages.length} rules).`);
  process.exit(0);
}

if (mode === 'check') {
  console.error('netlify.toml page redirects are stale.');
  console.error('Run `npm run sync:redirects` to regenerate.');
  process.exit(1);
}

await writeFile(tomlPath, updated);
console.log(`Wrote ${pages.length} page redirect rule(s) to netlify.toml.`);
