#!/usr/bin/env node
const args = process.argv.slice(2);

const getFlagValue = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
};

const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`Usage: npm run screenshot -- --url <page_url> [--output <path>] [--full-page]\n\nExamples:\n  npm run screenshot -- --url http://127.0.0.1:8888 --output artifacts/home.png\n  npm run screenshot -- --url https://example.com --full-page`);
  process.exit(0);
}

const url = getFlagValue('--url');
const output = getFlagValue('--output', 'artifacts/screenshot.png');
const fullPage = hasFlag('--full-page');

if (!url) {
  console.error('Missing required --url argument. Run with --help for usage.');
  process.exit(1);
}

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.screenshot({ path: output, fullPage });
  console.log(`Screenshot saved to ${output}`);
} finally {
  await browser.close();
}
