import type { Config, Context } from '@netlify/edge-functions';
import { injectPostArticle, replaceCanonical, replaceMetaContent, replaceTitle } from './lib/og-meta.mjs';

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
  renderedBodyHtml?: string;
  heroImageUrl?: string;
  imageUrl?: string;
  sliderImageUrl?: string;
}

// blog.html ships one static Article block describing the blog index (its
// tagline as headline, a fixed date, mainEntityOfPage blog.html). Left alone,
// every post URL claimed to be that same article. The block carries an id so a
// post view can swap it for the post's own data.
const ARTICLE_JSON_LD_PATTERN =
  /<script type="application\/ld\+json" id="blogArticleJsonLd">[\s\S]*?<\/script>/;

interface ArticleSource {
  title?: string;
  summary?: string;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

function toIsoDate(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function buildPostArticleJsonLd(
  post: ArticleSource,
  { canonicalUrl, imageUrl, siteOrigin }: { canonicalUrl: string; imageUrl: string; siteOrigin: string }
): Record<string, unknown> {
  const datePublished = toIsoDate(post.publishedAt) || toIsoDate(post.createdAt);
  const dateModified = toIsoDate(post.updatedAt) || datePublished;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: String(post.title || DEFAULT_TITLE).trim(),
    description: String(post.summary || DEFAULT_DESCRIPTION).trim(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    url: canonicalUrl,
    author: { '@type': 'Organization', name: 'Gematria.Today Editorial Team' },
    publisher: {
      '@type': 'Organization',
      name: 'Gematria.Today',
      logo: { '@type': 'ImageObject', url: `${siteOrigin}/apple-touch-icon.png`, width: 180, height: 180 },
    },
    isPartOf: { '@type': 'Blog', '@id': `${siteOrigin}/blog.html` },
  };
  if (imageUrl) {
    data.image = [imageUrl];
  }
  if (datePublished) {
    data.datePublished = datePublished;
  }
  if (dateModified) {
    data.dateModified = dateModified;
  }
  return data;
}

export function replaceArticleJsonLd(html: string, data: Record<string, unknown>): string {
  // '<' is the only character that can end a <script> early; JSON.stringify
  // handles the rest. A replacer function keeps '$' in a title literal.
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  const block = `<script type="application/ld+json" id="blogArticleJsonLd">\n${json}\n</script>`;
  return html.replace(ARTICLE_JSON_LD_PATTERN, () => block);
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

// /blog/<slug> is the post's address; netlify.toml serves blog.html there. A
// ?post= on blog.html itself is 301'd away before it gets here, but is still
// read, so a deploy without that rule degrades to the old behaviour.
const PATH_SLUG_PATTERN = /^\/blog\/([^/?#]+)\/?$/i;

export function slugFromUrl(url: URL): string {
  const match = url.pathname.match(PATH_SLUG_PATTERN);
  if (match) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
  return String(url.searchParams.get('post') || '').trim();
}

// blog.html carries its own h1 (the blog's headline) in a hero that a post view
// hides. With the post's title as an h1 too, every post had two. On a post
// view the hero headline becomes a paragraph, keeping its id and classes.
const HERO_H1_PATTERN = /<h1(\s+id="heroHeadlinePrimary"[^>]*)>([\s\S]*?)<\/h1>/;

export function demoteHeroHeadline(html: string): string {
  return html.replace(HERO_H1_PATTERN, (_m, attrs, inner) => `<p${attrs}>${inner}</p>`);
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const postSlug = slugFromUrl(url);

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
  // The post's one address, the same URL the sitemap lists and blog-2.js
  // declares once it has rendered. No fragment: crawlers drop it.
  const shareUrl = `${siteOrigin}/blog/${encodeURIComponent(postSlug)}`;

  // Replace title tag
  html = replaceTitle(html, title);

  // Replace canonical URL
  html = replaceCanonical(html, shareUrl);

  // Replace meta tags
  html = replaceMetaContent(html, 'meta[name="description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:title"]', title);
  html = replaceMetaContent(html, 'meta[property="og:description"]', description);
  html = replaceMetaContent(html, 'meta[property="og:url"]', shareUrl);
  html = replaceMetaContent(html, 'meta[property="og:image"]', imageUrl);
  html = replaceMetaContent(html, 'meta[name="twitter:title"]', title);
  html = replaceMetaContent(html, 'meta[name="twitter:description"]', description);
  html = replaceMetaContent(html, 'meta[name="twitter:image"]', imageUrl);

  html = replaceArticleJsonLd(
    html,
    buildPostArticleJsonLd(post, { canonicalUrl: shareUrl, imageUrl, siteOrigin })
  );

  // The ?slug= detail response carries the rendered body; put it in the page
  // so crawlers read the post without running blog-2.js first.
  html = injectPostArticle(html, { title, bodyHtml: String(post.renderedBodyHtml || '') });
  html = demoteHeroHeadline(html);

  return new Response(html, { headers: response.headers });
};

export const config: Config = {
  path: ['/blog.html', '/blog/*'],
  onError: 'bypass',
};
