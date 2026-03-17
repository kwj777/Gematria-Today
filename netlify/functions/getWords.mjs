import { neon } from "@neondatabase/serverless";

export async function handler(event) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    const words = await sql`
      SELECT 
        word, 
        gematria_value, 
        digital_root, 
        is_base_root, 
        search_count
      FROM words
      ORDER BY search_count DESC
      LIMIT 20
    `;

    return {
      statusCode: 200,
      body: JSON.stringify(words),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
