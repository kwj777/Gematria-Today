#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const mode = process.argv.includes('--check') ? 'check' : 'write';
const rootDir = process.cwd();
const sitemapPath = join(rootDir, 'sitemap.xml');
const SITE_ORIGIN = 'https://gematria.today';

function urlToFile(loc) {
  if (!loc.startsWith(SITE_ORIGIN)) {
    throw new Error(`Sitemap entry is outside ${SITE_ORIGIN}: ${loc}`);
  }
  let path = loc.slice(SITE_ORIGIN.length);
  if (path === '' || path === '/') return 'index.html';
  if (path.startsWith('/')) path = path.slice(1);
  return path;
}

function lastCommitDate(file) {
  const output = execFileSync('git', ['log', '-1', '--format=%cs', 'HEAD', '--', file], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  if (!output) {
    throw new Error(`No git history for ${file}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(output)) {
    throw new Error(`Unexpected git date format for ${file}: ${output}`);
  }
  return output;
}

const sitemap = await readFile(sitemapPath, 'utf8');

const URL_BLOCK_RE = /<url>([\s\S]*?)<\/url>/g;
const LOC_RE = /<loc>(.*?)<\/loc>/;
const LASTMOD_RE = /<lastmod>(.*?)<\/lastmod>/;

const drifted = [];
const missing = [];

const updated = sitemap.replace(URL_BLOCK_RE, (block, inner) => {
  const locMatch = inner.match(LOC_RE);
  if (!locMatch) return block;
  const loc = locMatch[1].trim();
  const file = urlToFile(loc);

  try {
    statSync(join(rootDir, file));
  } catch {
    missing.push({ loc, file, reason: 'not found on disk' });
    return block;
  }

  let desired;
  try {
    desired = lastCommitDate(file);
  } catch (error) {
    missing.push({ loc, file, reason: error.message });
    return block;
  }

  const existing = inner.match(LASTMOD_RE);
  if (existing && existing[1].trim() === desired) {
    return block;
  }

  drifted.push({ loc, file, from: existing ? existing[1].trim() : '(missing)', to: desired });

  const newInner = existing
    ? inner.replace(LASTMOD_RE, `<lastmod>${desired}</lastmod>`)
    : inner.replace(LOC_RE, (locTag) => `${locTag}\n    <lastmod>${desired}</lastmod>`);
  return `<url>${newInner}</url>`;
});

if (missing.length > 0) {
  console.error('Sitemap entries reference files that cannot be dated:');
  for (const entry of missing) {
    console.error(` - ${entry.loc} -> ${entry.file} (${entry.reason})`);
  }
  process.exit(1);
}

if (mode === 'check') {
  if (drifted.length > 0) {
    console.error('sitemap.xml <lastmod> values are stale:');
    for (const entry of drifted) {
      console.error(` - ${entry.loc}: ${entry.from} -> ${entry.to}`);
    }
    console.error('\nRun `npm run sync:sitemap` to update.');
    process.exit(1);
  }
  console.log('sitemap.xml <lastmod> values are up to date.');
} else if (drifted.length === 0) {
  console.log('sitemap.xml <lastmod> values already up to date.');
} else {
  await writeFile(sitemapPath, updated);
  console.log(`Updated <lastmod> for ${drifted.length} entr${drifted.length === 1 ? 'y' : 'ies'} in sitemap.xml.`);
  for (const entry of drifted) {
    console.log(` - ${entry.loc}: ${entry.from} -> ${entry.to}`);
  }
}
