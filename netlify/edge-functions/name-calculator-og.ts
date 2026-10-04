import type { Config, Context } from '@netlify/edge-functions';
import { englishGematria, replaceMetaContent, replaceTitle } from './lib/og-meta.mjs';

const SITE_ORIGIN = 'https://gematria.today';
const OGP_IMAGE_WIDTH = 1200;
const OGP_IMAGE_FORMAT = 'jpg';

// calculator-share-image returns SVG, which no social platform renders in a
// share card, so the card points at Netlify's image CDN rasterising it.
function toShareImageUrl(value: string): string {
  const encoded = encodeURIComponent(value);
  return `${SITE_ORIGIN}/.netlify/images?url=${encoded}&w=${OGP_IMAGE_WIDTH}&fm=${OGP_IMAGE_FORMAT}`;
}

export default async (req: Request, context: Context) => {
  const requestUrl = new URL(req.url);
  const names = ['name1', 'name2', 'name3']
    .map((key) => String(requestUrl.searchParams.get(key) || '').trim())
    .filter(Boolean);

  const response = await context.next();
  let html = await response.text();

  if (!names.length) {
    return new Response(html, { headers: response.headers });
  }

  // Share links also carry totals=, but it is ignored: each name's total is
  // recomputed so a hand-edited link cannot print any number it likes.
  const totals = names.map((name) => englishGematria(name)).join(', ');
  const title = `Name calculator: ${names.join(', ')} | Gematria.Today`;
  const description = `Compare gematria totals (${totals}) for ${names.join(', ')}.`;
  const shareUrl = `${SITE_ORIGIN}/name-calculator.html${requestUrl.search}`;
  const imageUrl = new URL('/.netlify/functions/calculator-share-image', SITE_ORIGIN);
  imageUrl.searchParams.set('type', 'name');
  names.forEach((name, index) => imageUrl.searchParams.set(`name${index + 1}`, name));
  const shareImageUrl = toShareImageUrl(imageUrl.toString());

  html = replaceTitle(html, title);
  html = replaceMetaContent(html, 'meta[name="description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:title"]', title);
  html = replaceMetaContent(html, 'meta[property="og:description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:url"]', shareUrl);
  html = replaceMetaContent(html, 'meta[property="og:image"]', shareImageUrl);
  html = replaceMetaContent(html, 'meta[name="twitter:title"]', title);
  html = replaceMetaContent(html, 'meta[name="twitter:description"]', description);
  html = replaceMetaContent(html, 'meta[name="twitter:image"]', shareImageUrl);

  return new Response(html, { headers: response.headers });
};

export const config: Config = {
  path: '/name-calculator.html',
  onError: 'bypass',
};
