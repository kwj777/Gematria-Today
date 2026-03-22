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
│   └── admin_schema.sql           # Database schema
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

## License

See [LICENSE](./LICENSE) for details.
