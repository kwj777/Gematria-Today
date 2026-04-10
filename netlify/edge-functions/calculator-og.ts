import type { Config, Context } from '@netlify/edge-functions';

const SITE_ORIGIN = 'https://endtimes.today';
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

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function replaceMetaContent(html: string, selector: string, newValue: string): string {
  const attrMatch = selector.match(/meta\[(property|name)="([^"]+)"\]/);
  if (!attrMatch) {
    return html;
  }
  const [, attrName, attrValue] = attrMatch;
  const pattern = new RegExp(`(<meta\\s[^>]*${attrName}="${attrValue}"[^>]*\\scontent=")([^"]*)(")`);
  return html.replace(pattern, `$1${escapeAttr(newValue)}$3`);
}

export default async (req: Request, context: Context) => {
  const requestUrl = new URL(req.url);
  const query = String(requestUrl.searchParams.get('query') || '').trim();
  const total = String(requestUrl.searchParams.get('total') || '').trim();
  const digitalRoot = String(requestUrl.searchParams.get('digitalRoot') || '').trim();
  const isBaseRoot = String(requestUrl.searchParams.get('isBaseRoot') || '').trim();
  const definitionPreview = String(requestUrl.searchParams.get('definitionPreview') || '').trim();
  const perLetterValues = String(requestUrl.searchParams.get('perLetterValues') || '').trim();

  const response = await context.next();
  let html = await response.text();

  if (!query) {
    return new Response(html, { headers: response.headers });
  }

  const title = total
    ? `Gematria lookup for "${query}" (${total}) | EndTimes.Today`
    : `Gematria lookup for "${query}" | EndTimes.Today`;
  const description = total
    ? `Lookup result: ${query} has base-6 English gematria ${total}${digitalRoot ? ` (digital root ${digitalRoot})` : ''}.`
    : `Lookup result for ${query} on the EndTimes.Today calculator.`;
  const shareUrl = `${SITE_ORIGIN}/calculator.html${requestUrl.search}`;
  const imageUrl = new URL('/.netlify/functions/calculator-share-image', SITE_ORIGIN);
  imageUrl.searchParams.set('type', 'word');
  imageUrl.searchParams.set('query', query);
  if (total) {
    imageUrl.searchParams.set('total', total);
  }
  if (digitalRoot) {
    imageUrl.searchParams.set('digitalRoot', digitalRoot);
  }
  if (isBaseRoot) {
    imageUrl.searchParams.set('isBaseRoot', isBaseRoot);
  }
  if (definitionPreview) {
    imageUrl.searchParams.set('definitionPreview', definitionPreview);
  }
  if (perLetterValues) {
    imageUrl.searchParams.set('perLetterValues', perLetterValues);
  }

  html = html.replace(/(<title[^>]*>)[^<]*(<\/title>)/, `$1${escapeAttr(title)}$2`);
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
