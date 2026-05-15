# Rebrand Cutover Checklist (endtimes.today → gematria.today)

Operational steps to complete the rebrand. The repo changes are merged
via PR #1216; everything below is dashboard, DNS, or env-var work
that has to happen outside the codebase.

Follow the sections in order — sequencing matters for deliverability
and session continuity.

## 1) SendGrid — authenticate the new sending domain

Do this **before** flipping any `@gematria.today` From address.
Sending from an unauthenticated domain tanks deliverability fast.

1. SendGrid → **Settings → Sender Authentication → Authenticate a
   Domain** → enter `gematria.today`.
2. Publish the CNAMEs (DKIM `s1` / `s2`, return-path) at the DNS
   provider for `gematria.today`.
3. Wait for SendGrid to mark the domain **Verified**. Usually
   minutes; up to a few hours if DNS is slow.

### SPF / DMARC

- If `gematria.today` has no SPF record, SendGrid's wizard adds one.
- If it already has SPF (e.g., for inbox hosting), confirm
  `include:sendgrid.net` is present.
- If `endtimes.today` had a DMARC record, mirror it on
  `gematria.today` with the same alignment, but start with
  `p=none` (monitor only) until you've seen passing reports for a
  few days — then promote to `quarantine` / `reject`.

## 2) Netlify — domain config

1. Site → **Domain management → Add a domain** → `gematria.today`.
   Add `www.gematria.today` too if desired.
2. Make `gematria.today` the **primary domain**.
3. Configure DNS (Netlify DNS or your provider's records) so
   `gematria.today` resolves to the Netlify site. HTTPS cert
   provisioning is automatic once DNS resolves.
4. Keep `endtimes.today` attached as a **domain alias**. By default
   Netlify will 301-redirect aliases to the primary domain — verify
   this is on. That gives you the cross-domain redirect for free
   without any `netlify.toml` change.

## 3) Netlify — environment variables

Site → **Configuration → Environment variables**:

| Variable | From | To |
|---|---|---|
| `SENDGRID_FROM_EMAIL` | `…@endtimes.today` | `…@gematria.today` |
| `SENDGRID_REPLY_TO_EMAIL` | `…@endtimes.today` (if set) | `…@gematria.today` |
| `SENDGRID_FROM_NAME` | optional override | optional; code default is now `Gematria.Today` |
| `PUBLIC_SITE_URL` | `https://endtimes.today` (if set) | `https://gematria.today` |

Trigger a deploy after saving so the new values are picked up.

## 4) Admin Email Settings — DB overrides win

`netlify/functions/_email.mjs:38-39` reads `getStoredEmailSetting(sql,
'sendgrid_from_email')` **before** falling back to the env var. If
the admin → Email Settings panel has values saved (very likely,
since you've been using it), those win over env vars.

After deploy, sign in as admin and either:
- Update **From email**, **From name**, and **Reply-to email** to
  the new `@gematria.today` values, OR
- Blank them out to defer to the env vars set in step 3.

## 5) Session continuity caveat

The cookie/storage migration (commit `1b3e902`) added dual-read for
gematria_*  ←  endtimes_*  names. This works **on the same host
only**. Browsers won't ship cookies set on `endtimes.today` to
`gematria.today` regardless of the name on them.

So at the moment DNS makes `gematria.today` the primary domain,
every logged-in user appears unauthenticated on the new host. Three
options:

- **Accept the one-time logout** (simplest, most common). Communicate
  in advance if the audience expects continuity.
- **Hybrid period**: keep both domains live, set the primary
  redirect to fire only on unauthenticated paths, give users a few
  days to migrate naturally.
- **Server-side session bridge**: an endpoint on the old host that
  reads its session and 302s to the new host with a single-use
  token that the new host trades for a fresh session. More code;
  worth it only if forced logout is a serious UX concern.

## 6) Post-cutover sanity checks

Run these the moment DNS is live on the new domain.

### Email deliverability

Trigger a member email recovery flow to a Gmail **and** an Outlook
inbox. Inspect headers:

```
Authentication-Results: ...
  dkim=pass header.d=gematria.today
  spf=pass smtp.mailfrom=...gematria.today
  dmarc=pass header.from=gematria.today
```

If you see `dkim=pass` but on `*.sendgrid.net` instead of
`gematria.today`, step 1 didn't finish — re-check the CNAMEs.

### Page surface

```bash
curl -sI https://gematria.today/                | head -3
curl -sI https://endtimes.today/                | head -3   # expect 301 to gematria.today
curl -s  https://gematria.today/sitemap.xml     | grep -c gematria.today
curl -s  https://gematria.today/blog.xml        | grep -c gematria.today
```

Then load:
- `https://gematria.today/` — check title, canonical, og:image, logo
- `https://gematria.today/calculator.html` — share image generator
- `https://gematria.today/member.html` — sign-in / register works
- Sign in, then sign out — confirm logout clears both `gematria_*`
  and `endtimes_*` Set-Cookie headers in DevTools → Network

### Analytics

GA4 property is host-agnostic by default but verify:
- Real-time view shows traffic to `gematria.today`
- No spike in 404s from old hardcoded `endtimes.today/...` paths
  (you should see only the alias redirect hits)

## 7) Still pending in the repo (post-cutover follow-ups)

These are non-blocking and were deliberately left for after the
domain swap is stable:

- GitHub repo rename: `kwj777/EndTimes-Today` → `kwj777/gematria-today`
  (Settings → Rename). GitHub auto-redirects old clone URLs but CI
  integrations may need re-pointing.
- `PROJECT_HISTORY_PAPER.md` — historical narrative; leave as-is or
  add a footnote noting the rename.
- `ENDTIMES_PROJECT_REQUIREMENTS_PAPER.md` — same.
