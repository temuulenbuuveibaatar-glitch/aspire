# Security

## Reporting a problem
Please **don't open a public issue** for security problems. Use GitHub's
"Report a vulnerability" (Security tab → Advisories) on this repository so it stays private.

## How the project protects users and keys
- **No secrets in the repo.** API keys live only in `web/.env.local` (git-ignored) on a developer's
  machine and in Vercel/AWS environment settings in production. `.env.example` files contain names only.
- **Keys never reach the browser.** All AI and speech calls go through server routes (`/api/*`);
  only `NEXT_PUBLIC_*` values are sent to the client, and none of them are secrets.
- **Speech engine is locked.** It requires a bearer token (`SPEECH_TOKEN`) shared only with the Vercel app.
- **Abuse limits.** Per-IP rate limits on every API route, input size limits (text ≤ 1000 chars,
  audio ≤ 4 MB), short timeouts.
- **No data kept.** No database, no accounts, no cookies; recordings are processed in memory and
  discarded; logs never contain what people said.
- **Browser hardening.** Security headers (HSTS, nosniff, frame-deny, referrer policy) and a
  permissions policy that allows only the microphone.

If a key is ever committed by mistake: revoke it at the provider immediately, then remove it from history.
