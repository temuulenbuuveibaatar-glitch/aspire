# Security

## Reporting a problem
Please **don't open a public issue** for security problems. Use GitHub's
"Report a vulnerability" (Security tab → Advisories) on this repository so it stays private.

## How the project protects users and keys
- **No secrets in the repo.** API keys live only in `web/.env.local` (git-ignored) on a developer's
  machine and in Vercel environment settings in production. `.env.example` files contain names only.
- **Secret scan before every push.** Staged changes are checked for key patterns (Anthropic, Google,
  Slack tokens, the Supabase service role key) before anything is pushed.
- **Keys never reach the browser.** All AI, speech, database and bot calls go through server routes
  (`/api/*`); only `NEXT_PUBLIC_*` values are sent to the client, and none of them are secrets. The
  Supabase service role key is server only.
- **Accounts.** Sign-in is handled by Clerk (Google, Apple or a 6-digit email code); Aspire keeps no
  passwords. User API routes require a signed-in session.
- **Bot webhooks are verified.** Telegram requests must carry the webhook secret token, Discord
  interactions are checked with Ed25519 signatures, and Slack requests with HMAC-SHA256 signing
  secrets (requests more than 5 minutes old are rejected). The reminder cron endpoint requires a shared
  secret. Anything that fails a check gets 401.
- **Encrypted secrets.** Slack bot tokens are encrypted with AES-256-GCM (key in `DATA_ENCRYPTION_KEY`,
  server only) before they are stored, and are never returned to the browser.
- **Least data in the database.** Supabase stores only bot links, Slack workspace installs and, for
  users who link a bot, a synced copy of memory, reminders, routines and lessons. Row-level security is
  on for every table. Unlinking removes the cloud copy; "Delete my cloud data" removes all of it.
- **Gmail is read-only** (`gmail.readonly`); senders and subjects are read for the briefing and never stored.
- **Nothing is sent without a tap.** Messages, posts, SMS, calls and emails need a confirm tap. Channel
  webhook URLs are checked against an allow-list (`discord.com/api/webhooks/…`,
  `hooks.slack.com/services/…`) so the server cannot be used to reach other hosts.
- **Speech engine is locked.** The optional self-hosted engine requires a bearer token (`SPEECH_TOKEN`)
  shared only with the Vercel app.
- **Abuse limits.** Rate limits on API routes, input size limits (text ≤ 1000 chars, audio ≤ 4 MB),
  short timeouts.
- **Quiet logs.** Logs never contain what people said, message text, tokens or webhook URLs; recordings
  are processed in memory and discarded.
- **Browser hardening.** Security headers (HSTS, nosniff, frame-deny, referrer policy) and a
  permissions policy that allows only the microphone.

If a key is ever committed by mistake: revoke it at the provider immediately, then remove it from history.
