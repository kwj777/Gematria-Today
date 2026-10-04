// Corrections to starter content that was published with factual errors: the
// English Gematria Cipher Atlas posts and the SiteSeeker FAQs. That content
// reaches a database through the psql seed files in sql/, and once it is there
// the admin owns it -- re-running a seed upserts every row and would revert the
// admin's edits -- so a correction cannot ship as a new seed run.
//
// Each edit instead replaces one seeded passage, and only where that exact
// passage is still in the row. A passage the admin has already rewritten is left
// alone, and so is everything else in the row. Each correction runs once, on the
// first cold start after it ships, and a content_correction:<id> marker in
// admin_settings records that (the same pattern as seeded_post:<id> in
// _admin.mjs), so a later cold start never re-applies an edit over a passage the
// admin has deliberately put back. The seed files in sql/ carry the corrected
// text too, so a freshly seeded database starts out correct and these edits find
// nothing to change there.
//
// An edit marked `note` adds a visible correction note to a post (the FAQ
// promises corrections are published, not made silently). It goes in only when
// one of the post's passages was actually corrected, and its `to` contains its
// `from`, so it is guarded against a second application by checking that the
// note is not already there.
export const CONTENT_CORRECTION_MARKER_PREFIX = 'content_correction:';

function atlasSeriesNav(postNumber) {
  return `<hr><p class="post-series-nav"><strong>Series — English Gematria Cipher Atlas (Post ${postNumber} of 8):</strong>`;
}

function atlasCorrectionNote(postNumber, text) {
  const seriesNav = atlasSeriesNav(postNumber);
  return {
    column: 'body',
    note: true,
    from: seriesNav,
    to: `<p><em>Correction (October 2026):</em> ${text}</p>${seriesNav}`,
  };
}

export const SEEDED_CONTENT_CORRECTIONS = [
  {
    id: 'cipher-atlas-full-reduction-2026-10',
    table: 'posts',
    rowId: 'post-english-gematria-cipher-atlas-full-reduction',
    edits: [
      {
        column: 'body',
        from: '<li><strong>Cross-cipher reconciliation.</strong> Because the reduction of a Simple Ordinal total equals the Full Reduction total of the same word, you can check consistency between the two ciphers as you go.</li>',
        to: '<li><strong>Cross-cipher reconciliation.</strong> Every letter\'s Full Reduction value is its Simple Ordinal value minus a multiple of 9 (J to R lose 9, S to Z lose 18), so a word\'s Full Reduction total always has the same digital root as its Simple Ordinal total. The totals themselves usually differ — ENGLISH is 74 in Simple Ordinal and 38 in Full Reduction, and both reduce to 2 — but a digital root that does not agree tells you a letter was miscounted.</li>',
      },
      {
        column: 'body',
        from: '<li>Reporting "matches in two ciphers!" when both ciphers are Simple Ordinal and Full Reduction of the same word. The second is computable from the first, so the "second match" is no extra evidence.</li>',
        to: '<li>Reporting "matches in two ciphers!" when the two ciphers are Simple Ordinal and Full Reduction. They are not independent: two words with the same Simple Ordinal total always share a Full Reduction digital root, so their Full Reduction totals line up far more often than two unrelated ciphers would. Count the second match as weak support, not a second source.</li>',
      },
      atlasCorrectionNote(3, 'An earlier version of this post said that reducing a word\'s Simple Ordinal total gives its Full Reduction total, and that a Full Reduction match is computable from the Simple Ordinal one. Only the digital roots always agree; the totals depend on which letters the word uses. The two affected points in sections 4 and 7 have been corrected.'),
    ],
  },
  {
    id: 'cipher-atlas-reverse-full-reduction-2026-10',
    table: 'posts',
    rowId: 'post-english-gematria-cipher-atlas-reverse-full-reduction',
    edits: [
      {
        column: 'body',
        from: 'Because Reverse Full Reduction is highly compressed (only nine possible per-letter values, three of them — 8, 4, 1 — appearing three times each), short-word collisions in this cipher are very common.',
        to: 'Because Reverse Full Reduction is highly compressed (only nine possible per-letter values: each digit from 1 to 8 stands for three letters, and 9 for just two, I and R), short-word collisions in this cipher are very common.',
      },
      {
        column: 'body',
        from: 'Within the matrix, the four ciphers are not independent. Reverse Ordinal is fully determined by Simple Ordinal plus letter count (covered in Post 2). Full Reduction is the digital-root of Simple Ordinal per letter (covered in Post 3). Reverse Full Reduction is the digital-root of Reverse Ordinal per letter — so it is determined by the same two ingredients, Simple Ordinal totals and letter count, with one extra digit-sum operation at each letter.</p>',
        to: 'Within the matrix, the four ciphers are not independent, but they are not interchangeable either. Reverse Ordinal is fully determined by Simple Ordinal plus letter count (covered in Post 2). Full Reduction is the digital root of Simple Ordinal per letter (covered in Post 3), and that is not a function of the Simple Ordinal total: AS, BR and CQ all total 20 in Simple Ordinal but 2, 11 and 11 in Full Reduction, because each letter from J to R loses 9 and each letter from S to Z loses 18. Only the digital root carries over — a word\'s Full Reduction total always reduces to the same digit as its Simple Ordinal total. Reverse Full Reduction is the digital root of Reverse Ordinal per letter, and it mirrors Full Reduction letter by letter: a letter\'s two reduced values add to 9, except for I and R, which are 9 in both. So the Reverse Full Reduction total follows from the Full Reduction total, the letter count and the number of I\'s and R\'s; the same three words give 16, 16 and 7.</p>',
      },
      {
        column: 'body',
        from: '<p>That means the "base four" matrix is really a single underlying calculation seen through four lenses. It is still useful',
        to: '<p>That means the "base four" matrix is two tightly linked pairs rather than four separate measurements: the two uncompressed ciphers move in lockstep, and the two compressed ciphers largely mirror each other while adding only coarse facts about where in the alphabet a word\'s letters fall. It is still useful',
      },
      atlasCorrectionNote(4, 'An earlier version of this post said that Reverse Full Reduction is determined by the Simple Ordinal total and letter count, and that only 8, 4 and 1 each stand for three letters. Neither was right: the reduced totals depend on which letters a word uses, and every digit from 1 to 8 stands for three letters. Sections 1 and 2 have been corrected.'),
    ],
  },
  {
    id: 'cipher-atlas-baconian-2026-10',
    table: 'posts',
    rowId: 'post-english-gematria-cipher-atlas-baconian',
    edits: [
      {
        column: 'summary',
        from: 'This post explains the construction, the Simple-versus-Kaye variants, and the Friedmans\' demolition of Baconian overreading.',
        to: 'This post explains the construction, the Simple and Kaye count ciphers often filed under its name, and the Friedmans\' demolition of Baconian overreading.',
      },
      {
        column: 'body',
        from: '<h3>2) Simple Bacon vs Kaye Bacon</h3><p>Two related tables circulate under "Baconian cipher." They are easy to confuse and produce different decoded outputs.</p><ul><li><strong>Simple Bacon</strong> follows Bacon\'s original 24-letter alphabet, treating I = J and U = V. Twenty-four letters fit cleanly into five binary places (2⁵ = 32 codes, of which 24 are used). This is the historically correct form.</li><li><strong>Kaye Bacon</strong> (after the modern variant sometimes attributed to John Kaye) uses a full 26-letter alphabet with distinct codes for I, J, U, and V. The same five-place binary structure is retained, but the per-letter codes from J onward differ from Simple Bacon.</li></ul><p>Both tables are internally consistent. The difference matters because a hidden message decoded with Simple Bacon will produce a different (and usually nonsensical) result if decoded with Kaye Bacon, and vice versa. Researchers should always name which variant they are using.</p>',
        to: '<h3>2) Simple and Kaye: count ciphers, not biliteral variants</h3><p>Calculator menus often list "Simple" and "Kaye" (also spelled Kay) as two forms of the Baconian cipher. They are not versions of the biliteral a/b code at all. They are <em>count ciphers</em> — additive letter-number tables like the other ciphers in this Atlas — which Baconian researchers used to look for numeric "signatures" of Bacon\'s name in Elizabethan texts. Both use the same 24-letter alphabet as the biliteral cipher, with I = J and U = V:</p><ul><li><strong>Simple cipher:</strong> A = 1, B = 2 … I/J = 9, K = 10 … U/V = 20, W = 21, X = 22, Y = 23, Z = 24. BACON = 2 + 1 + 3 + 14 + 13 = <strong>33</strong>.</li><li><strong>Kaye cipher:</strong> K = 10, L = 11 … U/V = 20 … Z = 24, then A = 27, B = 28 … I/J = 35. The letters from K onward keep their Simple values; the first nine jump to 27–35, skipping 25 and 26. BACON = 28 + 27 + 29 + 14 + 13 = <strong>111</strong>.</li></ul><p>So a "Baconian total" does exist in this narrow sense: it is a Simple or Kaye count, and it should be named as one, because the two give different totals for the same word. What has no total is the biliteral cipher itself. That cipher does have a variant of its own: a 26-letter table that gives I, J, U and V separate codes. A message encoded with one table will not decode correctly with the other, so name that choice too.</p>',
      },
      {
        column: 'body',
        from: '<li><strong>Anything additive.</strong> The cipher produces no numeric total. Listing a "Baconian value" alongside Simple Ordinal or Jewish / Latin totals is a category error.</li>',
        to: '<li><strong>Anything additive.</strong> The biliteral cipher produces no numeric total. A "Baconian value" listed alongside Simple Ordinal or Jewish / Latin totals is really a Simple or Kaye count, and should be labelled as one rather than as the output of Bacon\'s cipher.</li>',
      },
      {
        column: 'body',
        from: '<li>Citing a "Baconian total" for a word. There is no such thing; the cipher produces a sequence of a/b characters, not a number.</li><li>Mixing Simple Bacon and Kaye Bacon decodings within the same analysis without naming the variant. The two tables produce different decoded text.</li>',
        to: '<li>Citing a "Baconian total" without naming the cipher. The biliteral cipher produces a sequence of a/b characters, not a number; a Baconian number is a Simple or Kaye count, and the two disagree (BACON is 33 in Simple and 111 in Kaye).</li><li>Treating Simple and Kaye as versions of the biliteral code, or mixing 24-letter and 26-letter biliteral decodings without naming the table. Simple and Kaye are count ciphers, and the two biliteral tables produce different decoded text.</li>',
      },
      atlasCorrectionNote(7, 'An earlier version of this post described Simple and Kaye as two forms of the biliteral a/b code and said there is no such thing as a Baconian total. Simple and Kaye are additive count ciphers that do produce totals; sections 2, 6 and 7 have been corrected.'),
    ],
  },
  {
    id: 'cipher-atlas-choosing-and-combining-2026-10',
    table: 'posts',
    rowId: 'post-english-gematria-cipher-atlas-choosing-and-combining',
    edits: [
      {
        column: 'body',
        from: '<h3>1) Dependent ciphers — one calculation seen multiple ways</h3><p>From the previous posts, three of the standard menu ciphers are deterministic transforms of Simple Ordinal:</p>',
        to: '<h3>1) Dependent ciphers — tied closely to Simple Ordinal</h3><p>From the previous posts, four of the standard menu ciphers are tied closely to Simple Ordinal, though not all in the same way:</p>',
      },
      {
        column: 'body',
        from: '<li><strong>Full Reduction</strong> = per-letter digital root of Simple Ordinal. Computable from Simple Ordinal alone.</li>',
        to: '<li><strong>Full Reduction</strong> = per-letter digital root of Simple Ordinal. Not computable from the Simple Ordinal total: Full Reduction = Simple Ordinal − 9 × (letters from J to R) − 18 × (letters from S to Z), so it depends on the letter mix. Only its digital root is fixed by Simple Ordinal.</li>',
      },
      {
        column: 'body',
        from: '<li><strong>Reverse Full Reduction</strong> = per-letter digital root of Reverse Ordinal. Computable from Simple Ordinal plus letter count.</li>',
        to: '<li><strong>Reverse Full Reduction</strong> = per-letter digital root of Reverse Ordinal. It mirrors Full Reduction: (9 × letter count) − Full Reduction + (9 × the number of I\'s and R\'s). Like Full Reduction, only its digital root is fixed by Simple Ordinal.</li>',
      },
      {
        column: 'body',
        from: '<p>These four derived ciphers carry no information that Simple Ordinal plus letter count does not already carry. They make different patterns <em>visible</em>, which is genuinely useful, but they do not add independent evidence. Reporting "matches in five ciphers" when those five are Simple Ordinal, Reverse Ordinal, Full Reduction, Reverse Full Reduction, and English Sumerian is reporting one match five times.</p>',
        to: '<p>Reverse Ordinal and English Sumerian carry no information that Simple Ordinal plus letter count does not already carry. Full Reduction and Reverse Full Reduction add a little — a coarse count of how many of a word\'s letters sit in the later rows of the alphabet — but far less than their separate menu entries suggest. All four make different patterns <em>visible</em>, which is genuinely useful, but they do not add independent evidence. Reporting "matches in five ciphers" when those five are Simple Ordinal, Reverse Ordinal, Full Reduction, Reverse Full Reduction, and English Sumerian is reporting one match and four dependent echoes of it.</p>',
      },
      {
        column: 'body',
        from: 'The profile carries no more information than (74, 7-letter count) but it is easier for human readers to spot resonance across four cells than to mentally derive the other three from one.',
        to: 'The first two cells carry no more information than (74, 7-letter count), and the last two are tied to them — 38 reduces to 2, as 74 does, and 34 is the mirror of 38 for a seven-letter word with one I — but it is easier for human readers to spot resonance across four cells than to work out those relationships in their heads.',
      },
      {
        column: 'body',
        from: 'The two ciphers are mathematically independent. A match across both',
        to: 'Neither total can be derived from the other, though the two always share a digital root. A match across both',
      },
      {
        column: 'body',
        from: '<li>"Matches in all four base ciphers." One match, four views.</li>',
        to: '<li>"Matches in all four base ciphers." One source, four views: the Reverse Ordinal match follows automatically from the Simple Ordinal one (the words must be the same length), and the two reduction matches add only coarse facts about letter placement.</li>',
      },
      {
        column: 'body',
        from: '<li>"Baconian total of 444." Not a thing; Baconian produces a/b sequences, not totals.</li>',
        to: '<li>"Baconian total of 444." Meaningless until the cipher is named: Bacon\'s biliteral cipher produces a/b sequences, not totals, and the Simple and Kaye count ciphers give different numbers for the same word.</li>',
      },
      {
        column: 'body',
        from: '<li><strong>Steganographic decoding:</strong> Baconian (Simple or Kaye variant, named explicitly).</li>',
        to: '<li><strong>Steganographic decoding:</strong> Baconian biliteral (24-letter or 26-letter table, named explicitly).</li>',
      },
      atlasCorrectionNote(8, 'An earlier version of this post said that Full Reduction and Reverse Full Reduction can be computed from the Simple Ordinal total and letter count, that Simple Ordinal and Jewish / Latin are mathematically independent, and that the Simple and Kaye Baconian ciphers produce no totals. None of those was right; sections 1, 2, 5, 6 and 7 have been corrected.'),
    ],
  },
  {
    id: 'faq-calculator-vs-name-calculator-vs-pattern-grouping-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-calculator-vs-name-calculator-vs-pattern-grouping',
    edits: [
      {
        column: 'question',
        from: 'What\'s the difference between the calculator, name calculator, and pattern grouping tool?',
        to: 'What\'s the difference between the calculator, the multi-cipher calculator, the name calculator, and pattern grouping?',
      },
      {
        column: 'answer',
        from: 'The Calculator (/calculator.html) takes any word or phrase and returns its value under several English ciphers. The Name Calculator (/name-calculator.html) is tuned for personal names and side-by-side family or comparison analyses. The Pattern Grouping tool (/gematria-pattern-grouping.html) helps you cluster related terms by digital roots and base-root words so you can spot structural patterns across a themed set instead of evaluating isolated values.',
        to: 'The Calculator (/calculator.html) takes any word or phrase and returns its English Gematria value (A=6, B=12 ... Z=156), its digital root, and the other words in our database that share that value; enter a multiple of six instead to list the words at that value. The Multi-Cipher Calculator (/multi-cipher-calculator.html) shows the same input under seven ciphers side by side. The Name Calculator (/name-calculator.html) is tuned for personal names and side-by-side family or comparison analyses. Pattern Grouping (/gematria-pattern-grouping.html) is a lesson in the learning path rather than a separate tool: it walks you through building a themed word set and grouping the calculator\'s results so you can spot structural patterns across the set instead of evaluating isolated values.',
      },
    ],
  },
  {
    id: 'faq-which-ciphers-supported-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-which-ciphers-supported',
    edits: [
      {
        column: 'answer',
        from: 'The calculator supports the most widely cited English ciphers: English Ordinal (A=1, B=2 ... Z=26), Reverse Ordinal (A=26 ... Z=1), Reduction or Pythagorean (letters reduced to 1-9), Reverse Reduction, and English Gematria (multiples of six). Using more than one cipher is intentional: it prevents cherry-picking a single value that happens to fit and lets you check whether a relationship holds across systems.',
        to: 'The main calculator (/calculator.html) and the word database use one cipher, English Gematria, also called Sumerian: each letter\'s position in the alphabet times six, A=6, B=12 ... Z=156. The Multi-Cipher Calculator (/multi-cipher-calculator.html) shows seven: English Ordinal (A=1 ... Z=26), Reverse Ordinal (A=26 ... Z=1), Full Reduction or Pythagorean (letters reduced to 1-9), Reverse Full Reduction, Sumerian (the same A=6 ... Z=156 table), Reverse Sumerian, and Jewish / Latin. Database matches are available only for the English Gematria (Sumerian) value. Comparing ciphers side by side is useful, but choose your cipher before you look at results: switching ciphers until a value fits is cherry-picking.',
      },
    ],
  },
  {
    id: 'faq-reading-calculator-results-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-reading-calculator-results',
    edits: [
      {
        column: 'answer',
        from: 'After you submit a phrase, the results page shows the value under each cipher, the digital root for each value, and a database match list — other words and phrases in our database that share the same total under the same cipher. The matches are evidence to evaluate, not conclusions; use multiple ciphers, digital roots, and base-root grouping to test whether a match holds up across the full picture.',
        to: 'After you submit a phrase, the results show its English Gematria total, its digital root, whether the total is a base root (a value on the 6, 60, 114, 168 ... ladder), and a database match list: other words and phrases in our database with the same total. The matches are evidence to evaluate, not conclusions; test whether related words match more often than unrelated ones (see /how-to-use-gematria.html) before reading anything into a match.',
      },
    ],
  },
  {
    id: 'faq-digital-root-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-digital-root',
    edits: [
      {
        column: 'answer',
        from: 'It is not a replacement for the full value, but when a themed set of terms repeatedly shares the same digital root across different ciphers, that structural alignment is a useful checkpoint that raw totals alone would miss. The Pattern Grouping tool surfaces these alignments automatically.',
        to: 'It is not a replacement for the full value. In English Gematria, the cipher the calculator uses, every total is a multiple of six, so its digital root can only be 3, 6 or 9, and two unrelated words share one about one time in three; use it to sort results, not as evidence. Ciphers such as English Ordinal on the Multi-Cipher Calculator (/multi-cipher-calculator.html) spread totals across all nine digital roots.',
      },
    ],
  },
  {
    id: 'faq-base-root-word-grouping-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-base-root-word-grouping',
    edits: [
      {
        column: 'answer',
        from: 'The Pattern Grouping tool (/gematria-pattern-grouping.html) is built around this approach and lets you build clusters interactively.',
        to: 'The Pattern Grouping lesson (/gematria-pattern-grouping.html) walks through this approach step by step; you build each cluster yourself by running its words through the calculator.',
      },
    ],
  },
  {
    id: 'faq-premium-vs-free-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-premium-vs-free',
    edits: [
      {
        column: 'answer',
        from: 'A free account lets you save searches, use the calculators, browse the FAQ and blog, and read public forum threads. Premium adds deeper antonym and synonym discovery, the ability to search the database by exact English gematria multiples of six, premium-only dataset statistics and trend spotlights, and access to the premium member forum. See /premium-research.html for the full feature list.',
        to: 'A free account lets you save searches, use the calculators, browse the FAQ and blog, and read and post in the members\' forum. Premium adds deeper antonym and synonym discovery, premium-only dataset statistics and trend spotlights, and access to the premium forum categories. Looking up the words at an exact English Gematria value (any multiple of six) is free for everyone in the calculator (/calculator.html). See /premium-research.html for the full feature list.',
      },
    ],
  },
  {
    id: 'faq-export-saved-research-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-export-saved-research',
    edits: [
      {
        column: 'answer',
        from: 'Saved searches and notes attached to your account are exportable from the member page (/member.html). If you need a bulk export not available in the UI — for example, for offline analysis or migrating to your own spreadsheet — contact us through /contact.html and we will send a copy of your data.',
        to: 'Your saved searches and the notes attached to them are listed on your member page (/member.html), and GemaBot chat sessions saved there can be downloaded as HTML, Markdown, plain text or JSON. Saved searches and notes have no export button yet; if you want a copy — for example, for offline analysis or to move them into your own spreadsheet — contact us through /contact.html and we will send you your data.',
      },
    ],
  },
  {
    id: 'faq-forum-reputation-overview-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-forum-reputation-overview',
    edits: [
      {
        column: 'answer',
        from: 'Reputation is earned by posting, receiving upvotes, and contributing in other ways the community values; tiers unlock progressive privileges as you advance. The full scale, points table, and tier benefits are documented at /forum-reputation-scale.html.',
        to: 'Reputation comes from posting: each thread you start earns 10 points and each reply 4. Points are never deducted, and there is no voting. Reaching 50 points earns the Trusted badge and 200 the Sage badge; badges are recognition only and do not unlock extra permissions. The full points table and badge list are at /forum-reputation-scale.html.',
      },
    ],
  },
  {
    id: 'faq-guest-forum-access-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-guest-forum-access',
    edits: [
      {
        column: 'answer',
        from: 'Most public threads are readable without signing in. Posting, voting, building reputation, and accessing the premium member forum all require an account — and, for the premium forum, an active premium subscription.',
        to: 'No. The forum is for signed-in members: reading, posting, and earning reputation all need a free account, which you can create at /member.html. The premium categories also need an active premium or lifetime membership.',
      },
    ],
  },
  {
    id: 'faq-data-retention-after-cancellation-2026-10',
    table: 'faqs',
    rowId: 'seed-faq-data-retention-after-cancellation',
    edits: [
      {
        column: 'answer',
        from: 'If you fully delete your account, profile data and saved searches are removed;',
        to: 'There is no self-serve account deletion yet; to delete your account, contact us through /contact.html. When an account is deleted, profile data and saved searches are removed;',
      },
    ],
  },
];

// Tagged-template SQL cannot take a table or column name as a parameter, so
// each column a correction can touch has its own statement. The two STRPOS
// guards make every edit idempotent: it runs only while the seeded passage is
// still there and the corrected text is not.
async function applyContentEdit(sql, table, rowId, { column, from, to }) {
  if (table === 'posts' && column === 'body') {
    return sql`
      UPDATE posts
      SET body = REPLACE(body, ${from}::text, ${to}::text), updated_at = NOW()
      WHERE id = ${rowId}
        AND STRPOS(body, ${from}::text) > 0
        AND STRPOS(body, ${to}::text) = 0
      RETURNING id
    `;
  }
  if (table === 'posts' && column === 'summary') {
    return sql`
      UPDATE posts
      SET summary = REPLACE(summary, ${from}::text, ${to}::text), updated_at = NOW()
      WHERE id = ${rowId}
        AND STRPOS(summary, ${from}::text) > 0
        AND STRPOS(summary, ${to}::text) = 0
      RETURNING id
    `;
  }
  if (table === 'faqs' && column === 'question') {
    return sql`
      UPDATE faqs
      SET question = REPLACE(question, ${from}::text, ${to}::text), updated_at = NOW()
      WHERE id = ${rowId}
        AND STRPOS(question, ${from}::text) > 0
        AND STRPOS(question, ${to}::text) = 0
      RETURNING id
    `;
  }
  if (table === 'faqs' && column === 'answer') {
    return sql`
      UPDATE faqs
      SET answer = REPLACE(answer, ${from}::text, ${to}::text), updated_at = NOW()
      WHERE id = ${rowId}
        AND STRPOS(answer, ${from}::text) > 0
        AND STRPOS(answer, ${to}::text) = 0
      RETURNING id
    `;
  }
  throw new Error(`No content correction statement for ${table}.${column}`);
}

export async function applySeededContentCorrectionsOnce(sql, corrections = SEEDED_CONTENT_CORRECTIONS) {
  const markerKeys = corrections.map((correction) => `${CONTENT_CORRECTION_MARKER_PREFIX}${correction.id}`);
  const markerRows = await sql`
    SELECT setting_key
    FROM admin_settings
    WHERE setting_key = ANY(${markerKeys})
  `;
  const appliedMarkerKeys = new Set(markerRows.map((row) => row.setting_key));

  for (const correction of corrections) {
    const markerKey = `${CONTENT_CORRECTION_MARKER_PREFIX}${correction.id}`;
    if (appliedMarkerKeys.has(markerKey)) {
      continue;
    }

    let correctedPassages = 0;
    for (const edit of correction.edits) {
      if (edit.note && correctedPassages === 0) {
        continue;
      }
      const updatedRows = await applyContentEdit(sql, correction.table, correction.rowId, edit);
      if (!edit.note) {
        correctedPassages += updatedRows.length;
      }
    }

    await sql`
      INSERT INTO admin_settings (setting_key, setting_value, updated_at)
      VALUES (${markerKey}, ${correctedPassages ? 'corrected' : 'no_match'}, NOW())
      ON CONFLICT (setting_key) DO NOTHING
    `;
  }
}
