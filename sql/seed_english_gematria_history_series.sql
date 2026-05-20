-- =============================================================================
-- Seed: "History of English Gematria" — 6-part draft blog series
-- =============================================================================
-- Standalone migration extracted from sql/admin_schema.sql. Safe to re-run:
-- every block uses INSERT ... ON CONFLICT (id) DO UPDATE, so existing rows
-- are updated in place rather than duplicated.
--
-- Prerequisites:
--   * The `posts` table must already exist (i.e. sql/admin_schema.sql has
--     been applied at least once previously).
--   * A `users` row with id = 'kevandmel' must exist (created by
--     admin_schema.sql). created_by references it.
--
-- Posts are seeded with status = 'draft' and show_on_homepage = FALSE; they
-- will not appear on the public blog until promoted to 'published' via the
-- admin UI (or by updating the status column directly).
--
-- Usage:
--   psql "$DATABASE_URL" -f sql/seed_english_gematria_history_series.sql
-- =============================================================================

-- =============================================================================
-- Draft series: "History of English Gematria" (6 posts)
-- Seeded as drafts (status = 'draft'). Sourced from the editorial brief
-- "History of English Gematria" and intended for editorial review before
-- publication. Each post links to the next via a series footer.
-- =============================================================================

INSERT INTO posts (
  id,
  title,
  slug,
  tag,
  summary,
  body,
  read_time,
  image_url,
  slider_image_url,
  background_image_url,
  show_on_homepage,
  hide_from_blog,
  status,
  published_at,
  created_by
)
VALUES (
  'post-history-of-english-gematria-overview',
  'History of English Gematria — An Overview',
  'history-of-english-gematria-overview',
  'History, English Gematria',
  'A six-part series opener: English gematria is not one inherited system but a family of practices stitched together from Hebrew and Greek roots, Renaissance cabala, Victorian occultism, Thelema, and modern calculator culture.',
  '<p>This post opens a six-part series on the history of <a href="/why-english-gematria.html">English gematria</a>. The series treats the subject as a problem in intellectual history: how did letter-number practices that originated in Hebrew and Greek become the modular menu of "ciphers" you now find on calculator websites?</p><p>The short answer is that English gematria is not one inherited system but a layered family of practices. Older Hebrew and Greek letter-number methods were adapted, translated, imitated, or reinvented as they passed through Latin Christian cabala, Victorian occultism, twentieth-century Thelema, and finally internet calculator culture. Each transfer added something — and reshaped what came before.</p><h3>1) Not one system, but five families</h3><p>Modern websites place ordinal, Sumerian, "Jewish," Bacon, and English Qaballa side by side, but these do not belong to the same intellectual genre. The systems usually grouped under "English gematria" come from at least five different lineages:</p><ul><li><strong>Transliteration methods.</strong> English words are rewritten in Hebrew or Greek and then valued in those alphabets. This is how Christian numerology around <em>Iesous</em> = 888 and Nero/666 actually works historically.</li><li><strong>Direct alphabetic systems.</strong> The English alphabet is numbered in order, either as A=1 to Z=26 (ordinal) or reduced to 1–9 by digital root (full reduction). These are straightforward alphabetic-numerological transforms.</li><li><strong>Symbolic reassignment.</strong> Late nineteenth- and early twentieth-century systems such as Cheiro''s "Chaldean" name-number scheme break with sequence and assign values by occult symbolism rather than alphabet order.</li><li><strong>Latinized or cabalistic reconstructions.</strong> Modern calculator labels such as "Agrippa," "Jewish," or "Latin" descend from Renaissance Christian cabala but are often modernized well beyond what Agrippa himself printed.</li><li><strong>Non-additive ciphers and permuted alphabets.</strong> Francis Bacon''s biliteral cipher is a cipher rather than a summing gematria. Thelemic English Qaballa is a deliberately permuted alphabet, not a direct continuation of rabbinic practice.</li></ul><h3>2) Four turning points</h3><p>The history compresses, with some loss, into four turning points:</p><ol><li><strong>Renaissance Christian cabala.</strong> Heinrich Cornelius Agrippa and other occult philosophers made Hebrew-style letter mysticism available in Latin Europe and argued that non-Hebrew alphabets could be read through celestial, numerical, and symbolic correspondences.</li><li><strong>The Victorian and Edwardian occult revival.</strong> Figures such as S. L. MacGregor Mathers, A. E. Waite, and Cheiro translated Kabbalah into English esoteric culture and turned name-number analysis into mass-market practice.</li><li><strong>Thelemic English Qaballa.</strong> In the late twentieth century, interpreters of Aleister Crowley''s <em>Book of the Law</em> generated specifically English permuted qabalistic systems such as ALW.</li><li><strong>The calculator era.</strong> In the twenty-first century, online calculators and communities stabilized a menu of "ciphers" that mixed historical material with recent inventions. This is why contemporary discussions often flatten very different practices into a single category.</li></ol><h3>3) Why the distinction matters</h3><p>The phrase "English gematria" now functions as an umbrella term. That is fine as a usage category but weak as a single historical lineage. Treating ordinal, "Sumerian" (ordinal × 6), Cheiro-style Chaldean, and English Qaballa as if they all preserve the same ancient tradition misreads the evidence — and tends to overstate what any one match can prove.</p><p>The rest of this series unpacks each stage in turn: the ancient Hebrew and Greek foundations; the Renaissance bridge through Agrippa and Bacon; the Victorian English-language expansion; Thelema and the calculator era; and the methodological cautions that scholars of religion, cryptology, and psychology have raised throughout.</p><hr><p class="post-series-nav"><strong>Series — History of English Gematria (Post 1 of 6):</strong> You are reading the introduction. Next: <a href="/blog.html?post=english-gematria-ancient-foundations-hebrew-greek#english-gematria-ancient-foundations-hebrew-greek">Ancient Foundations — Hebrew Gematria and Greek Isopsephy</a>.</p>',
  '4 minute read',
  '/assets/english-gematria-history-overview-hero-16x9.svg',
  '/assets/english-gematria-history-overview-hero-16x9.svg',
  '/assets/english-gematria-history-overview-hero-16x9.svg',
  FALSE,
  FALSE,
  'draft',
  NULL,
  'kevandmel'
)
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  tag = EXCLUDED.tag,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  read_time = EXCLUDED.read_time,
  image_url = EXCLUDED.image_url,
  slider_image_url = EXCLUDED.slider_image_url,
  background_image_url = EXCLUDED.background_image_url,
  show_on_homepage = EXCLUDED.show_on_homepage,
  hide_from_blog = EXCLUDED.hide_from_blog,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  updated_at = NOW();

INSERT INTO posts (
  id,
  title,
  slug,
  tag,
  summary,
  body,
  read_time,
  image_url,
  slider_image_url,
  background_image_url,
  show_on_homepage,
  hide_from_blog,
  status,
  published_at,
  created_by
)
VALUES (
  'post-english-gematria-ancient-foundations-hebrew-greek',
  'Ancient Foundations — Hebrew Gematria and Greek Isopsephy',
  'english-gematria-ancient-foundations-hebrew-greek',
  'History, Ancient Sources',
  'Post 2 of 6. The conceptual template for English gematria was complete long before English existed: letters that were already numerals, rabbinic exegesis, and Greek isopsephic examples such as Iesous = 888.',
  '<p>This is the second post in a six-part series on the history of <a href="/why-english-gematria.html">English gematria</a>. The previous post made the case that English gematria is not one inherited system but a family of practices with several genealogies. This post turns to the deepest root of that family: ancient Hebrew gematria and Greek isopsephy.</p><p>The conceptual template was already complete long before any specifically English system existed. Early English-speaking readers who wanted alphabetic number symbolism inherited not a native practice but a Hebrew-and-Greek precedent, mediated by translation, commentary, and church tradition.</p><h3>1) Letters that were already numerals</h3><p>In Hebrew and Greek, letters served simultaneously as numerals. Assigning values to words was not an extra layer added on top of writing; it was the natural reading of a script that already counted. <em>Sefer Yetzirah</em> describes creation through 22 letters and 10 sefirot, treating letters and numbers as structurally significant elements of creation and exegesis. Medieval Kabbalists made gematria a favored method of interpretation, and the rabbinic literature preserves explicit calculations such as <em>ha-satan</em> = 364 (Yoma 20a).</p><p>Strictly speaking, gematria is the assignment of numerical values to letters so that words and phrases can be interpreted through their totals. In the classical sense, this applies most naturally to alphabets that also served as numeral systems.</p><h3>2) Greek isopsephy and Christian numerology</h3><p>Greek isopsephy is the parallel practice in Greek. Christian scripture made calculation an explicit invitation: Revelation 13:18 famously asks the reader to "calculate" the number of the beast. Modern scholarship broadly links 666 / 616 to Nero through gematria — the latter variant emerges when a slightly different transliteration of Nero''s name into Hebrew letters is summed.</p><p>Christian numerology also preserved Greek isopsephic examples such as <em>Iesous</em> = 888 (Ι + η + σ + ο + υ + ς = 10 + 8 + 200 + 70 + 400 + 200). These calculations matter to the history of English gematria because they show that the famous Christian "number" examples around Jesus and the beast belong historically to Greek and Hebrew, not to native English letter-value systems.</p><h3>3) What English speakers actually inherited</h3><p>This is a useful place to be precise. The English alphabet did not arrive with a built-in numeric tradition. What English-speaking readers inherited was not a working English gematria but three things:</p><ul><li>A <strong>conceptual template</strong> — letters carry numbers, and interpreters can read meaning through totals.</li><li>A <strong>set of canonical examples</strong> — <em>ha-satan</em> = 364, Neron Caesar = 666, <em>Iesous</em> = 888.</li><li>A <strong>prestige source</strong> — Kabbalah, which would later authorize occult writers who wanted to extend letter mysticism into other languages.</li></ul><p>Whenever later English systems wanted authority, they almost always looked back to this layer first. That is why every move into Latin and English alphabets — Agrippa, the Victorian occultists, even modern calculator labels such as "Jewish" or "Hebrew" — frames itself as an extension of Hebrew or Greek precedent rather than an independent invention.</p><h3>4) Transliteration as the first English method</h3><p>One method that did transfer cleanly into English-language practice is transliteration. An English word is rewritten in Hebrew or Greek and then valued in that alphabet. There is no fixed English mapping in this method; the calculation always happens in the older script. This is the technique behind the Nero / 666 identification, behind the <em>Iesous</em> = 888 example, and behind a great deal of biblical numerology that continues to circulate in English-speaking Christian commentary.</p><p>Transliteration matters because it shows what is and is not "English" about English gematria. The reading is done in English; the calculation is done in Hebrew or Greek. Later native-English systems would have to decide whether to keep that older arithmetic or to invent fresh letter-value tables on English directly. The next post in this series takes up that decision through the figure who first formalized it: Agrippa.</p><hr><p class="post-series-nav"><strong>Series — History of English Gematria (Post 2 of 6):</strong> Previous: <a href="/blog.html?post=history-of-english-gematria-overview#history-of-english-gematria-overview">History of English Gematria — An Overview</a>. Next: <a href="/blog.html?post=english-gematria-renaissance-agrippa-bacon#english-gematria-renaissance-agrippa-bacon">Renaissance Crossroads — Agrippa and the Baconian Cipher</a>.</p>',
  '5 minute read',
  '/assets/english-gematria-ancient-foundations-hero-16x9.svg',
  '/assets/english-gematria-ancient-foundations-hero-16x9.svg',
  '/assets/english-gematria-ancient-foundations-hero-16x9.svg',
  FALSE,
  FALSE,
  'draft',
  NULL,
  'kevandmel'
)
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  tag = EXCLUDED.tag,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  read_time = EXCLUDED.read_time,
  image_url = EXCLUDED.image_url,
  slider_image_url = EXCLUDED.slider_image_url,
  background_image_url = EXCLUDED.background_image_url,
  show_on_homepage = EXCLUDED.show_on_homepage,
  hide_from_blog = EXCLUDED.hide_from_blog,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  updated_at = NOW();

INSERT INTO posts (
  id,
  title,
  slug,
  tag,
  summary,
  body,
  read_time,
  image_url,
  slider_image_url,
  background_image_url,
  show_on_homepage,
  hide_from_blog,
  status,
  published_at,
  created_by
)
VALUES (
  'post-english-gematria-renaissance-agrippa-bacon',
  'Renaissance Crossroads — Agrippa and the Baconian Cipher',
  'english-gematria-renaissance-agrippa-bacon',
  'History, Renaissance Cabala',
  'Post 3 of 6. Agrippa supplied the warrant for treating non-Hebrew alphabets as magically meaningful. Bacon contributed a biliteral cipher that is not gematria but was later folded in with it.',
  '<p>This is the third post in a six-part series on the history of <a href="/why-english-gematria.html">English gematria</a>. The previous post described the Hebrew and Greek inheritance that supplied the conceptual template. This post turns to the Renaissance — the period in which Latin Christian cabala first argued that non-Hebrew alphabets could be read numerically too, and in which English itself first became the medium of a wholly different kind of hidden-letter system.</p><p>Two figures dominate this stage: Heinrich Cornelius Agrippa and Francis Bacon. They are easily confused in modern calculator-era summaries because both are associated with "letter codes," but they belong to different intellectual projects. Agrippa is the bridge into vernacular gematria. Bacon is a cipher theorist whose method was later mistaken for one.</p><h3>1) Agrippa and the warrant for vernacular letter mysticism</h3><p>In his <em>Occult Philosophy</em>, Agrippa argued that alphabets other than Hebrew could be distributed across planets, zodiacal signs, elements, and the spirit of the world. He explicitly states that among the Latins the vowels and certain consonants answer to the planets, zodiacal signs, elements, and spirit; and he treats letters as possessing both "extended" and "collected" order-values.</p><p>At the same time, he treats Hebrew as uniquely efficacious, with other languages standing at a greater distance from the celestial original. That combination is the important one. Agrippa did not hand down a fixed 26-letter English gematria table, but he did create the intellectual warrant for making Latin — and, by extension, vernacular — alphabets numerically and magically legible.</p><p>This matters for one specific point about modern calculators. The labels "Agrippa," "Latin," and sometimes "Jewish" that appear in current cipher menus often extend Hebrew-style 1–9, 10–90, 100+ values onto English letters. The conceptual basis for that move is Agrippa. The actual modern English table, however, is later — partly reconstruction, partly twentieth- and twenty-first-century standardization. Agrippa supplies the permission; the table itself does not come directly from him.</p><h3>2) Bacon: a cipher, not a gematria</h3><p>England contributed a different branch at almost the same period: cipher theory. Francis Bacon''s biliteral cipher, introduced in the context of <em>The Advancement of Learning</em> and more fully developed in <em>De Augmentis Scientiarum</em>, encodes letters through five-place sequences of <strong>a</strong> and <strong>b</strong>. The traditional 24-letter alphabet is laid out as A = aaaaa, B = aaaab, C = aaaba, and so on.</p><p>The crucial point is that this is not additive gematria. Its basic operation is concealment and recovery of text, not numerical summation. CAB is not "summed"; it is encoded as C = aaaba, A = aaaaa, B = aaaab. Gematria seeks significance through numerical equivalence. Baconian cipher seeks concealment through graphical alternation. The two belong to different analytical categories.</p><p>Still, Bacon''s system matters for the later history of "English gematria" because it made the English alphabet itself an occultizable medium of hidden order. Later readers, especially in the nineteenth and early twentieth centuries, often grouped Baconian ciphers with alphabetic mysticism more broadly — even though the operations are different.</p><h3>3) The Friedmans and the limits of letter-reading</h3><p>The clearest cautionary tale from this branch is the twentieth-century cryptologic demolition of Baconian overreading. William and Elizebeth Friedman, working in the lineage that produced modern signals intelligence, showed how genuine cipher methods could be pushed into speculative pattern-finding — most notoriously in the Baconian authorship claims about Shakespeare.</p><p>That lesson transfers directly to English gematria. A real historical technique (Bacon''s biliteral cipher) can coexist with wildly overextended interpretations. The correct scholarly posture is therefore not blanket dismissal of every letter-number practice, but careful differentiation between documented historical use, internally coherent symbolic systems, and modern overreading. We will return to this distinction in the final post in the series.</p><h3>4) The Renaissance picture in one paragraph</h3><p>By the end of the seventeenth century, two things had happened. First, Latin Christian cabala had argued — through Agrippa and his readers — that non-Hebrew alphabets could be made numerically and magically meaningful, even if the actual modern English tables would come later. Second, English itself had become the medium of a different kind of hidden-letter system through Bacon''s biliteral cipher, which was not gematria but would often be folded in with it. The Victorian occult revival, which the next post in this series examines, inherited both threads.</p><hr><p class="post-series-nav"><strong>Series — History of English Gematria (Post 3 of 6):</strong> Previous: <a href="/blog.html?post=english-gematria-ancient-foundations-hebrew-greek#english-gematria-ancient-foundations-hebrew-greek">Ancient Foundations — Hebrew Gematria and Greek Isopsephy</a>. Next: <a href="/blog.html?post=english-gematria-victorian-revival-cheiro#english-gematria-victorian-revival-cheiro">The Victorian Revival — Mathers, Waite, the Golden Dawn, and Cheiro</a>.</p>',
  '6 minute read',
  '/assets/english-gematria-renaissance-agrippa-bacon-hero-16x9.svg',
  '/assets/english-gematria-renaissance-agrippa-bacon-hero-16x9.svg',
  '/assets/english-gematria-renaissance-agrippa-bacon-hero-16x9.svg',
  FALSE,
  FALSE,
  'draft',
  NULL,
  'kevandmel'
)
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  tag = EXCLUDED.tag,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  read_time = EXCLUDED.read_time,
  image_url = EXCLUDED.image_url,
  slider_image_url = EXCLUDED.slider_image_url,
  background_image_url = EXCLUDED.background_image_url,
  show_on_homepage = EXCLUDED.show_on_homepage,
  hide_from_blog = EXCLUDED.hide_from_blog,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  updated_at = NOW();

INSERT INTO posts (
  id,
  title,
  slug,
  tag,
  summary,
  body,
  read_time,
  image_url,
  slider_image_url,
  background_image_url,
  show_on_homepage,
  hide_from_blog,
  status,
  published_at,
  created_by
)
VALUES (
  'post-english-gematria-victorian-revival-cheiro',
  'The Victorian Revival — Mathers, Waite, the Golden Dawn, and Cheiro',
  'english-gematria-victorian-revival-cheiro',
  'History, Victorian Occultism',
  'Post 4 of 6. The Victorian and Edwardian occult revival is where English-language adaptations thickened into a recognizable field, from Mathers and Waite to the Golden Dawn and Cheiro''s mass-market name numerology.',
  '<p>This is the fourth post in a six-part series on the history of <a href="/why-english-gematria.html">English gematria</a>. The Renaissance supplied the warrant for treating non-Hebrew alphabets as magically meaningful. The Victorian and Edwardian occult revival is the moment when English-language adaptations truly thickened into a recognizable field.</p><p>Four threads matter most in this period: scholarly translation of Kabbalah into English, the systematization of Kabbalah''s place within Western occult tradition, its use as the structural theory of a working magical order, and its popularization as a mass-market personal-numerology product. The figures usually attached to those four threads are S. L. MacGregor Mathers, A. E. Waite, the Hermetic Order of the Golden Dawn, and Cheiro.</p><h3>1) Mathers and the translation of Kabbalah into English occultism</h3><p>Mathers''s <em>Kabbalah Unveiled</em> was one of the channels through which core Kabbalistic material entered English-language occult circulation. Translation matters more than it sometimes looks. Before Mathers, an English reader who wanted to engage Kabbalistic letter mysticism mostly had to do so through Latin intermediaries or through second-hand Christian-cabalistic summaries. After Mathers, an English reader had a direct text to work from — and could begin to imitate, parallel, or extend the technique in the English language itself.</p><h3>2) Waite and the systematization of Kabbalah''s place in Western esotericism</h3><p>A. E. Waite''s <em>Doctrine and Literature of the Kabalah</em> went further. It explicitly linked Kabbalah to Rosicrucianism, Freemasonry, Hermeticism, tarot, and figures such as Agrippa. The effect was to set Kabbalah inside a recognizable Western occult genealogy rather than treating it as a foreign or isolated tradition.</p><p>That systematization had a side effect. Once Kabbalah was placed inside the broader Western esoteric tradition, gematria-style letter techniques could move through elite initiatory subcultures and Hermetic study groups even where they had no native place. Scholarship on the Kabbalah–Freemasonry linkage tends to describe it as an "unusual association"; Masonic historical notes stress that the literal Cabala — gematria, notarikon, and temurah — played a role mainly in "advanced" or additional degrees rather than in ordinary Craft Freemasonry. That qualification is important. Kabbalistic letter techniques moved through elite subcultures without necessarily becoming standard Masonic doctrine.</p><h3>3) The Golden Dawn and Kabbalah as practical theory</h3><p>The Hermetic Order of the Golden Dawn treated Kabbalah as foundational theory for practical magic rather than as an object of historical study. The Tree of Life became a structural diagram on which tarot, astrology, ritual grades, and god-names were mapped. In this environment, working with letter-values and correspondences was not a piece of obscure exegesis. It was part of how members were expected to think.</p><p>That is the cultural setting in which a recognizably "English" letter-mystical practice — using English language and English-language reference works while reasoning through Hebrew correspondences — became normal. Many of the calculator-era tables labeled "Hebrew" or "Jewish" reflect this Hermetic environment rather than rabbinic gematria as such.</p><h3>4) Cheiro and the popularization of name numerology</h3><p>The Victorian revival also reached a much broader audience through popular numerology. Cheiro (Count Louis Hamon) promoted a name-number system he associated with ancient Hindu, Chaldean, and Egyptian wisdom. He contrasted a "Pythagorean" school with a "more ancient" Chaldean school, and his <em>Book of Numbers</em> demonstrated letter-values in worked English name examples such as John Smith and added-initial variants.</p><p>The Cheiro-style "Chaldean" table maps letters by occult symbolism rather than alphabet order:</p><ul><li>1: A, I, J, Q, Y</li><li>2: B, K, R</li><li>3: C, G, L, S</li><li>4: D, M, T</li><li>5: E, H, N, X</li><li>6: U, V, W</li><li>7: O, Z</li><li>8: F, P</li><li>9: often unused or specially treated</li></ul><p>Two features of Cheiro''s system are historically important for the path English gematria takes from this point. First, he taught readers to alter the spellings of their names so that the name number would harmonize with the birth number. The letter system is not just descriptive; it is prescriptive. Second, the legitimating story (ancient Chaldean wisdom) is itself a late modern occult construction rather than a documented ancient transmission. Modern scholarship treats the "Chaldean" label as a Victorian-era branding choice. The historical Chaldeans did not leave us this table.</p><p>Cheiro''s significance for English gematria is that he shifted letter-number analysis away from scriptural exegesis and toward personal destiny, social success, "vibration," and adjustable spelling. This is the point at which English alphabetic numerology became genuinely mass-market.</p><h3>5) The Victorian picture in one paragraph</h3><p>By the end of the Edwardian period, three things were in place that had not been in place a century earlier. There was a translated body of Kabbalistic source material available to English readers. There was a systematizing account that placed Kabbalah inside a recognized Western occult genealogy alongside Hermeticism and Freemasonry. And there was a popular numerology marketed as ancient that taught readers to take letter-values seriously in their daily lives. The next stage — Thelema and the calculator era — builds directly on all three.</p><hr><p class="post-series-nav"><strong>Series — History of English Gematria (Post 4 of 6):</strong> Previous: <a href="/blog.html?post=english-gematria-renaissance-agrippa-bacon#english-gematria-renaissance-agrippa-bacon">Renaissance Crossroads — Agrippa and the Baconian Cipher</a>. Next: <a href="/blog.html?post=english-gematria-thelema-and-calculator-era#english-gematria-thelema-and-calculator-era">Thelema and the Calculator Era — English Qaballa to Modern Ciphers</a>.</p>',
  '7 minute read',
  '/assets/english-gematria-victorian-revival-hero-16x9.svg',
  '/assets/english-gematria-victorian-revival-hero-16x9.svg',
  '/assets/english-gematria-victorian-revival-hero-16x9.svg',
  FALSE,
  FALSE,
  'draft',
  NULL,
  'kevandmel'
)
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  tag = EXCLUDED.tag,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  read_time = EXCLUDED.read_time,
  image_url = EXCLUDED.image_url,
  slider_image_url = EXCLUDED.slider_image_url,
  background_image_url = EXCLUDED.background_image_url,
  show_on_homepage = EXCLUDED.show_on_homepage,
  hide_from_blog = EXCLUDED.hide_from_blog,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  updated_at = NOW();

INSERT INTO posts (
  id,
  title,
  slug,
  tag,
  summary,
  body,
  read_time,
  image_url,
  slider_image_url,
  background_image_url,
  show_on_homepage,
  hide_from_blog,
  status,
  published_at,
  created_by
)
VALUES (
  'post-english-gematria-thelema-and-calculator-era',
  'Thelema and the Calculator Era — English Qaballa to Modern Ciphers',
  'english-gematria-thelema-and-calculator-era',
  'History, Thelema, Calculator Era',
  'Post 5 of 6. The twentieth century added a permuted English alphabet (English Qaballa); the twenty-first century stabilized a modular cipher menu — including "English Sumerian" (ordinal × 6) — on calculator sites.',
  '<p>This is the fifth post in a six-part series on the history of <a href="/why-english-gematria.html">English gematria</a>. The previous post traced the Victorian and Edwardian revival. This post covers the two more recent stages: the twentieth-century Thelemic invention of English Qaballa, and the twenty-first-century calculator era in which a menu of "ciphers" became the standard interface.</p><p>Both stages share a feature worth flagging up front. They each broke with an assumption that earlier English systems took for granted — that alphabetical sequence itself, or a single canonical table, should determine letter-values. Thelemic English Qaballa breaks the sequence assumption. Calculator culture breaks the single-table assumption.</p><h3>1) Thelema and English Qaballa</h3><p>The twentieth century added a specifically English permutational turn through Thelema. Later bibliographic summaries of <em>The New Equinox</em> report that the first public account of what came to be called English Qaballa appeared there in 1979, when Ray Sherwin reported James Lees''s discovery; further EQ material appeared in 1981–82 after Lees took over publication of the journal.</p><p>In this stream, the English alphabet is not numbered in ordinary A-to-Z order. Instead, it is reordered according to a revelatory or text-derived key. The best-known version is ALW, a 1–26 ordering with the letters rearranged so that the system can be applied to <em>Liber AL vel Legis</em> (the <em>Book of the Law</em>) for Thelemic exegesis. The numbers are still 1 through 26, but the letters wearing those numbers are not in alphabetical order.</p><p>This is a substantial break with the assumption underwriting English ordinal. Ordinary alphabetical sequence is no longer treated as authoritative; the authority of the ordering comes from a text and an act of reception. From a historical point of view, English Qaballa is therefore not a direct continuation of rabbinic gematria. It is a deliberately permuted alphabet inside a specific Thelemic context. Its value, on its own terms, depends on the textual and theological framework around it rather than on inheritance from older Jewish or Christian practice.</p><h3>2) The calculator era</h3><p>The second recent stage is the move from books and lodges to calculators and online communities. In the digital era, calculator sites stabilized a new menu of "English gematria" ciphers: English ordinal, simple, full reduction, Latin / "Jewish," English Sumerian, and many others. The practice became modular and comparative — one phrase is tested against many ciphers at once.</p><p>A clean example is "English Sumerian." Current calculator sites describe it simply as an alphabet beginning at 6 and increasing by 6 for each letter; Gematrinator''s FAQ defines its "Sumerian" method as multiplying the alphabet by 6. So A = 6, B = 12, C = 18, and so on, up to Z = 156. Mathematically, this is ordinal × 6 and nothing more. The label "Sumerian" is a calculator-era brand. The historical Sumerians did not leave us this table; the pre-web history of the cipher is thin and sometimes undocumented.</p><p>The convenience of running one phrase through many ciphers at once is genuinely useful. It is also historically significant. It marks the transition from transmission by books and lodges to transmission by calculators and online communities, where the menu of ciphers can change faster than the historical memory behind them.</p><h3>3) A worked comparison</h3><p>The divergence between systems is sharper than the shared label "English gematria" suggests. Take ENGLISH as a neutral sample word:</p><ul><li><strong>English ordinal</strong>: 5 + 14 + 7 + 12 + 9 + 19 + 8 = 74.</li><li><strong>Full reduction</strong>: 5 + 5 + 7 + 3 + 9 + 1 + 8 = 38.</li><li><strong>Cheiro-style Chaldean</strong>: 5 + 5 + 3 + 3 + 1 + 3 + 5 = 25.</li><li><strong>English Sumerian</strong>: 74 × 6 = 444.</li></ul><p>The divergence is not accidental. Each system encodes a different theory of what letters are supposed to mean — sequence, reduction, occult vibration, or scaled amplification. Saying that "ENGLISH equals X in gematria" is therefore underspecified without naming the cipher.</p><p>A religiously charged example sharpens the same point. JESUS in simple English ordinal totals 74. In full reduction it is 11. In Cheiro-style Chaldean it is 18. In English Sumerian it is 444. But in the older Greek transliteration method, Ιησους / <em>Iesous</em> = 888, which is why Christian numerology around Jesus belongs historically to Greek isopsephy rather than to native English letter-value systems. This is one of the clearest demonstrations that "English gematria" often rides on older sacred-language practices instead of replacing them.</p><h3>4) The calculator era in one paragraph</h3><p>The twenty-first-century field is therefore best understood as a mixed toolbox: documented historical practice (Hebrew gematria, Greek isopsephy, Bacon''s cipher), internally coherent symbolic systems (Cheiro, English Qaballa), and recent calculator-era inventions whose pre-web history is thin. The field''s modern unity is real as a usage category — these are all things you can run a phrase through on the same website — but weak as a single historical lineage. The final post in this series turns to the methodological cautions that follow from that asymmetry.</p><hr><p class="post-series-nav"><strong>Series — History of English Gematria (Post 5 of 6):</strong> Previous: <a href="/blog.html?post=english-gematria-victorian-revival-cheiro#english-gematria-victorian-revival-cheiro">The Victorian Revival — Mathers, Waite, the Golden Dawn, and Cheiro</a>. Next: <a href="/blog.html?post=english-gematria-methodological-cautions#english-gematria-methodological-cautions">Methodological Cautions — Confirmation Bias, Apophenia, and the Bacon Lesson</a>.</p>',
  '6 minute read',
  '/assets/english-gematria-thelema-calculator-hero-16x9.svg',
  '/assets/english-gematria-thelema-calculator-hero-16x9.svg',
  '/assets/english-gematria-thelema-calculator-hero-16x9.svg',
  FALSE,
  FALSE,
  'draft',
  NULL,
  'kevandmel'
)
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  tag = EXCLUDED.tag,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  read_time = EXCLUDED.read_time,
  image_url = EXCLUDED.image_url,
  slider_image_url = EXCLUDED.slider_image_url,
  background_image_url = EXCLUDED.background_image_url,
  show_on_homepage = EXCLUDED.show_on_homepage,
  hide_from_blog = EXCLUDED.hide_from_blog,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  updated_at = NOW();

INSERT INTO posts (
  id,
  title,
  slug,
  tag,
  summary,
  body,
  read_time,
  image_url,
  slider_image_url,
  background_image_url,
  show_on_homepage,
  hide_from_blog,
  status,
  published_at,
  created_by
)
VALUES (
  'post-english-gematria-methodological-cautions',
  'Methodological Cautions — Confirmation Bias, Apophenia, and the Bacon Lesson',
  'english-gematria-methodological-cautions',
  'History, Methodology',
  'Post 6 of 6. Scholars of religion, cryptology, and psychology have raised real cautions about loose letter-mystical inference. The fix is not dismissal but careful differentiation between documented use, coherent systems, and modern overreading.',
  '<p>This is the final post in a six-part series on the history of <a href="/why-english-gematria.html">English gematria</a>. The earlier posts followed the field from its ancient Hebrew and Greek roots through Renaissance Christian cabala, the Victorian revival, Thelema, and the modern calculator era. This post turns to the methodological cautions that scholars of religion, cryptology, and psychology have raised — and to what those cautions imply for serious research today.</p><p>The argument can be summarized in one sentence. Many English systems are historically interesting not because they preserve pristine ancient doctrine, but because they reveal how modern esoteric cultures reassembled older materials. Taking that seriously changes how you should weigh any particular match.</p><h3>1) The Scholem-style critique of loose occult appropriations</h3><p>Serious scholarship on Kabbalah and religious history has long been skeptical of casual occult adaptations. A retrospective scholarly assessment preserved in later discussion of Waite quotes Gershom Scholem to the effect that Waite had genuine philosophical intuition but lacked adequate historical and philological criticism. That single judgment captures a broader academic unease: in English occult gematria, suggestive analogies too often outrun textual control.</p><p>This does not mean every English letter-mystical practice is worthless. It means that "Kabbalah said so" is rarely a defensible argument when applied to a modern English calculator table, because most such tables are reconstructions or standardizations rather than direct transmissions.</p><h3>2) Degrees of freedom: confirmation bias and apophenia</h3><p>Mathematically and psychologically, gematria and numerology are vulnerable to <em>degrees of freedom</em>. Underwood Dudley''s classic critique of numerology argues that numbers exert power over minds rather than events. Raymond Nickerson''s review of confirmation bias explains how people preferentially seek and interpret evidence that supports pre-existing hypotheses.</p><p>In gematria, the problem is intensified by the sheer number of ciphers, transliterations, reductions, reversals, name variants, and phrase segmentations available. The more alphabets and transforms one can choose from, the easier it becomes to manufacture impressive-looking matches after the fact. A single match against a single cipher, in isolation, is not strong evidence of anything.</p><p>Apophenia sharpens the same concern from another angle. Contemporary psychological literature defines apophenia as a tendency to perceive meaningful connections among unrelated things — effectively a bias toward false positives. English gematria, especially in its calculator-era form, is structurally hospitable to apophenia because it invites users to scan enormous spaces of phrases and ciphers for salient hits while forgetting the far larger number of dead ends.</p><p>This does not make the practice historically unimportant. It means that historical importance and evidential force are separate questions.</p><h3>3) The Bacon lesson</h3><p>The Baconian controversy is a particularly clean case study. Francis Bacon really did devise a biliteral cipher (covered in Post 3 of this series). But the Friedmans — William and Elizebeth — showed how later enthusiasts projected vast hidden messages onto typographical noise and authorship fantasies. A real historical technique coexisted with wildly overextended interpretations.</p><p>The lesson transfers directly. The correct scholarly posture toward English gematria is not blanket dismissal of every letter-number practice, but careful differentiation between three things: documented historical use, internally coherent symbolic systems, and modern overreading. Those three categories are not interchangeable.</p><h3>4) Where the documentary gaps are</h3><p>The strongest research gap is the early history of explicitly English additive gematria. Ordinary alphabet-numbering, ciphers, and acrostic habits are easy to find in early modern English sources. The precise point at which English speakers began to present A=1 to Z=26, or reduced forms of it, as a self-conscious cabalistic method is much harder to document.</p><p>A second gap concerns the genealogy of the modern "Agrippa" table used in calculators. Agrippa himself worked with premodern Latin letter-systems rather than a standardized modern English alphabet. The tables that now appear under his name are partly reconstruction and partly later standardization.</p><p>A third gap concerns recent calculator ciphers — especially "Sumerian" and some reverse or hybrid methods — whose pre-web history is thin and sometimes undocumented. These absences are not trivial details. They are exactly where mythology tends to enter the field.</p><h3>5) A workable posture for serious research</h3><p>None of this argues for abandoning the field. It argues for treating it the way historians of esotericism actually treat it: as a layered tradition with real historical content, real later inventions, and real psychological pitfalls. A few practical implications follow:</p><ul><li><strong>Name the cipher.</strong> Saying "X equals Y in gematria" without specifying the cipher leaves the claim untestable.</li><li><strong>Distinguish historical from reconstructed tables.</strong> "Hebrew" and "Agrippa" labels in modern calculators are not the same as primary sources from those traditions.</li><li><strong>Treat single matches as weak evidence.</strong> A claim that survives across themed word clusters and variant controls is stronger than a one-off hit on one cipher.</li><li><strong>Log non-matches as carefully as matches.</strong> Apophenia thrives on selective recall.</li><li><strong>Separate historical importance from evidential force.</strong> A system can be culturally significant without licensing strong factual claims about the world.</li></ul><p>The history of English gematria is best understood as a history of adaptation rather than simple inheritance. Ancient Hebrew and Greek practices supplied the model; Renaissance Christian cabala supplied permission to extend letter mysticism into Latin and vernacular contexts; Victorian occultism and popular numerology turned letter-values into English mass-market practice; Thelema introduced permuted English revelation-based systems; and calculator culture standardized a mixed toolbox of historical, semi-historical, and recent ciphers. The result is a field worth studying — and a field that rewards careful, source-aware research more than it rewards dramatic one-shot matches.</p><hr><p class="post-series-nav"><strong>Series — History of English Gematria (Post 6 of 6):</strong> Previous: <a href="/blog.html?post=english-gematria-thelema-and-calculator-era#english-gematria-thelema-and-calculator-era">Thelema and the Calculator Era — English Qaballa to Modern Ciphers</a>. You are reading the final post in this series.</p>',
  '7 minute read',
  '/assets/english-gematria-methodological-cautions-hero-16x9.svg',
  '/assets/english-gematria-methodological-cautions-hero-16x9.svg',
  '/assets/english-gematria-methodological-cautions-hero-16x9.svg',
  FALSE,
  FALSE,
  'draft',
  NULL,
  'kevandmel'
)
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  tag = EXCLUDED.tag,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  read_time = EXCLUDED.read_time,
  image_url = EXCLUDED.image_url,
  slider_image_url = EXCLUDED.slider_image_url,
  background_image_url = EXCLUDED.background_image_url,
  show_on_homepage = EXCLUDED.show_on_homepage,
  hide_from_blog = EXCLUDED.hide_from_blog,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  updated_at = NOW();

