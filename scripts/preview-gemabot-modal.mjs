#!/usr/bin/env node
/**
 * Captures preview screenshots of the GemaBot "sample answer" modal that
 * non-Premium visitors see on /tools.html. Outputs light and dark theme
 * variants to artifacts/gemabot-sample-modal-{light,dark}.png.
 *
 * Usage: npm run preview:gemabot-modal
 */
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.PREVIEW_PORT || 8765);
const OUT_DIR = resolve(ROOT, 'artifacts');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let filePath = decodeURIComponent(url.pathname);
    if (filePath === '/' || filePath === '') filePath = '/index.html';
    const abs = normalize(join(ROOT, filePath));
    if (!abs.startsWith(ROOT + sep) && abs !== ROOT) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(abs).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(abs);
    res.writeHead(200, { 'Content-Type': MIME[extname(abs)] || 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const { chromium } = await import('playwright');

mkdirSync(OUT_DIR, { recursive: true });

const VARIANTS = [
  { theme: 'light', out: join(OUT_DIR, 'gemabot-sample-modal-light.png') },
  { theme: 'dark', out: join(OUT_DIR, 'gemabot-sample-modal-dark.png') },
];

let exitCode = 0;
try {
  for (const variant of VARIANTS) {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

      await page.addInitScript((theme) => {
        const apply = () => {
          const html = document.documentElement;
          html.classList.remove('auth-premium', 'auth-lifetime', 'auth-free');
          html.classList.add('auth-anon');
          html.setAttribute('data-bs-theme', theme);
        };
        apply();
        document.addEventListener('DOMContentLoaded', apply);
      }, variant.theme);

      // Stub /api/ calls (auth, theme css) so the page renders without the backend.
      await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));

      await page.goto(`http://127.0.0.1:${PORT}/tools.html`, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      // Re-apply auth/theme classes in case site bootstrap removed them.
      await page.evaluate((theme) => {
        const html = document.documentElement;
        html.classList.remove('auth-premium', 'auth-lifetime', 'auth-free');
        html.classList.add('auth-anon');
        html.setAttribute('data-bs-theme', theme);
      }, variant.theme);

      const bootstrapLoaded = await page
        .waitForFunction(() => !!window.bootstrap?.Modal, { timeout: 5_000 })
        .then(() => true)
        .catch(() => false);

      if (bootstrapLoaded) {
        await page.locator('.gemabot-sample-link').first().click();
      } else {
        console.warn(`[${variant.theme}] Bootstrap JS unavailable (CDN unreachable?); showing modal manually.`);
        await page.evaluate(() => {
          const el = document.getElementById('gemabotSampleModal');
          el.classList.add('show');
          el.style.display = 'block';
          el.removeAttribute('aria-hidden');
          el.setAttribute('aria-modal', 'true');
          document.body.classList.add('modal-open');
          const backdrop = document.createElement('div');
          backdrop.className = 'modal-backdrop fade show';
          document.body.appendChild(backdrop);
        });
      }

      await page.waitForSelector('#gemabotSampleModal.show', { timeout: 5_000 });
      await page.waitForTimeout(500); // animation settle

      const dialog = page.locator('#gemabotSampleModal .modal-dialog');
      await dialog.screenshot({ path: variant.out });
      console.log(`Saved ${variant.out}`);
    } finally {
      await browser.close();
    }
  }
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  server.close();
}

process.exit(exitCode);
