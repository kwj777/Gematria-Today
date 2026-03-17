import { ensureSchema, getSql } from "./db.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed. Use POST." }),
    };
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: "Database schema ready" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to initialize database", details: error.message }),
    };
  }
}
