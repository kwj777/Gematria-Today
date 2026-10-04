import crypto from 'node:crypto';
import {
  AUTH_COOKIES,
  authenticateCredentials as authenticateCredentialsShared,
  clearSessionCookie,
  createSession,
  createSessionCookie,
  deleteSession,
  getAuthenticatedUser as getAuthenticatedUserShared,
  getSqlClient,
  hashPassword,
  jsonResponse,
  parseBody,
} from './_auth.mjs';
import { applySeededContentCorrectionsOnce } from './_seeded-content-corrections.mjs';
import { ensureSecuritySchema } from './_security.mjs';

// The owner account. Its password hash comes only from the
// SUPER_ADMIN_PASSWORD_HASH environment variable (see
// syncBootstrapAdminUserUncached); it used to be committed here, which
// published it.
const SEEDED_ADMIN_USERS = [
  {
    id: 'KevAdmin',
    username: 'KevAdmin',
    role: 'super_admin',
  },
];

const SEEDED_POSTS = [
  {
    id: 'post-digital-roots-in-gematria',
    title: 'Digital Roots and Their Significance in Gematria',
    slug: 'digital-roots-in-gematria',
    tag: 'Number Patterns',
    summary: 'See how digital roots offer a quick pattern layer for comparing words, names, and phrases in gematria work.',
    body: `<p>Digital roots reduce any number to a single digit by repeatedly adding digits until one remains. For example, 197 becomes 1 + 9 + 7 = 17, then 1 + 7 = 8. In gematria, this gives you a fast way to compare values that look different on the surface but may still share a structural rhythm.</p><p>Why does this matter? Large totals can hide simple relationships. Two words may not match exactly, but their digital roots can align and suggest they belong in the same thematic group. This does not replace standard value matching; instead, it adds a second layer for pattern recognition. Think of total value as the full measurement and digital root as the compressed signature.</p><p>A practical method is to calculate both numbers every time: the full gematria total and the digital root. First, sort by exact total to find direct matches. Next, scan by digital root to find families of related terms that may deserve closer study. When a root value repeats across names, symbols, and action words in the same topic, you may have a stronger pattern than a one-off coincidence.</p><p>Digital roots are also useful for organizing research notes. You can create sections for root values 1 through 9 and file candidate terms under each group. Over time, this makes it easier to compare clusters and notice recurring themes without re-running every calculation from scratch.</p><p>Most importantly, treat digital roots as guidance, not proof. Context, language history, spelling variants, and textual setting still carry the most interpretive weight. Used carefully, digital roots can make gematria research more structured, more searchable, and more reproducible.</p>`,
    readTime: '6 minute read',
    imageUrl: '/assets/digital-roots-gematria-hero.svg',
    sliderImageUrl: '/assets/digital-roots-gematria-hero.svg',
    showOnHomepage: true,
    status: 'published',
    createdBy: 'kevandmel',
    publishedAt: '2026-03-25T00:00:00.000Z',
  },
  {
    id: 'post-determining-identity-of-the-beast-rev-13',
    title: 'Determining the Identity of the Beast - Rev. 13',
    slug: 'determining-identity-of-the-beast-rev-13',
    tag: 'Revelation 13, Methodology',
    summary: 'A structured framework for testing Revelation 13 candidates using English gematria, digital roots, and base-root word clusters instead of isolated matches.',
    body: `<p>Revelation 13:18 asks readers to count, and that invitation has pushed generations of researchers to ask how counting should be done with consistency. A modern approach is to use <strong><a href="/why-english-gematria.html">English gematria</a></strong> as a repeatable baseline for English-language names, titles, institutions, and slogans that circulate globally in media and policy spaces.</p><p>The key is method, not hype. One value by itself is weak evidence. What matters is whether values hold across related terms and whether they survive variant testing. This is where <strong><a href="/blog.html?post=digital-roots-in-gematria#digital-roots-in-gematria">digital roots</a></strong> and <strong><a href="/gematria-pattern-grouping.html">base-root words</a></strong> become useful controls inside the same workflow.</p><h3>1) Why start with English gematria?</h3><p>For researchers working in an English-speaking information ecosystem, English gematria creates a common measuring layer. It allows side-by-side comparison of names, titles, systems, and enforcement language associated with Revelation 13 themes such as authority, worship, commerce, and marking.</p><ul><li>It is transparent: same spelling, same result.</li><li>It is reproducible: others can verify quickly.</li><li>It is scalable: you can compare single names and large phrase groups.</li></ul><h3>2) Why add digital roots?</h3><p>Digital roots (reducing totals to a single digit pattern) are not a replacement for full totals, but they are a structural checkpoint. If full values differ while digital roots repeatedly align across a themed set, researchers can flag a possible pattern layer that might be missed by raw totals alone.</p><p>In practice, digital roots help answer: are these terms only matching once, or do they echo each other in a compressed numeric signature?</p><h3>3) Why use base-root words?</h3><p>Base-root words keep interpretation anchored to meaning, not just numbers. Instead of searching random terms, build families of related words from a root concept (for example: rule, ruler, ruling, dominion, dominator). Then test whether the numeric behavior repeats inside the concept family.</p><p>This reduces cherry-picking because your set is concept-driven before calculation. If a pattern is real, it should appear across legitimate members of the same semantic root—not only in one convenient phrase.</p><h3>4) A combined Beast-identification workflow</h3><ol><li>Define one candidate (name/title/system) tied to Revelation 13 claims.</li><li>Calculate the English gematria value for the exact spelling used.</li><li>Run variant controls (spacing, abbreviations, title forms) and log all results.</li><li>Reduce each total to digital roots and check for repeated signatures.</li><li>Build <a href="/gematria-pattern-grouping.html">base-root word clusters</a> for related themes (authority, commerce, worship, compulsion, image, mark).</li><li>Compare candidate values against those themed clusters.</li><li>Record non-matches as seriously as matches.</li><li>Assign confidence only after repeatability across all three layers.</li></ol><h3>5) Why this can help identify who/what the Beast is</h3><p>Revelation 13 describes more than a personal name; it describes a system of power, economy, worship pressure, and identity control. A three-layer method—English gematria, digital roots, and base-root clusters—tests both <em>person-level</em> and <em>system-level</em> candidates without collapsing everything into one dramatic number.</p><p>When a candidate repeatedly aligns across full totals, digital-root structure, and root-word theme sets, the case becomes stronger than a single coincidence. When the pattern breaks under controls, the case weakens. That is the point: disciplined counting should separate durable signals from speculative excitement.</p><p><strong>Bottom line:</strong> If Revelation 13 calls us to count, then we should count with rules. <a href="/why-english-gematria.html">English gematria</a> provides the baseline, <a href="/blog.html?post=digital-roots-in-gematria#digital-roots-in-gematria">digital roots</a> provide compression checks, and <a href="/gematria-pattern-grouping.html">base-root words</a> provide semantic guardrails. Together they form a practical path for testing Beast hypotheses with greater rigor.</p>`,
    readTime: '9 minute read',
    imageUrl: '/assets/beast-identity-rev13-hero-16x9.svg',
    sliderImageUrl: '/assets/beast-identity-rev13-hero-16x9.svg',
    showOnHomepage: true,
    status: 'published',
    createdBy: 'kevandmel',
    publishedAt: '2026-03-30T00:00:00.000Z',
  },
  {
    id: 'post-digital-roots-vs-full-totals-when-each-wins',
    title: 'Digital Roots vs. Full Totals: When Each Wins',
    slug: 'digital-roots-vs-full-totals-when-each-wins',
    tag: 'Methodology, Number Patterns',
    summary: 'A practical guide for choosing between full gematria totals and digital roots, and how to use both layers together without overreaching on a match.',
    body: `<p>This post is a direct follow-up to <strong><a href="/blog.html?post=digital-roots-in-gematria#digital-roots-in-gematria">Digital Roots and Their Significance in Gematria</a></strong>. That post introduced digital roots as a compressed signature on top of standard <a href="/why-english-gematria.html">English gematria</a> totals. The next question researchers usually ask is the practical one: when should I trust the full total, when should I lean on the digital root, and when do I need both?</p><p>The short answer is that full totals and digital roots answer different questions. Full totals are precise. Digital roots are structural. Treating them as competing measurements creates noise. Treating them as two layers in the same workflow creates signal.</p><h3>1) What full totals are best at</h3><p>Full totals are exact. Two terms that share the same total in the same cipher are saying the same numeric thing under that system. This is the strongest single-layer evidence you can record because there is no compression, no reduction, and no information loss.</p><ul><li>Direct identity checks between a name and a concept word.</li><li>Cross-cipher comparisons where you want to see whether the exact total repeats.</li><li>Variant testing where small spelling changes are expected to move the number in known ways.</li></ul><p>If you only have time to run one calculation, run the full total. It is the baseline.</p><h3>2) What digital roots are best at</h3><p>Digital roots compress a value to a single digit pattern. They are not a replacement for the total; they are a second view of it. Their strength is grouping. They let you ask whether a set of related terms share a numeric rhythm even when their full totals are different.</p><ul><li>Sorting research notes into nine root buckets so families of related terms surface together.</li><li>Catching thematic alignment across long phrases whose totals are too far apart to ever match directly.</li><li>Stress-testing a candidate: if the full total is suggestive but the digital root does not echo across the concept family, the case weakens.</li></ul><h3>3) Where the two layers disagree</h3><p>Disagreement is informative. Three common cases come up in practice.</p><ol><li><strong>Total matches, root does not echo the family.</strong> A clean total match is real, but if no other members of the concept cluster share that root, you likely have a single coincidence rather than a pattern.</li><li><strong>Root matches across a family, totals scatter.</strong> This is a structural signal. It will not stand on its own, but it earns the candidate a second pass with <a href="/gematria-pattern-grouping.html">base-root word clusters</a> for confirmation.</li><li><strong>Total and root both match, but only once.</strong> Strong as it looks, a one-off needs variant testing before it counts. Run spacing, abbreviation, and title-form controls before recording confidence.</li></ol><h3>4) A decision rubric</h3><p>Use this short rubric to decide which layer is doing the work in your analysis.</p><ul><li>Need precision on a single candidate: <strong>full total wins</strong>.</li><li>Need to organize many candidates into themes: <strong>digital root wins</strong>.</li><li>Need to defend a claim against cherry-picking: <strong>both layers required</strong>, plus a base-root cluster.</li><li>Need to compare across ciphers: <strong>full totals first</strong>, then check whether roots also align.</li></ul><h3>5) A worked mini-example</h3><p>Suppose you are testing a candidate term against an authority cluster (rule, ruler, ruling, dominion, reign). Using the <a href="/calculator.html">calculator</a>, you record the full English gematria total for each, then reduce each to its digital root. You expect one of three outcomes:</p><ul><li>A total in the candidate matches a total in the cluster. That is direct evidence and should be logged with the exact cipher used.</li><li>No totals match, but the candidate root appears repeatedly inside the cluster. That is structural evidence and is worth a follow-up with additional cluster members.</li><li>Neither totals nor roots align with the cluster. That is a real result too. Recording non-matches keeps the workflow honest.</li></ul><h3>6) Common mistakes to avoid</h3><ul><li>Reporting a digital-root match without the underlying totals. Always show both.</li><li>Treating a single digital-root hit as confirmation. Roots are grouping tools, not proofs.</li><li>Switching ciphers mid-analysis to chase a match. Pick a cipher, finish the layer, then compare.</li><li>Skipping variant controls because the first calculation looked clean.</li></ul><p><strong>Bottom line:</strong> Full totals tell you whether two terms say the same number. Digital roots tell you whether a family of terms shares the same numeric rhythm. Run the total first, use the root to organize and stress-test, and confirm with <a href="/gematria-pattern-grouping.html">base-root word clusters</a> before you call anything a pattern.</p>`,
    readTime: '7 minute read',
    imageUrl: '/assets/digital-roots-vs-full-totals-hero-16x9.svg',
    sliderImageUrl: '/assets/digital-roots-vs-full-totals-hero-16x9.svg',
    showOnHomepage: true,
    status: 'published',
    createdBy: 'kevandmel',
    publishedAt: '2026-05-18T00:00:00.000Z',
  },
  {
    id: 'post-combining-full-totals-digital-roots-and-base-rooted-words',
    title: 'Combining Full Totals, Digital Roots, and Base-Rooted Words',
    slug: 'combining-full-totals-digital-roots-and-base-rooted-words',
    tag: 'Methodology, Number Patterns',
    summary: 'A follow-up that adds base-rooted words as the third layer alongside full totals and digital roots, with a combined workflow you can run end to end.',
    body: `<p>This post is a direct follow-up to <strong><a href="/blog.html?post=digital-roots-vs-full-totals-when-each-wins#digital-roots-vs-full-totals-when-each-wins">Digital Roots vs. Full Totals: When Each Wins</a></strong>. That post compared two layers. The natural next question is whether there is a third layer that helps separate real patterns from convenient coincidences. There is, and on this site it has a specific name: <em>base-rooted words</em>.</p><p>This post brings all three together. Full totals give you precision. Digital roots give you grouping. Base-rooted words give you a semantic and structural anchor. Used as a stack, they cover the three failure modes that single-layer matches keep tripping over: cherry-picking, accidental alignment, and overreaching on one strong number.</p><h3>1) Quick recap: full totals and digital roots</h3><p>Full totals are exact <a href="/why-english-gematria.html">English gematria</a> values for a term in a given cipher. Two terms with the same total are saying the same numeric thing under that system. This is the strongest single-layer evidence you can record.</p><p>Digital roots compress a total to a single-digit signature (for example, 276 → 2 + 7 + 6 = 15 → 1 + 5 = 6). They are not a replacement for the full total. Their job is to group: when a family of related terms shares a digital root even though their totals differ, you are looking at a structural echo rather than a one-off hit. For the long version, see <a href="/blog.html?post=digital-roots-in-gematria#digital-roots-in-gematria">Digital Roots and Their Significance in Gematria</a>.</p><h3>2) What base-rooted words are</h3><p>Base-rooted words are the third layer. They combine two ideas at once:</p><ul><li><strong>A structural rule on the total.</strong> In the English cipher used on this site, every letter value is a multiple of the base unit (A = 6, B = 12, and so on). A total is treated as <em>base-rooted</em> when it sits on the base unit plus a full nine-step cycle of that base — that is, totals of 6, 60, 114, 168, 222, 276, 330, and so on (each step adds 54 = 6 × 9). These totals all reduce to a digital root of six, but they are a stricter subset of the digital-root-six family. The <a href="/calculator.html">calculator</a> shows this with a "Base Rooted: Yes/No" indicator on every result.</li><li><strong>A semantic rule on the word set.</strong> Beyond the math, base-rooted research is built around <em>root-concept word families</em>: a small cluster of terms that share a meaning (for example, rule, ruler, ruling, reign, dominion). You decide the cluster before you calculate. See <a href="/gematria-pattern-grouping.html">pattern grouping</a> for the workflow.</li></ul><p>The two ideas reinforce each other. The structural rule prevents you from calling any digital-root-six total a "base" pattern. The semantic rule prevents you from chasing isolated words that happen to land on a base-rooted number.</p><h3>3) Why add base-rooted words on top of the first two layers?</h3><p>Full totals can match by chance. Digital roots can echo for unrelated reasons. Base-rooted words narrow the field on both sides at once: the total has to sit on a base-aligned step, and the word has to belong to a concept family you defined before running the calculation. That double constraint is the part that earns trust.</p><ul><li><strong>It blocks cherry-picking.</strong> You name the concept cluster first, then test it. You cannot retroactively expand the set to absorb a stray match.</li><li><strong>It blocks accidental alignment.</strong> A base-rooted total inside a base-rooted word family is harder to produce by accident than a single matching digital root.</li><li><strong>It clarifies confidence labels.</strong> A candidate that survives all three layers earns a different note in your log than one that only passed the total-match check.</li></ul><h3>4) The three-layer workflow</h3><ol><li><strong>Define the concept cluster first.</strong> Pick a single theme (authority, commerce, marking, mercy, judgment) and list 5–12 root-related terms. Add at least two expected non-matches so the set is not curated for success.</li><li><strong>Run full totals.</strong> Use the <a href="/calculator.html">calculator</a> for every term in the cluster. Record exact totals, with the cipher named.</li><li><strong>Reduce to digital roots.</strong> Note the single-digit signature for each term. Watch for repeated roots inside the cluster.</li><li><strong>Mark base-rooted hits.</strong> Flag every term where the total is base-rooted (the calculator already does this). Count how many cluster members qualify.</li><li><strong>Compare your candidate.</strong> Bring in the term you are actually testing. Run its full total, digital root, and base-rooted status against the cluster you built.</li><li><strong>Run variant controls.</strong> Spacing, abbreviations, title forms, and transliterations. Log all of them, including the ones that move the number away from the cluster.</li><li><strong>Assign confidence.</strong> Low, moderate, or high — based on how many layers held under controls, not on the most dramatic single match.</li></ol><h3>5) Reading the layers together</h3><p>The interesting cases are the ones where the layers disagree. A few common shapes:</p><ul><li><strong>All three align.</strong> Full total matches a cluster member, digital root echoes across the family, and the candidate is base-rooted. This is the strongest single-study outcome you can record. It still needs replication on a fresh cluster before it should drive a public claim.</li><li><strong>Total matches, base-root status differs.</strong> A clean total match is real, but if the candidate is not base-rooted and most of the cluster is, the structural anchor is missing. Note the match, downgrade the confidence, and keep looking.</li><li><strong>Digital roots and base-root status align, totals scatter.</strong> A structural-only signal. Worth a second cluster, not a conclusion.</li><li><strong>Only the total matches, nothing else aligns.</strong> A coincidence candidate. Log it honestly and move on rather than letting one strong number anchor an interpretation.</li></ul><h3>6) A worked mini-example</h3><p>Suppose you are testing a candidate against an authority cluster: rule, ruler, ruling, reign, dominion. You run all five through the <a href="/calculator.html">calculator</a>, write down the totals, reduce each to its digital root, and note which totals are base-rooted. If three of the five cluster members come back as base-rooted and your candidate is also base-rooted with a digital root that echoes the cluster, that is a three-layer alignment worth a follow-up study. If your candidate hits a matching total but is not base-rooted while the cluster mostly is, you have a one-layer match — interesting, but not load-bearing.</p><h3>7) Common mistakes to avoid</h3><ul><li>Defining the concept cluster <em>after</em> the calculation. The cluster has to come first or the layer cannot do its job.</li><li>Treating any digital-root-six word as base-rooted. The structural rule is stricter than the digital-root family.</li><li>Reporting a base-root hit without showing the full total and the digital root. Always show all three numbers so a reader can audit the layer.</li><li>Skipping variant controls because the first pass looked clean.</li><li>Switching ciphers mid-analysis to chase a missing layer.</li></ul><p><strong>Bottom line:</strong> Full totals tell you whether two terms say the same number. Digital roots tell you whether a family shares a numeric rhythm. Base-rooted words tell you whether that rhythm sits on a structural anchor inside a concept you defined in advance. Run them as a stack — total first, root second, base-rooted check third — and let the layers, not a single dramatic match, decide what counts as a pattern.</p>`,
    readTime: '8 minute read',
    imageUrl: '/assets/base-rooted-words-three-layer-hero-16x9.svg',
    sliderImageUrl: '/assets/base-rooted-words-three-layer-hero-16x9.svg',
    showOnHomepage: true,
    status: 'published',
    createdBy: 'kevandmel',
    publishedAt: '2026-05-18T12:00:00.000Z',
  },
];

export { clearSessionCookie, createSession, createSessionCookie, deleteSession, getSqlClient, jsonResponse, parseBody };

// The admin schema bootstrap runs 58 sequential statements, including two
// table-wide UPDATEs on `users`. It was re-run on every single call --
// getAuthenticatedUser invokes it before checking any credential -- so a warm
// lambda paid the whole thing again on each request. Memoized per instance the
// way ensureMemberSchema already is; the promise is cleared on failure so a
// transient error does not poison the instance.
let adminSchemaReadyPromise = null;
let bootstrapAdminUserPromise = null;

export async function ensureAdminSchema(sql) {
  if (adminSchemaReadyPromise) {
    return adminSchemaReadyPromise;
  }

  adminSchemaReadyPromise = ensureAdminSchemaUncached(sql).catch((error) => {
    adminSchemaReadyPromise = null;
    throw error;
  });

  return adminSchemaReadyPromise;
}

async function ensureAdminSchemaUncached(sql) {
  await ensureSecuritySchema(sql);
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  // status is ensureMemberSchema's column, with the same definition. The
  // session lookups in _auth.mjs refuse suspended accounts, and the admin
  // functions reach them having run only this schema.
  await sql`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`;

  await sql`UPDATE users
    SET is_admin = TRUE
    WHERE role = 'admin'`;

  await sql`UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL`;

  await sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)`;

  await sql`CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tag TEXT,
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    read_time TEXT,
    show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE,
    hide_from_blog BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'published',
    published_at TIMESTAMPTZ,
    scheduled_publish_at TIMESTAMPTZ,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS summary TEXT`;

  await sql`ALTER TABLE posts
    ALTER COLUMN summary SET DEFAULT ''`;

  await sql`UPDATE posts SET summary = '' WHERE summary IS NULL`;

  await sql`ALTER TABLE posts
    ALTER COLUMN summary SET NOT NULL`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS body TEXT`;

  await sql`ALTER TABLE posts
    ALTER COLUMN body SET DEFAULT ''`;

  await sql`UPDATE posts SET body = '' WHERE body IS NULL`;

  await sql`ALTER TABLE posts
    ALTER COLUMN body SET NOT NULL`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS read_time TEXT`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS image_url TEXT`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS slider_image_url TEXT`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS background_image_url TEXT`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS hide_from_blog BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS status TEXT`;

  await sql`UPDATE posts
    SET status = 'published'
    WHERE status IS NULL OR BTRIM(status) = ''`;

  await sql`ALTER TABLE posts
    ALTER COLUMN status SET DEFAULT 'published'`;

  await sql`ALTER TABLE posts
    ALTER COLUMN status SET NOT NULL`;

  await sql`UPDATE posts
    SET show_on_homepage = FALSE
    WHERE show_on_homepage IS NULL`;

  await sql`ALTER TABLE posts
    ALTER COLUMN show_on_homepage SET DEFAULT FALSE`;

  await sql`ALTER TABLE posts
    ALTER COLUMN show_on_homepage SET NOT NULL`;

  await sql`UPDATE posts
    SET hide_from_blog = FALSE
    WHERE hide_from_blog IS NULL`;

  await sql`ALTER TABLE posts
    ALTER COLUMN hide_from_blog SET DEFAULT FALSE`;

  await sql`ALTER TABLE posts
    ALTER COLUMN hide_from_blog SET NOT NULL`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`;

  await sql`ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ`;

  await sql`UPDATE posts
    SET published_at = COALESCE(published_at, created_at)
    WHERE COALESCE(NULLIF(BTRIM(status), ''), 'published') = 'published' AND published_at IS NULL`;

  await sql`CREATE INDEX IF NOT EXISTS posts_status_published_at_idx ON posts(status, published_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS blog_post_proposals (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    suggested_tags TEXT,
    attribution_username TEXT,
    attribution_display_name TEXT,
    attribution_email TEXT,
    proposed_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE blog_post_proposals
    ADD COLUMN IF NOT EXISTS proposed_image_url TEXT`;

  await sql`ALTER TABLE blog_post_proposals
    ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL`;

  await sql`ALTER TABLE blog_post_proposals
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`;

  await sql`ALTER TABLE blog_post_proposals
    ADD COLUMN IF NOT EXISTS rejection_explanation TEXT`;

  await sql`ALTER TABLE blog_post_proposals
    ADD COLUMN IF NOT EXISTS archived_by_member_at TIMESTAMPTZ`;

  await sql`UPDATE blog_post_proposals
    SET status = 'pending'
    WHERE status IS NULL OR BTRIM(status) = ''`;

  await sql`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'blog_post_proposals_status_check'
    ) THEN
      ALTER TABLE blog_post_proposals
      ADD CONSTRAINT blog_post_proposals_status_check
      CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected'));
    END IF;
  END
  $$`;

  await sql`CREATE INDEX IF NOT EXISTS blog_post_proposals_status_created_idx
    ON blog_post_proposals (status, created_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS chatbot_search_feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    cleaned_query TEXT,
    answer_text TEXT,
    sources_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    was_expected BOOLEAN,
    feedback_text TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    admin_reply TEXT,
    replied_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    replied_at TIMESTAMPTZ,
    archived_by_member_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE chatbot_search_feedback
    ADD COLUMN IF NOT EXISTS cleaned_query TEXT,
    ADD COLUMN IF NOT EXISTS answer_text TEXT,
    ADD COLUMN IF NOT EXISTS sources_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS was_expected BOOLEAN,
    ADD COLUMN IF NOT EXISTS feedback_text TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
    ADD COLUMN IF NOT EXISTS admin_reply TEXT,
    ADD COLUMN IF NOT EXISTS replied_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_by_member_at TIMESTAMPTZ`;

  await sql`UPDATE chatbot_search_feedback
    SET status = 'new'
    WHERE status IS NULL OR BTRIM(status) = ''`;

  await sql`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chatbot_search_feedback_status_check'
    ) THEN
      ALTER TABLE chatbot_search_feedback
      ADD CONSTRAINT chatbot_search_feedback_status_check
      CHECK (status IN ('new', 'reviewed', 'replied', 'closed'));
    END IF;
  END
  $$`;

  await sql`CREATE INDEX IF NOT EXISTS chatbot_search_feedback_created_idx
    ON chatbot_search_feedback (status, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS chatbot_search_feedback_user_created_idx
    ON chatbot_search_feedback (user_id, created_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    owner TEXT,
    due_date DATE,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS tasks_status_due_date_idx ON tasks(status, due_date ASC NULLS LAST)`;

  await sql`CREATE TABLE IF NOT EXISTS faqs (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS faqs_is_published_sort_order_idx ON faqs(is_published, sort_order ASC, created_at ASC)`;


  await sql`CREATE TABLE IF NOT EXISTS admin_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

}

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `post-${crypto.randomBytes(4).toString('hex')}`;
}

const DEFAULT_SUPER_ADMIN_USERNAMES = ['KevAdmin'];

export function getSuperAdminUsernames(env = process.env) {
  const configuredSuperAdminUsernames = String(env.SUPER_ADMIN_USERNAMES || '')
    .split(',')
    .map((username) => username.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_SUPER_ADMIN_USERNAMES, ...configuredSuperAdminUsernames])];
}

// The bootstrap grants staff rights by username, and members choose their own
// usernames -- at signup, or from a Google display name. A member account named
// like one of these, in any letter case, is either an impersonation of the
// staff account or a candidate for being mistaken for it, so signup and OAuth
// treat these names as taken.
export function isReservedStaffUsername(username, env = process.env) {
  const normalized = String(username ?? '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const reserved = [
    ...SEEDED_ADMIN_USERS.map((user) => user.username),
    ...getSuperAdminUsernames(env),
    String(env.ADMIN_USERNAME || '').trim(),
  ];
  return reserved.some((name) => name && name.toLowerCase() === normalized);
}

export async function syncBootstrapAdminUser(sql) {
  if (bootstrapAdminUserPromise) {
    return bootstrapAdminUserPromise;
  }

  bootstrapAdminUserPromise = syncBootstrapAdminUserUncached(sql).catch((error) => {
    bootstrapAdminUserPromise = null;
    throw error;
  });

  return bootstrapAdminUserPromise;
}

async function syncBootstrapAdminUserUncached(sql) {
  const superAdminUsernames = getSuperAdminUsernames();

  // This used to insert a password hash committed to the repository, and
  // with ON CONFLICT DO UPDATE SET password_hash, so every cold start put the
  // public hash back: a reset or rotation of the owner account lasted only
  // until the next deploy, and deleting the row only brought it back. The
  // hash now comes from SUPER_ADMIN_PASSWORD_HASH, and without it no account
  // is created. It only creates a missing account: once the row exists its
  // password and role belong to the database; the promotion below still
  // keeps the configured super admin names at super_admin while they remain
  // staff. No conflict target, so a row that keeps the seeded id under
  // another username is left alone too instead of failing every cold start
  // on the primary key.
  const seededOwnerPasswordHash = String(process.env.SUPER_ADMIN_PASSWORD_HASH || '').trim();
  if (seededOwnerPasswordHash) {
    for (const seededUser of SEEDED_ADMIN_USERS) {
      await sql`
        INSERT INTO users (id, username, password_hash, role, is_admin)
        VALUES (${seededUser.id}, ${seededUser.username}, ${seededOwnerPasswordHash}, ${seededUser.role}, TRUE)
        ON CONFLICT DO NOTHING
      `;
    }
  }

  // This used to match LOWER(username), and usernames are only unique
  // case-sensitively, so anyone who registered "kevadmin" became a super admin
  // on the next cold start. Match the exact name, and only escalate an account
  // that is already staff: a member is never promoted because of what they
  // chose to call themselves.
  await sql`
    UPDATE users
    SET role = 'super_admin',
        is_admin = TRUE,
        updated_at = NOW()
    WHERE username = ANY(${superAdminUsernames})
      AND (role IN ('admin', 'super_admin') OR COALESCE(is_admin, FALSE) = TRUE)
  `;

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const password = process.env.ADMIN_PASSWORD;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;

  // Seeding blog content must never take down admin login or the public read
  // paths that call this on cold start. A failure is logged and, because no
  // marker is written for the post that failed, retried on the next cold start.
  try {
    await seedPostsOnce(sql);
  } catch (error) {
    console.error('[seed] Seeding the default blog posts failed', error);
  }

  // Same contract for corrections to seeded posts and FAQs: a failure is
  // logged, and the correction is retried on the next cold start because its
  // marker was not written.
  try {
    await applySeededContentCorrectionsOnce(sql);
  } catch (error) {
    console.error('[seed] Applying corrections to seeded content failed', error);
  }

  if (!username || (!passwordHash && !password)) {
    return;
  }

  const effectiveHash = passwordHash || await hashPassword(password);
  await sql`
    INSERT INTO users (id, username, email, password_hash, role, is_admin)
    VALUES (${crypto.randomUUID()}, ${username}, ${email}, ${effectiveHash}, 'admin', TRUE)
    ON CONFLICT (username)
    DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email), password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_admin = EXCLUDED.is_admin, updated_at = NOW()
  `;
}

// SEEDED_POSTS is starter content, not code-owned content: once a seeded post
// is in the database the admin owns it. Each one is inserted at most once --
// on the first cold start after it is added to SEEDED_POSTS -- and a marker
// row in admin_settings records that, so a later cold start never reverts an
// admin's edit or unpublish, or brings back a post the admin deleted.
// ON CONFLICT DO NOTHING has no conflict target, so it also skips a seed whose
// id or slug is already taken; a seeded slug the admin has since given to
// another post cannot raise posts_slug_key on every request.
const SEEDED_POST_MARKER_PREFIX = 'seeded_post:';

async function seedPostsOnce(sql) {
  const markerKeys = SEEDED_POSTS.map((seededPost) => `${SEEDED_POST_MARKER_PREFIX}${seededPost.id}`);
  const markerRows = await sql`
    SELECT setting_key
    FROM admin_settings
    WHERE setting_key = ANY(${markerKeys})
  `;
  const appliedMarkerKeys = new Set(markerRows.map((row) => row.setting_key));

  for (const seededPost of SEEDED_POSTS) {
    const markerKey = `${SEEDED_POST_MARKER_PREFIX}${seededPost.id}`;
    if (appliedMarkerKeys.has(markerKey)) {
      continue;
    }

    const insertedRows = await sql`
      INSERT INTO posts (
        id, title, slug, tag, summary, body, read_time, image_url, slider_image_url, show_on_homepage, status, published_at, created_by
      )
      VALUES (
        ${seededPost.id},
        ${seededPost.title},
        ${seededPost.slug},
        ${seededPost.tag},
        ${seededPost.summary},
        ${seededPost.body},
        ${seededPost.readTime},
        ${seededPost.imageUrl},
        ${seededPost.sliderImageUrl || seededPost.imageUrl},
        ${seededPost.showOnHomepage},
        ${seededPost.status},
        ${seededPost.publishedAt},
        ${seededPost.createdBy}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    await sql`
      INSERT INTO admin_settings (setting_key, setting_value, updated_at)
      VALUES (${markerKey}, ${insertedRows.length ? 'inserted' : 'skipped_existing'}, NOW())
      ON CONFLICT (setting_key) DO NOTHING
    `;
  }
}

export async function authenticateCredentials(sql, username, password) {
  await ensureAdminSchema(sql);
  await syncBootstrapAdminUser(sql);
  return authenticateCredentialsShared(sql, username, password, { role: 'admin' });
}

export async function getAuthenticatedUser(event, { requireAuth = true } = {}) {
  const sql = getSqlClient();
  await ensureAdminSchema(sql);
  await syncBootstrapAdminUser(sql);

  return getAuthenticatedUserShared(event, {
    sql,
    cookieName: AUTH_COOKIES.admin,
    requireAuth,
    role: 'admin',
  });
}

export function methodNotAllowedResponse() {
  return jsonResponse(405, { error: 'Method not allowed' });
}

export function requireHttpMethod(event, ...allowedMethods) {
  const methods = allowedMethods.flat().map((method) => String(method || '').toUpperCase()).filter(Boolean);
  if (!methods.includes(String(event?.httpMethod || '').toUpperCase())) {
    return methodNotAllowedResponse();
  }
  return null;
}

export async function routeByHttpMethod(event, handlers = {}, { methodNotAllowed = methodNotAllowedResponse } = {}) {
  const method = String(event?.httpMethod || '').toUpperCase();
  const handler = handlers[method];
  if (!handler) {
    return methodNotAllowed();
  }
  return await handler();
}

export function formatPost(row) {
  const tagValue = String(row.tag ?? '').trim();
  const tags = tagValue
    ? [...new Map(tagValue.split(',').map((tag) => String(tag || '').trim()).filter(Boolean).map((tag) => [tag.toLowerCase(), tag])).values()]
    : [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    tag: tagValue || null,
    tags,
    summary: row.summary,
    body: row.body,
    readTime: row.read_time,
    imageUrl: row.image_url,
    sliderImageUrl: row.slider_image_url,
    backgroundImageUrl: row.background_image_url,
    showOnHomepage: row.show_on_homepage,
    hideFromBlog: row.hide_from_blog,
    status: row.status,
    publishedAt: row.published_at,
    scheduledPublishAt: row.scheduled_publish_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatFeed(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    category: row.category,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatTask(row) {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    dueDate: row.due_date,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatFaq(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertSetting(sql, key, value, userId) {
  await sql`
    INSERT INTO admin_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES (${key}, ${value ?? null}, ${userId}, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `;
}

export function formatBlogPostProposal(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    suggestedTags: row.suggested_tags,
    attributionUsername: row.attribution_username,
    attributionDisplayName: row.attribution_display_name,
    attributionEmail: row.attribution_email,
    proposedImageUrl: row.proposed_image_url,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionExplanation: row.rejection_explanation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
