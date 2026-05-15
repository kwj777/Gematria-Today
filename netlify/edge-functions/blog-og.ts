import type { Config, Context } from '@netlify/edge-functions';

const SITE_ORIGIN = 'https://gematria.today';
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/beast-identity-rev13-hero-16x9.svg`;
const OGP_IMAGE_WIDTH = 1200;
const OGP_IMAGE_FORMAT = 'jpg';
const DEFAULT_TITLE = 'Gematria.Today Blog';
const DEFAULT_DESCRIPTION =
  'Explore gematria research workflows, trusted methodology notes, and interconnected tools from Gematria.Today.';
const HERO_IMAGE_OVERRIDES: Record<string, string> = Object.freeze({
  'amillennialism-what-it-is-and-isn-t': '/assets/amillennialism-post-01-graphic.svg',
});


interface Post {
  slug: string;
  title: string;
  summary: string;
  heroImageUrl?: string;
  imageUrl?: string;
  sliderImageUrl?: string;
}

function toAbsoluteImageUrl(value?: string | null): string {
  const url = String(value ?? '').trim();
  if (!url || /^data:image\//i.test(url)) {
    return '';
  }
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `${SITE_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
}

function toShareImageUrl(value?: string | null): string {
  const absoluteUrl = toAbsoluteImageUrl(value);
  if (!absoluteUrl) {
    return '';
  }
  if (/\.svg(?:$|[?#])/i.test(absoluteUrl)) {
    const encoded = encodeURIComponent(absoluteUrl);
    return `${SITE_ORIGIN}/.netlify/images?url=${encoded}&w=${OGP_IMAGE_WIDTH}&fm=${OGP_IMAGE_FORMAT}`;
  }
  return absoluteUrl;
}


function getPostHeroImage(post?: Post | null): string {
  const slug = String(post?.slug || '').trim().toLowerCase();
  return (
    String(post?.heroImageUrl || '').trim() ||
    String(post?.imageUrl || '').trim() ||
    String(post?.sliderImageUrl || '').trim() ||
    String(HERO_IMAGE_OVERRIDES[slug] || '').trim() ||
    DEFAULT_OG_IMAGE
  );
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function replaceMetaContent(html: string, selector: string, newValue: string): string {
  // Match meta tags by property or name attribute
  const attrMatch = selector.match(/meta\[(property|name)="([^"]+)"\]/);
  if (!attrMatch) {
    return html;
  }
  const [, attrName, attrValue] = attrMatch;
  const pattern = new RegExp(
    `(<meta\\s[^>]*${attrName}="${attrValue}"[^>]*\\scontent=")([^"]*)(")`
  );
  return html.replace(pattern, `$1${escapeAttr(newValue)}$3`);
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const postSlug = url.searchParams.get('post');

  if (!postSlug) {
    return;
  }

  const response = await context.next();
  let html = await response.text();

  let post: Post | undefined;
  try {
    const apiUrl = new URL('/api/public-posts', url.origin);
    const apiResponse = await fetch(apiUrl.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      const posts: Post[] = data.items || data || [];
      post = posts.find((p) => p.slug === postSlug);
    }
  } catch {
    // API unavailable — fall through with default meta tags
  }

  if (!post) {
    return new Response(html, { headers: response.headers });
  }

  const title = String(post.title || DEFAULT_TITLE).trim();
  const description = String(post.summary || DEFAULT_DESCRIPTION).trim();
  const imageUrl = toShareImageUrl(getPostHeroImage(post)) || toShareImageUrl(DEFAULT_OG_IMAGE);
  const shareUrl = `${SITE_ORIGIN}/blog.html?post=${encodeURIComponent(postSlug)}#${encodeURIComponent(postSlug)}`;

  // Replace title tag
  html = html.replace(
    /(<title[^>]*>)[^<]*(<\/title>)/,
    `$1${escapeAttr(title)}$2`
  );

  // Replace canonical URL
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    `$1${escapeAttr(shareUrl)}$2`
  );

  // Replace meta tags
  html = replaceMetaContent(html, 'meta[name="description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:title"]', title);
  html = replaceMetaContent(html, 'meta[property="og:description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:url"]', shareUrl);
  html = replaceMetaContent(html, 'meta[property="og:image"]', imageUrl);
  html = replaceMetaContent(html, 'meta[name="twitter:title"]', title);
  html = replaceMetaContent(html, 'meta[name="twitter:description"]', description);
  html = replaceMetaContent(html, 'meta[name="twitter:image"]', imageUrl);

  return new Response(html, { headers: response.headers });
};

export const config: Config = {
  path: '/blog.html',
  onError: 'bypass',
};
