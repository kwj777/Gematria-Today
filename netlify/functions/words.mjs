import { getSql } from "./db.mjs";
import { englishGematriaWithDigitalRoot } from "./englishGematria.mjs";

function toInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function response(statusCode, data) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(data),
  };
}

export async function handler(event) {
  try {
    const sql = getSql();

    if (event.httpMethod === "GET") {
      const q = (event.queryStringParameters?.q ?? "").trim();
      const limit = Math.min(Math.max(toInt(event.queryStringParameters?.limit, 20), 1), 100);
      const offset = Math.max(toInt(event.queryStringParameters?.offset, 0), 0);

      const words = q
        ? await sql`
            SELECT word, gematria_value, digital_root, is_base_root, search_count, updated_at
            FROM words
            WHERE word ILIKE ${`%${q}%`}
            ORDER BY search_count DESC, word ASC
            LIMIT ${limit}
            OFFSET ${offset}
          `
        : await sql`
            SELECT word, gematria_value, digital_root, is_base_root, search_count, updated_at
            FROM words
            ORDER BY search_count DESC, word ASC
            LIMIT ${limit}
            OFFSET ${offset}
          `;

      return response(200, { count: words.length, items: words });
    }

    if (event.httpMethod === "POST") {
      const payload = event.body ? JSON.parse(event.body) : {};
      const rawWord = typeof payload.word === "string" ? payload.word.trim() : "";

      if (!rawWord) {
        return response(400, { error: "Field 'word' is required" });
      }

      const normalizedWord = rawWord.toLowerCase();
      const gematria = englishGematriaWithDigitalRoot(normalizedWord);
      const total = Number(gematria.total);

      const [record] = await sql`
        INSERT INTO words (word, gematria_value, digital_root, is_base_root, search_count)
        VALUES (
          ${normalizedWord},
          ${total},
          ${gematria.digitalRoot},
          ${gematria.digitalRoot < 6},
          1
        )
        ON CONFLICT (word)
        DO UPDATE SET
          search_count = words.search_count + 1,
          gematria_value = EXCLUDED.gematria_value,
          digital_root = EXCLUDED.digital_root,
          is_base_root = EXCLUDED.is_base_root
        RETURNING word, gematria_value, digital_root, is_base_root, search_count, updated_at
      `;

      return response(201, { item: record });
    }

    return response(405, { error: "Method not allowed" });
  } catch (error) {
    return response(500, {
      error: "Failed to handle request",
      details: error.message,
    });
  }
}
