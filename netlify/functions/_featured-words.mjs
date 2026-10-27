// Words the site chooses to put in front of search engines on purpose.
//
// The generated /w/ pages are indexed only once a word has repeated demand and
// enough siblings (see the gate in _words.mjs). That gate exists because the
// pages that slipped through before it were archaic dictionary words nobody on
// a gematria site was looking for. These are the opposite case: the names and
// terms people actually run through a gematria calculator, each with a short
// written note so its page is more than a letter sum. They are indexed whatever
// the words table says about them, listed in the words sitemap, and linked from
// /bible-names-gematria.html.
//
// Notes are plain text, one or two sentences, describing who or what the word
// refers to. They make no claim about what a value means.

export const FEATURED_GROUPS = Object.freeze([
  { id: 'god', heading: 'God and the names of Christ' },
  { id: 'old-testament', heading: 'Old Testament figures' },
  { id: 'new-testament', heading: 'New Testament figures' },
  { id: 'angels', heading: 'Angels and the adversary' },
  { id: 'places', heading: 'Places' },
  { id: 'scripture', heading: 'Scripture and faith' },
]);

export const FEATURED_WORDS = Object.freeze([
  { word: 'God', group: 'god', note: 'The common English name for the one God of the Bible, used throughout both Testaments.' },
  { word: 'Jesus', group: 'god', note: 'Jesus of Nazareth, the central figure of the New Testament. The English name comes through Greek Iēsous from the Hebrew Yeshua.' },
  { word: 'Christ', group: 'god', note: 'From the Greek Christos, "anointed one", the New Testament translation of the Hebrew title Messiah.' },
  { word: 'Jesus Christ', group: 'god', note: 'The name and title together, as the New Testament letters most often write them.' },
  { word: 'Messiah', group: 'god', note: 'From the Hebrew mashiach, "anointed one". The expected deliverer of the Hebrew prophets, and the title Christians apply to Jesus.' },
  { word: 'Lord', group: 'god', note: 'The word most English Bibles use in place of the divine name YHWH, set in small capitals as LORD.' },
  { word: 'Jehovah', group: 'god', note: 'An English rendering of the divine name YHWH, used in a handful of verses of the King James Version.' },
  { word: 'Yahweh', group: 'god', note: 'The scholarly reconstruction of how the divine name YHWH was pronounced.' },
  { word: 'Holy Spirit', group: 'god', note: 'The third person of the Trinity in Christian teaching, usually called the Holy Ghost in the King James Version.' },
  { word: 'Immanuel', group: 'god', note: 'Hebrew for "God with us", the name given in Isaiah 7:14 and applied to Jesus in Matthew 1:23.' },
  { word: 'Adam', group: 'old-testament', note: 'The first man in the Genesis creation account. The Hebrew adam also means "human" or "mankind".' },
  { word: 'Eve', group: 'old-testament', note: 'The first woman in Genesis, named by Adam "because she was the mother of all living".' },
  { word: 'Noah', group: 'old-testament', note: 'The builder of the ark in the Genesis flood narrative.' },
  { word: 'Abraham', group: 'old-testament', note: 'The patriarch called out of Ur in Genesis, regarded as the father of the Jewish people and honoured in Christianity and Islam.' },
  { word: 'Isaac', group: 'old-testament', note: 'The son of Abraham and Sarah, and father of Jacob and Esau.' },
  { word: 'Jacob', group: 'old-testament', note: 'The son of Isaac, renamed Israel in Genesis 32. His twelve sons give their names to the tribes of Israel.' },
  { word: 'Moses', group: 'old-testament', note: 'The prophet who led Israel out of Egypt and received the Law at Sinai.' },
  { word: 'David', group: 'old-testament', note: 'The shepherd who became Israel\'s second king, traditionally the author of many of the Psalms.' },
  { word: 'Solomon', group: 'old-testament', note: 'The son of David and builder of the first Temple in Jerusalem, remembered for his wisdom.' },
  { word: 'Elijah', group: 'old-testament', note: 'The prophet of the books of Kings who confronted the prophets of Baal and was taken up in a whirlwind.' },
  { word: 'Isaiah', group: 'old-testament', note: 'The eighth-century BC prophet whose book is among the most quoted in the New Testament.' },
  { word: 'Daniel', group: 'old-testament', note: 'The exile in Babylon whose book contains the lions\' den and the visions of the four beasts and the seventy weeks.' },
  { word: 'Mary', group: 'new-testament', note: 'The mother of Jesus. Several other Marys appear in the Gospels, among them Mary Magdalene.' },
  { word: 'Joseph', group: 'new-testament', note: 'The husband of Mary in the Gospels. Also the son of Jacob in Genesis who rose to rule in Egypt.' },
  { word: 'John', group: 'new-testament', note: 'The name of John the Baptist and of the apostle John, traditionally linked to the fourth Gospel and the book of Revelation.' },
  { word: 'Peter', group: 'new-testament', note: 'The apostle Simon, renamed Peter, from the Greek petros, "rock".' },
  { word: 'Paul', group: 'new-testament', note: 'The apostle formerly called Saul of Tarsus, whose letters make up much of the New Testament.' },
  { word: 'Judas', group: 'new-testament', note: 'Judas Iscariot, the apostle who betrayed Jesus. Another apostle, Judas son of James, shares the name.' },
  { word: 'Michael', group: 'angels', note: 'The archangel named in Daniel, Jude and Revelation, where he leads the angels against the dragon.' },
  { word: 'Gabriel', group: 'angels', note: 'The angel who interprets Daniel\'s visions and announces the births of John the Baptist and Jesus.' },
  { word: 'Lucifer', group: 'angels', note: 'Latin for "light-bearer", the King James rendering of "morning star" in Isaiah 14:12, later used as a name for Satan.' },
  { word: 'Satan', group: 'angels', note: 'From the Hebrew for "adversary" or "accuser", the opponent of God and humanity in the Bible.' },
  { word: 'Antichrist', group: 'angels', note: 'A figure named only in the letters of John, and identified by many readers with the beast of Revelation 13.' },
  { word: 'Israel', group: 'places', note: 'The name given to Jacob, then to his descendants, their kingdom and the land.' },
  { word: 'Jerusalem', group: 'places', note: 'The city David made his capital and the site of the Temple, central to Judaism, Christianity and Islam.' },
  { word: 'Zion', group: 'places', note: 'Originally a hill in Jerusalem, and by extension the city, its people or the dwelling place of God.' },
  { word: 'Babylon', group: 'places', note: 'The Mesopotamian capital that took Judah into exile, and in Revelation a symbol of a corrupt world power.' },
  { word: 'Bethlehem', group: 'places', note: 'The town of David\'s family, and the birthplace of Jesus in the Gospels of Matthew and Luke.' },
  { word: 'Bible', group: 'scripture', note: 'From the Greek biblia, "books": the collected scriptures of Judaism and Christianity.' },
  { word: 'Genesis', group: 'scripture', note: 'The first book of the Bible, from the Greek for "origin".' },
  { word: 'Revelation', group: 'scripture', note: 'The last book of the New Testament, also called the Apocalypse, from the Greek for "unveiling".' },
  { word: 'Gospel', group: 'scripture', note: 'From the Old English godspel, "good news", translating the Greek euangelion.' },
  { word: 'Heaven', group: 'scripture', note: 'The sky, and in the Bible the dwelling place of God.' },
  { word: 'Hell', group: 'scripture', note: 'The English word used for Sheol, Hades and Gehenna in older translations.' },
  { word: 'Amen', group: 'scripture', note: 'A Hebrew word meaning "so be it" or "truly", said at the end of a prayer.' },
]);

const BY_KEY = new Map(FEATURED_WORDS.map((entry) => [entry.word.toLowerCase(), entry]));

export function getFeaturedWord(word) {
  return BY_KEY.get(String(word ?? '').trim().toLowerCase()) || null;
}

// One URL per featured word, whatever casing a link or the words table uses,
// so the sitemap, the hub page and the page's own canonical always agree.
export function featuredWordPath(word) {
  return `/w/${encodeURIComponent(String(word).trim().toLowerCase())}`;
}
