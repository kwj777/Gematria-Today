-- The words table: every stored lookup and its English gematria value.
-- The calculator (englishGematria), value search (searchByGematria), the /w/
-- and /v/ word pages, the words sitemap, word stats, admin reports and premium
-- research all read it, and no runtime ensure*Schema creates it, so a database
-- bootstrapped from the other files alone answered all of them with
-- `relation "words" does not exist`.
--
-- Safe to rerun, and safe against an existing words table: every statement is
-- IF NOT EXISTS, and the unique index on LOWER(word) is only created when no
-- two existing rows already collide on it (a plain index stands in otherwise,
-- so the hot lookups still avoid a sequential scan).

BEGIN;

CREATE TABLE IF NOT EXISTS words (
  word TEXT NOT NULL,
  gematria_value INTEGER NOT NULL,
  digital_root INTEGER NOT NULL,
  is_base_root BOOLEAN NOT NULL DEFAULT FALSE,
  search_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- englishGematria looks words up, and increments them, by LOWER(word).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM words GROUP BY LOWER(word) HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS words_word_lower_key ON words (LOWER(word));
  ELSE
    RAISE NOTICE 'words has rows that differ only by case; creating a non-unique LOWER(word) index instead';
    CREATE INDEX IF NOT EXISTS words_word_lower_idx ON words (LOWER(word));
  END IF;
END $$;

-- Value search, /v/ pages and the words sitemap group and filter on the value.
CREATE INDEX IF NOT EXISTS words_gematria_value_idx ON words (gematria_value);

COMMIT;
