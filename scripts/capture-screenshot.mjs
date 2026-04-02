#!/usr/bin/env node
const args = process.argv.slice(2);

const getFlagValue = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
};

const hasFlag = (flag) => args.includes(flag);
const getFlagValues = (flag) => {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag) {
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        values.push(value);
      }
    }
  }
  return values;
};

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`Usage: npm run screenshot -- --url <page_url> [--output <path>] [--full-page] [--hide-selector <css_selector>] [--blur-selector <css_selector>]

Examples:
  npm run screenshot -- --url http://127.0.0.1:8888 --output artifacts/home.png
  npm run screenshot -- --url https://example.com --full-page --hide-selector ".admin-panel"
  npm run screenshot -- --url https://example.com --blur-selector ".private" --blur-selector ".sensitive"`);
  process.exit(0);
}

const url = getFlagValue('--url');
const output = getFlagValue('--output', 'artifacts/screenshot.png');
const fullPage = hasFlag('--full-page');
const hideSelectors = getFlagValues('--hide-selector');
const blurSelectors = getFlagValues('--blur-selector');

if (!url) {
  console.error('Missing required --url argument. Run with --help for usage.');
  process.exit(1);
}

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  if (hideSelectors.length > 0 || blurSelectors.length > 0) {
    await page.evaluate(
      ({ hide, blur }) => {
        hide.forEach((selector) => {
          document.querySelectorAll(selector).forEach((element) => {
            element.style.visibility = 'hidden';
          });
        });

        blur.forEach((selector) => {
          document.querySelectorAll(selector).forEach((element) => {
            element.style.filter = 'blur(12px)';
          });
        });
      },
      { hide: hideSelectors, blur: blurSelectors },
    );
  }
  await page.screenshot({ path: output, fullPage });
  console.log(`Screenshot saved to ${output}`);
} finally {
  await browser.close();
}
