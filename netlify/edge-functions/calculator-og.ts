import type { Config, Context } from '@netlify/edge-functions';
import { digitalRoot, englishGematria, replaceMetaContent, replaceTitle } from './lib/og-meta.mjs';

const SITE_ORIGIN = 'https://gematria.today';
const OGP_IMAGE_WIDTH = 1200;
const OGP_IMAGE_FORMAT = 'jpg';


function toShareImageUrl(value: string): string {
  const absoluteUrl = String(value || '').trim();
  if (!absoluteUrl || /^data:image\//i.test(absoluteUrl)) {
    return '';
  }
  const encoded = encodeURIComponent(absoluteUrl);
  return `${SITE_ORIGIN}/.netlify/images?url=${encoded}&w=${OGP_IMAGE_WIDTH}&fm=${OGP_IMAGE_FORMAT}`;
}

export default async (req: Request, context: Context) => {
  const requestUrl = new URL(req.url);
  const query = String(requestUrl.searchParams.get('query') || '').trim();
  const definitionPreview = String(requestUrl.searchParams.get('definitionPreview') || '').trim();

  const response = await context.next();
  let html = await response.text();

  if (!query) {
    return new Response(html, { headers: response.headers });
  }

  // Share links also carry total, digitalRoot, isBaseRoot and perLetterValues.
  // They are ignored: the numbers are recomputed from the query, so a
  // hand-edited link cannot unfurl as a site-branded result for any value.
  const total = englishGematria(query);
  // Same letter rule as the total (NFKC, then ASCII A-Z), so full-width
  // letters count and an accent-only query does not unfurl as "(0)".
  const hasLetters = total > 0;
  const title = hasLetters
    ? `Gematria lookup for "${query}" (${total}) | Gematria.Today`
    : `Gematria lookup for "${query}" | Gematria.Today`;
  const description = hasLetters
    ? `Lookup result: ${query} has base-6 English gematria ${total} (digital root ${digitalRoot(total)}).`
    : `Lookup result for ${query} on the Gematria.Today calculator.`;
  const shareUrl = `${SITE_ORIGIN}/calculator.html${requestUrl.search}`;
  const imageUrl = new URL('/.netlify/functions/calculator-share-image', SITE_ORIGIN);
  imageUrl.searchParams.set('type', 'word');
  imageUrl.searchParams.set('query', query);
  if (definitionPreview) {
    imageUrl.searchParams.set('definitionPreview', definitionPreview);
  }

  html = replaceTitle(html, title);
  html = replaceMetaContent(html, 'meta[name="description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:title"]', title);
  html = replaceMetaContent(html, 'meta[property="og:description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:url"]', shareUrl);
  const shareImageUrl = toShareImageUrl(imageUrl.toString()) || imageUrl.toString();

  html = replaceMetaContent(html, 'meta[property="og:image"]', shareImageUrl);
  html = replaceMetaContent(html, 'meta[name="twitter:title"]', title);
  html = replaceMetaContent(html, 'meta[name="twitter:description"]', description);
  html = replaceMetaContent(html, 'meta[name="twitter:image"]', shareImageUrl);

  return new Response(html, { headers: response.headers });
};

export const config: Config = {
  path: '/calculator.html',
  onError: 'bypass',
};
