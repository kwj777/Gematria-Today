import { clearCachedJson } from './_security.mjs';

// A draft whose scheduled_publish_at has passed is due to go live. Promoting it
// sets its status and published_at, so every reader of the posts table -- the
// blog list, the /blog/<slug> permalink, the RSS feed, the chatbots -- treats it
// as published from its scheduled time. This used to run only when an admin
// opened admin-posts, so until someone did, a scheduled post was listed on the
// blog while its permalink redirected to the index and the feed left it out.
// The public read paths call it before they read, which makes the UPDATE a
// no-op on almost every request.
export async function promoteDueScheduledPosts(sql) {
  const promoted = await sql`
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
    RETURNING id
  `;
  if (promoted.length) {
    // public-posts keeps its responses for two minutes; drop them so the
    // promoted post's status and date show at once.
    await clearCachedJson(sql, { route: 'public-posts' });
  }
  return promoted.length;
}
