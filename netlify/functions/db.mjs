import { neon } from "@neondatabase/serverless";

export function getSql() {
  const { DATABASE_URL } = process.env;

  if (!DATABASE_URL) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  return neon(DATABASE_URL);
}

export async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS words (
      id BIGSERIAL PRIMARY KEY,
      word TEXT UNIQUE NOT NULL,
      gematria_value INTEGER NOT NULL,
      digital_root INTEGER NOT NULL,
      is_base_root BOOLEAN NOT NULL DEFAULT FALSE,
      search_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_words_search_count ON words(search_count DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_words_word ON words(word)`;

  await sql`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_words_updated_at'
      ) THEN
        CREATE TRIGGER trigger_words_updated_at
        BEFORE UPDATE ON words
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      END IF;
    END
    $$
  `;
}
