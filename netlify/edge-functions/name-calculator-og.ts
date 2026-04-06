import type { Config, Context } from '@netlify/edge-functions';

const SITE_ORIGIN = 'https://endtimes.today';

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
  const names = ['name1', 'name2', 'name3']
    .map((key) => String(requestUrl.searchParams.get(key) || '').trim())
    .filter(Boolean);
  const totals = String(requestUrl.searchParams.get('totals') || '').trim();

  const response = await context.next();
  let html = await response.text();

  if (!names.length) {
    return new Response(html, { headers: response.headers });
  }

  const title = `Name calculator: ${names.join(', ')} | EndTimes.Today`;
  const description = totals
    ? `Compare gematria totals (${totals}) for ${names.join(', ')}.`
    : `Compare gematria results for ${names.join(', ')} on EndTimes.Today.`;
  const shareUrl = `${SITE_ORIGIN}/nameCalculator.html${requestUrl.search}`;
  const imageUrl = new URL('/.netlify/functions/calculator-share-image', SITE_ORIGIN);
  imageUrl.searchParams.set('type', 'name');
  names.forEach((name, index) => imageUrl.searchParams.set(`name${index + 1}`, name));
  if (totals) {
    imageUrl.searchParams.set('totals', totals);
  }

  html = html.replace(/(<title[^>]*>)[^<]*(<\/title>)/, `$1${escapeAttr(title)}$2`);
  html = replaceMetaContent(html, 'meta[name="description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:title"]', title);
  html = replaceMetaContent(html, 'meta[property="og:description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:url"]', shareUrl);
  html = replaceMetaContent(html, 'meta[property="og:image"]', imageUrl.toString());
  html = replaceMetaContent(html, 'meta[name="twitter:title"]', title);
  html = replaceMetaContent(html, 'meta[name="twitter:description"]', description);
  html = replaceMetaContent(html, 'meta[name="twitter:image"]', imageUrl.toString());

  return new Response(html, { headers: response.headers });
};

export const config: Config = {
  path: '/nameCalculator.html',
  onError: 'bypass',
};
