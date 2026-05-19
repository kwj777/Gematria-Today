import crypto from 'node:crypto';
import { formatPost, getAuthenticatedUser, jsonResponse, parseBody, routeByHttpMethod, slugify } from './_admin.mjs';
import { clearCachedJson } from './_security.mjs';

export function normalizePostTags(tagInput, tagsInput) {
  const tagSeparatorPattern = /[;,]/;
  const tagTokens = [];
  const addTag = (tagValue) => {
    const normalizedTag = String(tagValue ?? '').trim();
    if (!normalizedTag) {
      return;
    }
    if (tagTokens.some((tag) => tag.toLowerCase() === normalizedTag.toLowerCase())) {
      return;
    }
    tagTokens.push(normalizedTag);
  };

  if (Array.isArray(tagsInput)) {
    tagsInput.forEach((tagValue) => addTag(tagValue));
  }

  if (typeof tagInput === 'string') {
    tagInput.split(tagSeparatorPattern).forEach((tagValue) => addTag(tagValue));
  } else if (tagInput != null) {
    addTag(tagInput);
  }

  return tagTokens.length ? tagTokens.join(', ') : null;
}

export function normalizePostStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'draft' || raw === 'archived') {
    return raw;
  }
  return 'published';
}

export function normalizeScheduledPublishAt(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export async function handler(event) {
  try {
    const { sql, user } = await getAuthenticatedUser(event);

    await sql`
      UPDATE posts
      SET
        status = 'published',
        published_at = COALESCE(published_at, scheduled_publish_at, NOW()),
        scheduled_publish_at = NULL,
        updated_at = NOW()
      WHERE
        COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'draft'
        AND scheduled_publish_at IS NOT NULL
        AND scheduled_publish_at <= NOW()
    `;

    return await routeByHttpMethod(event, {
      GET: async () => {
        const rows = await sql`SELECT * FROM posts ORDER BY COALESCE(published_at, created_at) DESC`;
        return jsonResponse(200, { items: rows.map(formatPost) });
      },

      POST: async () => {
        const body = parseBody(event);
        const title = String(body.title ?? '').trim();
        if (!title) {
          return jsonResponse(400, { error: 'Title is required' });
        }
        const slug = slugify(body.slug || title);
        const status = normalizePostStatus(body.status);
        const scheduledPublishAt = normalizeScheduledPublishAt(body.scheduledPublishAt);
        const showOnHomepage = Boolean(body.showOnHomepage);
        const hideFromBlog = Boolean(body.hideFromBlog);
        const normalizedTagValue = normalizePostTags(body.tag, body.tags);
        const imageUrl = String(body.imageUrl ?? '').trim() || null;
        const sliderImageUrl = String(body.sliderImageUrl ?? '').trim() || null;
        const backgroundImageUrl = String(body.backgroundImageUrl ?? '').trim() || null;
        const rows = await sql`
          INSERT INTO posts (id, title, slug, tag, summary, body, read_time, image_url, slider_image_url, background_image_url, show_on_homepage, hide_from_blog, status, published_at, scheduled_publish_at, created_by, updated_at)
          VALUES (
            ${crypto.randomUUID()},
            ${title},
            ${slug},
            ${normalizedTagValue},
            ${String(body.summary ?? '').trim()},
            ${String(body.body ?? '').trim()},
            ${String(body.readTime ?? '').trim() || null},
            ${imageUrl},
            ${sliderImageUrl},
            ${backgroundImageUrl},
            ${showOnHomepage},
            ${hideFromBlog},
            ${status},
            ${status === 'published' ? (scheduledPublishAt || new Date().toISOString()) : null},
            ${status === 'draft' ? scheduledPublishAt : null},
            ${user.id},
            NOW()
          )
          RETURNING *
        `;
        await clearCachedJson(sql, { route: 'public-posts' });
        return jsonResponse(201, { item: formatPost(rows[0]) });
      },

      PUT: async () => {
        const body = parseBody(event);
        const id = String(body.id ?? '').trim();
        const title = String(body.title ?? '').trim();
        if (!id) {
          return jsonResponse(400, { error: 'Post id is required' });
        }
        if (!title) {
          return jsonResponse(400, { error: 'Title is required' });
        }
        const slug = slugify(body.slug || title);
        const status = normalizePostStatus(body.status);
        const scheduledPublishAt = normalizeScheduledPublishAt(body.scheduledPublishAt);
        const showOnHomepage = Boolean(body.showOnHomepage);
        const hideFromBlog = Boolean(body.hideFromBlog);
        const normalizedTagValue = normalizePostTags(body.tag, body.tags);
        const hasImageUrl = Object.prototype.hasOwnProperty.call(body, 'imageUrl');
        const hasSliderImageUrl = Object.prototype.hasOwnProperty.call(body, 'sliderImageUrl');
        const hasBackgroundImageUrl = Object.prototype.hasOwnProperty.call(body, 'backgroundImageUrl');
        const imageUrl = String(body.imageUrl ?? '').trim() || null;
        const sliderImageUrl = String(body.sliderImageUrl ?? '').trim() || null;
        const backgroundImageUrl = String(body.backgroundImageUrl ?? '').trim() || null;
        const rows = await sql`
          UPDATE posts
          SET
            title = ${title},
            slug = ${slug},
            tag = ${normalizedTagValue},
            summary = ${String(body.summary ?? '').trim()},
            body = ${String(body.body ?? '').trim()},
            read_time = ${String(body.readTime ?? '').trim() || null},
            image_url = CASE
              WHEN ${hasImageUrl ? 1 : 0} = 1 THEN ${imageUrl}
              ELSE image_url
            END,
            slider_image_url = CASE
              WHEN ${hasSliderImageUrl ? 1 : 0} = 1 THEN ${sliderImageUrl}
              ELSE slider_image_url
            END,
            background_image_url = CASE
              WHEN ${hasBackgroundImageUrl ? 1 : 0} = 1 THEN ${backgroundImageUrl}
              ELSE background_image_url
            END,
            show_on_homepage = ${showOnHomepage},
            hide_from_blog = ${hideFromBlog},
            status = ${status},
            published_at = CASE
              WHEN ${status} = 'published' THEN COALESCE(published_at, ${scheduledPublishAt}::timestamptz, NOW())
              WHEN ${status} = 'archived' THEN published_at
              ELSE NULL
            END,
            scheduled_publish_at = CASE
              WHEN ${status} = 'draft' THEN ${scheduledPublishAt}::timestamptz
              ELSE NULL
            END,
            updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
        if (!rows.length) {
          return jsonResponse(404, { error: 'Post not found' });
        }
        await clearCachedJson(sql, { route: 'public-posts' });
        return jsonResponse(200, { item: formatPost(rows[0]) });
      },

      DELETE: async () => {
        const id = event.queryStringParameters?.id;
        if (!id) {
          return jsonResponse(400, { error: 'Missing post id' });
        }
        await sql`DELETE FROM posts WHERE id = ${id}`;
        await clearCachedJson(sql, { route: 'public-posts' });
        return jsonResponse(200, { deleted: true });
      },
    });
  } catch (error) {
    const message = error.message?.includes('posts_slug_key') ? 'A post with this slug already exists' : (error.message || 'Post request failed');
    return jsonResponse(error.statusCode || 500, { error: message });
  }
}
