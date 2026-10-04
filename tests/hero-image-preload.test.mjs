import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A page preloads an image at high priority only because that image is above
// the fold. blog.html and faq.html did so while marking the same <img>
// loading="lazy", and faq.html's hero is display:none below Bootstrap's lg
// breakpoint, so phones fetched an image they never show.
const SRC = new URL('../src/', import.meta.url).pathname;
const PAGES = readdirSync(SRC).filter((name) => name.endsWith('.html'));

function imagePreloads(html) {
  return Array.from(html.matchAll(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/g), (match) => ({
    tag: match[0],
    href: match[0].match(/\bhref="([^"]+)"/)?.[1] || '',
    media: match[0].match(/\bmedia="([^"]+)"/)?.[1] || '',
  }));
}

function imgTagsFor(html, src) {
  return Array.from(html.matchAll(/<img\b[\s\S]*?\/?>/g), (match) => match[0])
    .filter((tag) => tag.includes(`src="${src}"`));
}

test('a preloaded image is never also lazy-loaded', () => {
  let checked = 0;
  for (const page of PAGES) {
    const html = readFileSync(join(SRC, page), 'utf8');
    for (const preload of imagePreloads(html)) {
      for (const img of imgTagsFor(html, preload.href)) {
        checked += 1;
        assert.doesNotMatch(img, /loading="lazy"/, `src/${page} preloads ${preload.href} but lazy-loads its <img>`);
      }
    }
  }
  assert.ok(checked >= 2, 'expected the blog and FAQ hero preloads to be checked');
});

test('the FAQ hero preload is limited to the widths that display the hero', () => {
  const html = readFileSync(join(SRC, 'faq.html'), 'utf8');
  const [preload] = imagePreloads(html).filter((entry) => entry.href === '/assets/faq-hero-guidance.svg');
  assert.ok(preload, 'faq.html no longer preloads its hero');
  // The hero column is `d-none d-lg-block`: hidden below 992px.
  assert.match(html, /<div class="col-lg-5 d-none d-lg-block">\s*<figure[^>]*>\s*<img\s+class="hero-selling-points-image faq-hero-image"/);
  assert.equal(preload.media, '(min-width: 992px)');
});
