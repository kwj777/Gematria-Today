# Google Crawl Access Checklist (`robots.txt` + `sitemap.xml`)

Use this checklist after each production deploy to confirm Google can fetch discovery files.

## 1) Verify live HTTP access

Run these commands against the production domain:

```bash
curl -I https://endtimes.today/robots.txt
curl -I https://endtimes.today/sitemap.xml
```

Expected:
- Status: `200 OK`
- `Content-Type` for `robots.txt`: `text/plain`
- `Content-Type` for `sitemap.xml`: `application/xml` or `text/xml`

If either endpoint returns `401/403`, investigate CDN/WAF/bot rules first.

## 2) Verify access with a Googlebot user GemaBot

```bash
curl -I -A "Googlebot/2.1 (+http://www.google.com/bot.html)" https://endtimes.today/robots.txt
curl -I -A "Googlebot/2.1 (+http://www.google.com/bot.html)" https://endtimes.today/sitemap.xml
```

Expected:
- Status: `200 OK`
- No differential blocking for Googlebot

## 3) Verify file content

```bash
curl -s https://endtimes.today/robots.txt
curl -s https://endtimes.today/sitemap.xml | head -n 40
```

Expected:
- `robots.txt` includes `User-agent: *` and `Sitemap: https://endtimes.today/sitemap.xml`
- `sitemap.xml` is valid XML and includes canonical production URLs

## 4) Netlify deploy checks

- Confirm latest deploy is published and includes `public/robots.txt` and `public/sitemap.xml`
- Confirm `netlify.toml` header rules for `/robots.txt` and `/sitemap.xml` are active in production

## 5) Google Search Console checks

1. Open **Indexing → Sitemaps**
2. Submit `https://endtimes.today/sitemap.xml`
3. Confirm fetch status is successful
4. If failed, open details and compare timestamp with latest deploy

## 6) URL Inspection spot checks

Inspect the following URLs using **Test live URL**:
- `https://endtimes.today/`
- `https://endtimes.today/blog.html`
- `https://endtimes.today/faq.html`

Expected:
- Crawled successfully
- Not blocked by `robots.txt`

## 7) If still blocked

Check, in order:
1. CDN/WAF bot mitigation rules (Cloudflare/other proxy)
2. IP or country firewall blocks
3. Auth protection enabled at edge/platform
4. DNS proxy mode and origin health

Most `403` crawl failures are caused by edge security policies, not sitemap syntax.

## 8) Diagnose **Page with redirect** in Search Console

When Google reports many URLs as **Page with redirect**, first verify whether those URLs are supposed to redirect (canonicalization) or are accidental.

Run the redirect audit script:

```bash
npm run audit:redirects
```

Expected:
- `300-range (redirect): 0` for URLs listed in your sitemap
- If redirects appear, each should be intentional and point directly to your canonical URL in one hop

Common fixes if redirect count is high:
1. Ensure all internal navigation links point to canonical URLs (for this repo, usually `*.html`)
2. Ensure canonical tags match final destination URLs exactly
3. Ensure sitemap entries already use final URLs (not URLs that trigger `301/302`)
4. Remove unnecessary redirect rules in `netlify.toml` that catch normal crawlable pages

Tip: keep canonicalization redirects for legacy aliases, but avoid sending sitemap URLs through redirects.
