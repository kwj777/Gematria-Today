import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { OG_IMAGE_HEIGHT, OG_IMAGE_SOURCES, OG_IMAGE_WIDTH, fitSvgToCard, toOgImagePath } from '../scripts/build-og-images.mjs';

const SITE_ORIGIN = 'https://gematria.today';
const PAGES = [
  ...readdirSync('src').filter((entry) => entry.endsWith('.html')).map((entry) => `src/${entry}`),
  'admin.html',
];
const IMAGE_TAG = /<meta (?:property="og:image(?::secure_url)?"|name="twitter:image") content="([^"]*)"/g;

function pngSize(file) {
  const bytes = readFileSync(file);
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${file} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('no static page offers an SVG share image', () => {
  // Facebook, X, LinkedIn, Slack and iMessage do not render image/svg+xml in a
  // card, so an SVG og:image unfurls with no picture at all.
  for (const page of PAGES) {
    const html = readFileSync(page, 'utf8');
    const images = [...html.matchAll(IMAGE_TAG)].map((match) => match[1]);
    for (const image of images) {
      assert.doesNotMatch(image, /\.svg(?:$|[?#])/i, `${page}: ${image}`);
    }
    assert.doesNotMatch(html, /og:image:type" content="image\/svg\+xml"/, page);
  }
});

test('every static share image is a committed 1200x630 PNG', () => {
  let checked = 0;
  for (const page of PAGES) {
    const html = readFileSync(page, 'utf8');
    for (const [, image] of html.matchAll(IMAGE_TAG)) {
      assert.ok(image.startsWith(`${SITE_ORIGIN}/assets/og/`), `${page}: ${image}`);
      const file = image.slice(SITE_ORIGIN.length + 1);
      assert.ok(existsSync(file), `${page}: ${file} is missing (run node scripts/build-og-images.mjs)`);
      assert.deepEqual(pngSize(file), { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }, file);
      checked += 1;
    }
  }
  assert.ok(checked >= 60, `only ${checked} share images checked`);
});

test('declared og:image dimensions match the PNG', () => {
  for (const page of PAGES) {
    const html = readFileSync(page, 'utf8');
    const width = html.match(/og:image:width" content="(\d+)"/);
    const height = html.match(/og:image:height" content="(\d+)"/);
    if (!width && !height) continue;
    assert.equal(Number(width?.[1]), OG_IMAGE_WIDTH, page);
    assert.equal(Number(height?.[1]), OG_IMAGE_HEIGHT, page);
  }
});

test('every generated card has a source SVG and a committed PNG', () => {
  for (const { source } of OG_IMAGE_SOURCES) {
    assert.ok(existsSync(source), source);
    const target = toOgImagePath(source);
    assert.ok(existsSync(target), `${target} is missing (run node scripts/build-og-images.mjs)`);
    assert.deepEqual(pngSize(target), { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }, target);
  }
});

test('fitSvgToCard nests the artwork in a 1200x630 card without editing it', () => {
  const art = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900"/></svg>';
  const cover = fitSvgToCard(art, { fit: 'cover' });
  assert.ok(cover.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'));
  assert.ok(cover.includes('viewBox="0 0 1600 900" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice"'));
  assert.ok(cover.includes('<rect width="1600" height="900"/>'));
  const contain = fitSvgToCard(art, { fit: 'contain', background: ['#000000', '#ffffff'] });
  assert.ok(contain.includes('preserveAspectRatio="xMidYMid meet"'));
  assert.ok(contain.includes('fill="url(#og-card-backdrop)"'));
});
