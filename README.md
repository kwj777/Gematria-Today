# Gematria

A web-based Gematria calculator application built with HTML, CSS, JavaScript, and Netlify serverless functions backed by a Neon (PostgreSQL) database.

## Project Structure

```
.
├── public/                        # Static front-end files
│   ├── index.html
│   ├── calculator.html
│   ├── nameCalculator.html
│   ├── gematria-results.html
│   ├── admin.html
│   ├── blog.html
│   ├── news.html
│   ├── faq.html
│   ├── contact.html
│   ├── privacy.html
│   ├── terms.html
│   ├── disclaimer.html
│   ├── accessibility.html
│   ├── theme.css
│   └── netlify/functions/         # Deployed Netlify functions
├── netlify/
│   └── functions/                 # Netlify serverless functions (Node.js / .mjs)
├── sql/
│   ├── admin_schema.sql           # Admin/auth/content schema
│   └── member_schema.sql          # Member profile/history schema
├── netlify.toml                   # Netlify configuration
├── package.json
└── use-gematria.js
```

## Lines of Code

The repository contains approximately **6,350 lines of source code** across HTML, CSS, JavaScript/MJS, SQL, TOML, and JSON files.

To recount at any time, run:

```bash
npm run count-lines
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Deploy to [Netlify](https://netlify.com) or run locally with the [Netlify CLI](https://docs.netlify.com/cli/get-started/).

## Database Migrations

Apply the SQL files in order when bootstrapping a database:

1. `sql/admin_schema.sql`
2. `sql/member_schema.sql`

`member_schema.sql` is the Phase 2 migration that adds member account fields, profile records, and saved calculation history on top of the shared `users` table.

The membership implementation now exposes member auth/profile/history endpoints (`member-register`, `member-login`, `member-session`, `member-profile`, and `member-history`) plus a published `/member.html` dashboard for registration, profile editing, and saved searches.

## License

See [LICENSE](./LICENSE) for details.
