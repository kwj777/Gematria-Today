-- =============================================================================
-- Seed: SiteSeeker FAQ expansion
-- =============================================================================
-- Adds frequently asked questions covering tools, methodology, membership,
-- forum, editorial, and privacy topics. Safe to re-run: each row uses
-- INSERT ... ON CONFLICT (id) DO UPDATE so existing rows are updated in
-- place rather than duplicated.
--
-- Prerequisites:
--   * The `faqs` table must already exist (sql/admin_schema.sql applied at
--     least once).
--   * A `users` row with id = 'kevandmel' must exist (created by
--     admin_schema.sql). created_by references it.
--
-- All entries are seeded with is_published = TRUE so they appear immediately
-- on /faq.html and become eligible matches for SiteSeeker. Adjust sort_order
-- via the admin UI if you want them grouped differently inside their
-- categories (categories are auto-derived from question + answer text by
-- page-scripts/faq-1.js).
--
-- Usage:
--   psql "$DATABASE_URL" -f sql/seed_faqs.sql
-- =============================================================================

INSERT INTO faqs (id, question, answer, sort_order, is_published, created_by, updated_at)
VALUES
  (
    'seed-faq-calculator-vs-name-calculator-vs-pattern-grouping',
    'What''s the difference between the calculator, name calculator, and pattern grouping tool?',
    'The Calculator (/calculator.html) takes any word or phrase and returns its value under several English ciphers. The Name Calculator (/name-calculator.html) is tuned for personal names and side-by-side family or comparison analyses. The Pattern Grouping tool (/gematria-pattern-grouping.html) helps you cluster related terms by digital roots and base-root words so you can spot structural patterns across a themed set instead of evaluating isolated values.',
    100,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-which-ciphers-supported',
    'Which ciphers does the calculator support, and why those?',
    'The calculator supports the most widely cited English ciphers: English Ordinal (A=1, B=2 ... Z=26), Reverse Ordinal (A=26 ... Z=1), Reduction or Pythagorean (letters reduced to 1-9), Reverse Reduction, and English Gematria (multiples of six). Using more than one cipher is intentional: it prevents cherry-picking a single value that happens to fit and lets you check whether a relationship holds across systems.',
    101,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-reading-calculator-results',
    'How do I read the calculator results page?',
    'After you submit a phrase, the results page shows the value under each cipher, the digital root for each value, and a database match list — other words and phrases in our database that share the same total under the same cipher. The matches are evidence to evaluate, not conclusions; use multiple ciphers, digital roots, and base-root grouping to test whether a match holds up across the full picture.',
    102,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-digital-root',
    'What is a digital root, and when does it matter in gematria research?',
    'A digital root is the single digit you get by repeatedly summing the digits of a number — for example, the digital root of 137 is 1+3+7 = 11 → 1+1 = 2. It is not a replacement for the full value, but when a themed set of terms repeatedly shares the same digital root across different ciphers, that structural alignment is a useful checkpoint that raw totals alone would miss. The Pattern Grouping tool surfaces these alignments automatically.',
    103,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-meaningful-match-vs-coincidence',
    'How do I know if a gematria match is meaningful versus coincidence?',
    'A single match between two phrases is weak evidence — given how many common phrases exist, coincidences are very common. Stronger signals include: the match holds across multiple ciphers, related terms in the same theme produce the same or related values, the digital roots align, and base-root word groupings cluster around the same numbers. Method discipline matters far more than any individual hit; see the Methodology section of the FAQ and the disclaimer (/disclaimer.html) for the broader framing.',
    104,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-base-root-word-grouping',
    'What is base-root word grouping, and how do I use it?',
    'Base-root word grouping treats families of related words (a shared root plus variants like plurals, tenses, and compounds) as a single cluster and looks at how their values distribute. It reframes the question from "does this one word equal that one word?" to "does this theme consistently hit certain numbers?" The Pattern Grouping tool (/gematria-pattern-grouping.html) is built around this approach and lets you build clusters interactively.',
    105,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-why-english-gematria',
    'Why English gematria specifically — what about Hebrew or Greek?',
    'Hebrew gematria and Greek isopsephy are the historical originals, but most modern English-language names, titles, slogans, and institutions only exist in English. English ciphers are therefore the practical measuring layer for that material — they are reproducible, scalable, and let researchers compare names side by side. See /why-english-gematria.html for the longer explanation of the methodology and its tradeoffs.',
    106,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-premium-vs-free',
    'What is included in premium membership versus the free account?',
    'A free account lets you save searches, use the calculators, browse the FAQ and blog, and read public forum threads. Premium adds deeper antonym and synonym discovery, the ability to search the database by exact English gematria multiples of six, premium-only dataset statistics and trend spotlights, and access to the premium member forum. See /premium-research.html for the full feature list.',
    107,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-cancel-or-pause-subscription',
    'How do I cancel or pause my premium subscription?',
    'Sign in and open your member page (/member.html); subscription controls — including cancel — are in the billing section. Cancelling stops the next renewal but you keep premium access through the period you have already paid for. If you cannot find the option or need help, reach the team through /contact.html.',
    108,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-forgot-password',
    'I forgot my password or cannot log in — what do I do?',
    'Use the account recovery page (/account-recovery.html) to reset your password. You will need access to the email address on the account. If that email address is no longer reachable, contact us through /contact.html and we will help verify and recover the account manually.',
    109,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-export-saved-research',
    'Can I export my saved research and notes?',
    'Saved searches and notes attached to your account are exportable from the member page (/member.html). If you need a bulk export not available in the UI — for example, for offline analysis or migrating to your own spreadsheet — contact us through /contact.html and we will send a copy of your data.',
    110,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-forum-reputation-overview',
    'How does the forum reputation score work?',
    'Reputation is earned by posting, receiving upvotes, and contributing in other ways the community values; tiers unlock progressive privileges as you advance. The full scale, points table, and tier benefits are documented at /forum-reputation-scale.html.',
    111,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-forum-post-removed',
    'What gets a forum post removed?',
    'Posts may be removed for spam, harassment, hate speech, doxxing, illegal content, off-topic promotion, or repeated low-effort posting. Moderation decisions follow the site Terms of Use (/terms.html); if you believe a removal was incorrect, contact the admin team through /contact.html.',
    112,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-guest-forum-access',
    'Can guests read the forum without an account?',
    'Most public threads are readable without signing in. Posting, voting, building reputation, and accessing the premium member forum all require an account — and, for the premium forum, an active premium subscription.',
    113,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-gematria-vs-numerology',
    'Is gematria the same thing as numerology?',
    'No. Numerology typically uses single-digit reductions, birthdates, and personality-style interpretations. Gematria assigns numbers to letters of an alphabet so any word or phrase produces a value under a defined cipher — the focus is on word-to-number mapping under reproducible rules, not personal-trait readings. See /definitions.html for precise terminology.',
    114,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-predictive-claims',
    'Does the site claim these matches are predictive?',
    'No. As stated in our disclaimer (/disclaimer.html), gematria results reveal numerical relationships between words under defined letter-value systems. They do not prove factual claims, predict future events, identify hidden meanings with certainty, or establish causation. We treat the site as a research and educational tool, not a prediction service.',
    115,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-blog-fact-check-process',
    'How do you fact-check blog posts and other editorial content?',
    'Editorial posts go through internal review for source accuracy, cipher-math correctness, and adherence to the methodology described in our disclaimer. Numerical claims are recomputed before publication, and external claims are sourced. When a factual issue is found after publication we publish corrections rather than silently editing the original.',
    116,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-report-a-correction',
    'How do I report a correction or factual error?',
    'Use the contact page (/contact.html) and include the URL of the post or page, the specific claim or calculation in question, and what you believe the correct information is. For calculator-result issues, include the exact input text and the cipher you used so we can reproduce the result.',
    117,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-what-search-data-is-stored',
    'What do you store about my searches?',
    'For signed-in members, we store searches you explicitly save and any notes you attach to them. For all visitors we may log aggregated request metrics (page, timestamp, success/failure) used for site reliability and abuse prevention. Full details of what is collected, why, and your rights are in our Privacy Policy (/privacy.html).',
    118,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-data-sharing-third-parties',
    'Do you sell or share my data with third parties?',
    'We do not sell user data. Limited sharing with operational vendors — for example, hosting, payments, and analytics — happens only as needed to run the site, under contracts that restrict their use of that data. Specifics, including which categories of vendors are involved, are in our Privacy Policy (/privacy.html).',
    119,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-data-retention-after-cancellation',
    'How long is my account data kept after I cancel?',
    'Cancelling premium leaves your free account and saved data intact — you simply lose premium-only features at the end of the paid period. If you fully delete your account, profile data and saved searches are removed; some records (for example, payment receipts) may be retained for legal and accounting requirements as described in our Privacy Policy (/privacy.html).',
    120,
    TRUE,
    'kevandmel',
    NOW()
  )
ON CONFLICT (id)
DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  sort_order = EXCLUDED.sort_order,
  is_published = EXCLUDED.is_published,
  updated_at = NOW();
