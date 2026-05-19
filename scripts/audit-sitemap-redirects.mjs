#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

function parseArgs(argv) {
  const args = {
    sitemap: process.env.SITEMAP_URL || 'https://gematria.today/sitemap.xml',
    timeoutMs: 15000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--sitemap' && argv[i + 1]) {
      args.sitemap = argv[i + 1];
      i += 1;
    } else if (token === '--timeout-ms' && argv[i + 1]) {
      args.timeoutMs = Number(argv[i + 1]);
      i += 1;
    } else if (token === '--help') {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:\n  node scripts/audit-sitemap-redirects.mjs [--sitemap <url-or-file>] [--timeout-ms <number>]\n\nExamples:\n  node scripts/audit-sitemap-redirects.mjs\n  node scripts/audit-sitemap-redirects.mjs --sitemap https://example.com/sitemap.xml\n  node scripts/audit-sitemap-redirects.mjs --sitemap sitemap.xml`);
}

function extractUrlsFromSitemap(xmlText) {
  const matches = [...xmlText.matchAll(/<loc>(.*?)<\/loc>/gsi)];
  return matches
    .map((entry) => entry[1].trim())
    .filter(Boolean);
}

async function readSitemapSource(sitemap) {
  if (/^https?:\/\//i.test(sitemap)) {
    const response = await fetch(sitemap, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap (${response.status}): ${sitemap}`);
    }
    return response.text();
  }

  return readFile(sitemap, 'utf8');
}

async function fetchNoRedirect(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'SitemapRedirectAudit/1.0',
      },
    });

    return {
      url,
      status: response.status,
      location: response.headers.get('location') || '',
    };
  } catch (error) {
    return {
      url,
      error: error.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : error.message,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function summarize(results) {
  const summary = {
    total: results.length,
    ok200: 0,
    redirect3xx: 0,
    other4xx5xx: 0,
    failed: 0,
  };

  for (const result of results) {
    if (result.error) {
      summary.failed += 1;
      continue;
    }

    if (result.status >= 200 && result.status < 300) {
      summary.ok200 += 1;
    } else if (result.status >= 300 && result.status < 400) {
      summary.redirect3xx += 1;
    } else {
      summary.other4xx5xx += 1;
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const xmlText = await readSitemapSource(args.sitemap);
  const urls = extractUrlsFromSitemap(xmlText);
  if (!urls.length) {
    throw new Error(`No <loc> entries found in sitemap: ${args.sitemap}`);
  }

  const results = [];
  for (const url of urls) {
    results.push(await fetchNoRedirect(url, args.timeoutMs));
  }

  const summary = summarize(results);
  console.log(`Checked ${summary.total} URLs from ${args.sitemap}`);
  console.log(`200-range: ${summary.ok200}`);
  console.log(`300-range (redirect): ${summary.redirect3xx}`);
  console.log(`400/500-range: ${summary.other4xx5xx}`);
  console.log(`Failed requests: ${summary.failed}`);

  const problematic = results.filter((result) => result.error || result.status >= 300);
  if (problematic.length) {
    console.log('\nURLs requiring attention:');
    for (const item of problematic) {
      if (item.error) {
        console.log(`- ${item.url} -> ERROR (${item.error})`);
      } else {
        const locationPart = item.location ? ` -> ${item.location}` : '';
        console.log(`- ${item.url} -> ${item.status}${locationPart}`);
      }
    }
  }

  if (summary.redirect3xx || summary.other4xx5xx || summary.failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
