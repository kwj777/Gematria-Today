-- =============================================================================
-- Seed: SiteSeeker FAQ expansion
-- =============================================================================
-- Adds frequently asked questions covering tools, methodology, membership,
-- forum, editorial, and privacy topics. Safe to re-run: each row uses
-- INSERT ... ON CONFLICT (id) DO UPDATE so existing rows are updated in
-- place rather than duplicated.
--
-- Re-running it also overwrites any edit an admin has made to these rows. To
-- correct a row that is already live, change it here AND add the edit to
-- netlify/functions/_seeded-content-corrections.mjs, which applies it once to
-- existing databases without touching passages an admin has rewritten.
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
    'What''s the difference between the calculator, the multi-cipher calculator, the name calculator, and pattern grouping?',
    'The Calculator (/calculator.html) takes any word or phrase and returns its English Gematria value (A=6, B=12 ... Z=156), its digital root, and the other words in our database that share that value; enter a multiple of six instead to list the words at that value. The Multi-Cipher Calculator (/multi-cipher-calculator.html) shows the same input under seven ciphers side by side. The Name Calculator (/name-calculator.html) is tuned for personal names and side-by-side family or comparison analyses. Pattern Grouping (/gematria-pattern-grouping.html) is a lesson in the learning path rather than a separate tool: it walks you through building a themed word set and grouping the calculator''s results so you can spot structural patterns across the set instead of evaluating isolated values.',
    100,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-which-ciphers-supported',
    'Which ciphers does the calculator support, and why those?',
    'The main calculator (/calculator.html) and the word database use one cipher, English Gematria, also called Sumerian: each letter''s position in the alphabet times six, A=6, B=12 ... Z=156. The Multi-Cipher Calculator (/multi-cipher-calculator.html) shows seven: English Ordinal (A=1 ... Z=26), Reverse Ordinal (A=26 ... Z=1), Full Reduction or Pythagorean (letters reduced to 1-9), Reverse Full Reduction, Sumerian (the same A=6 ... Z=156 table), Reverse Sumerian, and Jewish / Latin. Database matches are available only for the English Gematria (Sumerian) value. Comparing ciphers side by side is useful, but choose your cipher before you look at results: switching ciphers until a value fits is cherry-picking.',
    101,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-reading-calculator-results',
    'How do I read the calculator results page?',
    'After you submit a phrase, the results show its English Gematria total, its digital root, whether the total is a base root (a value on the 6, 60, 114, 168 ... ladder), and a database match list: other words and phrases in our database with the same total. The matches are evidence to evaluate, not conclusions; test whether related words match more often than unrelated ones (see /how-to-use-gematria.html) before reading anything into a match.',
    102,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-digital-root',
    'What is a digital root, and when does it matter in gematria research?',
    'A digital root is the single digit you get by repeatedly summing the digits of a number — for example, the digital root of 137 is 1+3+7 = 11 → 1+1 = 2. It is not a replacement for the full value. In English Gematria, the cipher the calculator uses, every total is a multiple of six, so its digital root can only be 3, 6 or 9, and two unrelated words share one about one time in three; use it to sort results, not as evidence. Ciphers such as English Ordinal on the Multi-Cipher Calculator (/multi-cipher-calculator.html) spread totals across all nine digital roots.',
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
    'Base-root word grouping treats families of related words (a shared root plus variants like plurals, tenses, and compounds) as a single cluster and looks at how their values distribute. It reframes the question from "does this one word equal that one word?" to "does this theme consistently hit certain numbers?" The Pattern Grouping lesson (/gematria-pattern-grouping.html) walks through this approach step by step; you build each cluster yourself by running its words through the calculator.',
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
    'A free account lets you save searches, use the calculators, browse the FAQ and blog, and read and post in the members'' forum. Premium adds deeper antonym and synonym discovery, premium-only dataset statistics and trend spotlights, and access to the premium forum categories. Looking up the words at an exact English Gematria value (any multiple of six) is free for everyone in the calculator (/calculator.html). See /premium-research.html for the full feature list.',
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
    'Your saved searches and the notes attached to them are listed on your member page (/member.html), and GemaBot chat sessions saved there can be downloaded as HTML, Markdown, plain text or JSON. Saved searches and notes have no export button yet; if you want a copy — for example, for offline analysis or to move them into your own spreadsheet — contact us through /contact.html and we will send you your data.',
    110,
    TRUE,
    'kevandmel',
    NOW()
  ),
  (
    'seed-faq-forum-reputation-overview',
    'How does the forum reputation score work?',
    'Reputation comes from posting: each thread you start earns 10 points and each reply 4, and there is no voting. When a moderator deletes a thread or reply, the points it earned are taken back, and deleting a thread also takes back the points for every reply in it. Reaching 50 points earns the Trusted badge and 200 the Sage badge; badges are recognition only and do not unlock extra permissions. The full points table and badge list are at /forum-reputation-scale.html.',
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
    'No. The forum is for signed-in members: reading, posting, and earning reputation all need a free account, which you can create at /member.html. The premium categories also need an active premium or lifetime membership.',
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
    'For signed-in members, we store searches you explicitly save and any notes you attach to them. A single word or short phrase you look up in the main Calculator is also added to the site''s shared word list, with no link to you, where other visitors can see it in reverse lookups and on word and value pages; names you enter in the Name Calculator are never added. For all visitors we keep short-lived request logs (page, timestamp, IP address, success/failure) used for site reliability and abuse prevention, along with the links and buttons you click if you have allowed analytics. Words you look up are recorded in those logs. Names you enter in the Name Calculator are not, although a logged click records the page address and the link clicked, which can contain a name, as a shared Name Calculator link or a name''s definition link does. Full details of what is collected, why, and your rights are in our Privacy Policy (/privacy.html).',
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
    'Cancelling premium leaves your free account and saved data intact — you simply lose premium-only features at the end of the paid period. There is no self-serve account deletion yet; to delete your account, contact us through /contact.html. When an account is deleted, profile data and saved searches are removed; some records (for example, payment receipts) may be retained for legal and accounting requirements as described in our Privacy Policy (/privacy.html).',
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
