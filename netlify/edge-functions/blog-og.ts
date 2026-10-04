import type { Config, Context } from '@netlify/edge-functions';

const FALLBACK_SITE_ORIGIN = 'https://gematria.today';
const DEFAULT_OG_IMAGE_PATH = '/assets/beast-identity-rev13-hero-16x9.svg';
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

function toAbsoluteImageUrl(value: string | null | undefined, siteOrigin: string): string {
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
  return `${siteOrigin}${url.startsWith('/') ? url : `/${url}`}`;
}

function toShareImageUrl(value: string | null | undefined, siteOrigin: string): string {
  const absoluteUrl = toAbsoluteImageUrl(value, siteOrigin);
  if (!absoluteUrl) {
    return '';
  }
  if (/\.svg(?:$|[?#])/i.test(absoluteUrl)) {
    const encoded = encodeURIComponent(absoluteUrl);
    return `${siteOrigin}/.netlify/images?url=${encoded}&w=${OGP_IMAGE_WIDTH}&fm=${OGP_IMAGE_FORMAT}`;
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
    ''
  );
}

type PostLookup =
  | { status: 'found'; post: Post }
  | { status: 'missing'; post?: undefined }
  | { status: 'unavailable'; post?: undefined };

// Asks /api/public-posts for this one post (?slug= is its single-row detail
// mode) rather than the whole list. 'missing' means the API answered and has
// no such published post; any failure to get an answer is 'unavailable', which
// must not be mistaken for a missing post.
async function lookupPost(origin: string, postSlug: string): Promise<PostLookup> {
  try {
    const apiUrl = new URL('/api/public-posts', origin);
    apiUrl.searchParams.set('slug', postSlug);
    const apiResponse = await fetch(apiUrl.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!apiResponse.ok) {
      return { status: 'unavailable' };
    }
    const data = await apiResponse.json();
    const posts: Post[] | undefined = Array.isArray(data?.items) ? data.items : undefined;
    if (!posts) {
      return { status: 'unavailable' };
    }
    const wantedSlug = postSlug.trim().toLowerCase();
    const post = posts.find((p) => String(p?.slug || '').trim().toLowerCase() === wantedSlug);
    return post ? { status: 'found', post } : { status: 'missing' };
  } catch {
    return { status: 'unavailable' };
  }
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

  const siteOrigin = (url.origin || FALLBACK_SITE_ORIGIN).replace(/\/+$/, '');
  const defaultOgImage = `${siteOrigin}${DEFAULT_OG_IMAGE_PATH}`;

  const response = await context.next();
  const lookup = await lookupPost(url.origin, postSlug);
  if (lookup.status === 'unavailable') {
    // A 429, a 5xx or a network error says nothing about the post, so the
    // page goes out exactly as built: default meta tags, still indexable.
    return response;
  }
  let html = await response.text();
  const post = lookup.post;

  if (!post) {
    const noindexedHtml = replaceMetaContent(
      html,
      'meta[name="robots"]',
      'noindex, follow, max-image-preview:large'
    );
    const headers = new Headers(response.headers);
    headers.set('x-robots-tag', 'noindex, follow');
    return new Response(noindexedHtml, { headers });
  }

  const title = String(post.title || DEFAULT_TITLE).trim();
  const description = String(post.summary || DEFAULT_DESCRIPTION).trim();
  const heroImage = getPostHeroImage(post) || defaultOgImage;
  const imageUrl = toShareImageUrl(heroImage, siteOrigin) || toShareImageUrl(defaultOgImage, siteOrigin);
  const shareUrl = `${siteOrigin}/blog.html?post=${encodeURIComponent(postSlug)}#${encodeURIComponent(postSlug)}`;

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
