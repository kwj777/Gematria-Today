# Endtimes Netlify + Neon starter

A complete starter project for an **Endtimes** word database running on **Netlify Functions (Node.js)** with **Neon Postgres**.

## What you get

- Netlify function API under `/api/*`
- Neon/Postgres database connectivity
- Word ingest endpoint that computes gematria + digital root
- Query endpoint with search and pagination
- One-click schema bootstrap endpoint for first run
- Minimal frontend in `public/index.html` to verify the API quickly

## Project structure

- `netlify/functions/db.mjs` – shared DB + schema helper
- `netlify/functions/words.mjs` – list + create/update words
- `netlify/functions/initDatabase.mjs` – create starter schema/table/indexes
- `netlify/functions/getWords.mjs` – compatibility alias to words list endpoint
- `netlify/functions/englishGematria.mjs` – gematria helpers
- `public/index.html` – starter UI

## Prerequisites

- Node.js 18+
- Netlify CLI (`npm i -g netlify-cli`) for local function dev
- A Neon/Postgres database

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `DATABASE_URL` in `.env`.

4. Start locally:

   ```bash
   netlify dev
   ```

5. Initialize database schema once:

   ```bash
   curl -X POST http://localhost:8888/api/initDatabase
   ```

## API

### `GET /api/words`

List words ordered by popularity.

Query params:

- `q` (optional): partial word search
- `limit` (optional, default `20`, max `100`)
- `offset` (optional, default `0`)

### `POST /api/words`

Create or update a word record and increment `search_count`.

Request JSON:

```json
{ "word": "Babylon" }
```

### `POST /api/initDatabase`

Creates `words` table and supporting indexes if they do not exist.

## Deploy to Netlify

1. Push to GitHub.
2. Create a Netlify site from this repo.
3. Add environment variable `DATABASE_URL` in Netlify project settings.
4. Deploy.
5. Call `POST /.netlify/functions/initDatabase` once after first deployment.
