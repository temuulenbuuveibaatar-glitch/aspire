# Aspire v2: Jarvis for everyone, connected everywhere

Date: 2026-11-20 · Status: draft for approval · Project: Orkhon Hackathon (Erdenet)

## 1. Intent

Aspire today is a voice assistant web app (Next.js 16 on Vercel) that speaks and understands
Mongolian, Chinese, English, Russian and German, answers with Claude (fallbacks: DeepSeek, Gemini,
local Qwen), uses 14 tools (bus, weather, air, currency, encyclopedia, calculator, reminders,
memory, call button...) and talks with Azure neural voices (Jarvis / Friday).

The owner says it looks bad and is too narrow. v2 should:

- **Look like a real Jarvis**: a polished, modern interface (Apple-style fluid motion, frosted glass).
- **Do anything, learn anything**: a general assistant first; bus and weather are just two skills.
  "Learn" means all of: research any topic on the internet (e.g. nuclear physics, aerodynamics),
  learn about the user, teach the user (lessons + quizzes), and be taught new skills (routines).
- **Connect to the user's world**: Gmail (read, for a morning briefing), Telegram, Discord, Slack,
  phone calls and SMS, so it can message or call people, and people can talk to Aspire inside
  Telegram, Discord and Slack.

Success for the hackathon: a judge signs in, hears "Good morning, sir. You received 3 emails, from
NVIDIA and Anthropic...", asks a hard science question and gets a researched spoken answer, says
"tell the team on Discord I'm 10 minutes late" and taps Send, then opens Telegram and talks to the
same Aspire by voice note.

## 2. Goals, non-goals, anti-goals

Goals
- New UI (dark glass, Jarvis core, chat transcript, suggestion chips, always-visible ask box,
  sheets for Settings / Connections / Memory / Skills), in all 5 languages.
- Required sign-in (Supabase Auth): Google or email 6-digit code.
- Morning briefing on the first open of the day: Gmail (new mail: senders + subjects), weather + air,
  today's reminders.
- Send for the user (always after an on-screen Send/Call tap): Telegram, Discord, Slack, SMS, phone
  call, email draft.
- Full bots: Telegram (text + voice notes, spoken replies), Discord (/aspire slash command), Slack
  (@Aspire mention + DM).
- Linked bots act as the user: memory, reminders and Gmail are available in bots for users who link
  them.
- Learning: deep web research, personal memory (automatic), tutor mode with progress, user-taught
  routines.

Non-goals (this round)
- Sending email from Gmail (read-only; email sending = "open draft in Gmail" link).
- Real phone calls or SMS placed by Aspire (Twilio). Calls/SMS open the phone's own dialer/app.
- Native Android/iOS/Electron packaging (later).
- Google's public verification of the Gmail scope (testing mode, up to 100 test users, is enough).

Anti-goals (failure even if it "works")
- Aspire sends, posts or calls anything without the user tapping a confirm button in the app (bots:
  explicit command in the chat = the confirmation; the bot only ever replies in the chat it was
  addressed in, never DMs third parties).
- Personal data stored on the server for users who did not link a bot.
- Elders blocked by complexity: the main flow must stay "tap the core and talk".
- Secrets (tokens, keys) in the public GitHub repo, in logs, or in chat.

## 3. Constraints

- Hosting: GitHub (public repo temuulenbuuveibaatar-glitch/aspire) + Vercel (project "aspire",
  https://aspire-mn.vercel.app). Free tiers; no AWS; not the owner's PC.
- Vercel Hobby: cron jobs only once a day; functions up to 300 s; bodies up to 4.5 MB.
- Telegram bots can only message chats that started the bot or added it.
- Discord HTTP interactions must be answered within 3 s (deferred reply + follow-up allowed);
  requests are signed (Ed25519) and must be verified.
- Slack Events API must be acknowledged within 3 s; requests signed (HMAC signing secret).
- Gmail `gmail.readonly` is a restricted scope: Google "testing" mode, up to 100 test users,
  unverified-app warning.
- Supabase free project, region ap-northeast-2 (Seoul). Cost confirmed $0/month.
- Mongolia's Personal Data Protection law: opt-in for cloud storage, clear privacy page.
- 21st.dev MCP is available: free tier = catalog search + 2 component installs per day.

## 4. Approaches considered

1. **Everything in the existing Vercel app (chosen).** Next.js + Supabase; bots as webhook routes on
   the same site (Telegram webhook, Discord interactions endpoint, Slack Events API), long work
   finished with `after()`; reminders for linked users fired by Supabase `pg_cron` + `pg_net`
   calling a secured Vercel route every minute. One codebase, $0.
2. Vercel app + always-on bot server (Railway/Fly): enables Discord gateway extras (typing,
   reading every message). Extra server, ~$5/month, not needed for the chosen features.
3. Supabase Edge Functions for bots + cron: brain/tools/voice would have to be ported or duplicated.

Chosen by the owner's go-ahead on the builder's recommendation: 1.

## 5. Decisions made with the owner

| # | Decision |
|---|---|
| Q1 | Both: Aspire sends for the user (tap Send) first, then bots people talk to |
| Q2 | One shared Aspire Telegram bot; sends go to the user's own chat and groups where the bot is; friends' DMs via a pre-filled share link |
| Q3 | Auth with Supabase; Gmail read-only, used for the morning briefing |
| Q4 | Sign-in required for everyone; it is only identity, other data stays on the phone |
| Q5 | Sign-in methods: Google + email 6-digit code |
| Q6 | Briefing on the first open of the day (+ "Briefing" button to replay) |
| Q7 | Full Discord and Slack bots now |
| Q8/Q9 | Full Aspire in bots, but cloud storage only for users who link a bot (opt-in, encrypted) |
| Q10 | New Supabase project "aspire", Seoul; move Vercel functions to an Asia region |
| Q11 | Learning = internet research + learns about me + teaches me + I teach it skills |
| Q12 | Calls/SMS to any number, always via a tap; warning for unknown numbers |
| Q13 | The builder sets up Google Cloud, Discord, Slack apps in the owner's Chrome (owner types logins/codes and approves); owner creates the Telegram bot in @BotFather |

## 6. Design

### 6.1 Data model (where things live)

Phone (localStorage, per signed-in user id key `aspire:<userId>`): memory, reminders, settings
(voice, title), lessons progress, routines, connections (Discord/Slack channel webhooks the user
added for "send for me"), Google refresh token (only if not linked).

Supabase (Postgres, RLS: a user reads/writes only their rows):
- `auth.users` (Supabase Auth).
- `profiles(user_id, display_name, created_at)`.
- `bot_links(user_id, platform, platform_user_id, chat_id, linked_at)` and
  `link_codes(code, user_id, expires_at)`: one-time 10-minute codes.
- Only for users with ≥1 bot link (opt-in "Sync for bots"): `user_state(user_id, memory jsonb,
  reminders jsonb, routines jsonb, lessons jsonb, updated_at)` and
  `secrets(user_id, google_refresh_token_encrypted)`, encrypted with an app key (AES-GCM, key in
  Vercel env), never returned to the browser.
- `bot_reminders(id, user_id, platform, chat_id, text, at, repeat_daily)` driven by pg_cron.

Sync rule: when linked, the phone pushes its state to `user_state` after each change and pulls on
open (last-write-wins by `updated_at`). Unlinking deletes the cloud rows.

### 6.2 Auth

Supabase Auth with `@supabase/ssr` (cookie session, middleware refresh). Providers:
- Google OAuth (scopes: openid email profile + `https://www.googleapis.com/auth/gmail.readonly`,
  `access_type=offline`, `prompt=consent` so a refresh token is returned once).
- Email OTP (6-digit code, Supabase built-in mailer for the hackathon).
App routes: `/login` (two options), everything else requires a session (redirect to /login).
API routes check the Supabase session; bots authenticate by platform signature instead.

### 6.3 Gmail morning briefing

- After Google sign-in, the client captures `provider_refresh_token` once and stores it on the
  phone (or encrypted in `secrets` if the user linked a bot).
- `/api/briefing` (POST, session required) receives the refresh token, exchanges it with Google for
  an access token, lists messages `newer_than:1d` in INBOX (category primary), fetches From/Subject
  headers (max 10), never stores them; also runs weather + air + today's reminders through the
  existing tools; Claude writes a 3-5 sentence spoken briefing in the user's language with their
  title ("Good morning, sir...").
- Client shows the briefing card + speaks it on the first open per calendar day (Mongolia time);
  "Briefing" button replays. Email-code users get the briefing without mail.
- New tool `check_email` (query, max 10) so "any mail from NVIDIA?" works mid-conversation.

### 6.4 Assistant brain (do anything / learn anything)

- System prompt rewritten: general Jarvis-like assistant; explain, research, teach, write,
  translate, plan, math, code; bus/weather are skills. Spoken answers short by default; teaching and
  research answers longer (up to ~8 sentences) and end with an offer to go deeper.
- **Research**: Claude `web_search` + `web_fetch` (already wired); raise limits (search 5, fetch 3)
  for research questions; cite sources on screen (not spoken).
- **Learns about me**: prompt instructs automatic `remember` of stable personal facts; memory panel
  shows/deletes them (exists).
- **Teaches me**: tools `start_lesson(topic, level)`, `save_progress(topic, step, score)`; quiz
  questions asked one at a time; progress shown in a "Learning" section of the Memory sheet.
- **I teach it skills**: tools `save_routine(trigger_phrase, steps_text)`, `list_routines`,
  `delete_routine`; routines are sent with each request and the prompt says "if the message matches
  a routine trigger, run its steps with your tools".
- **Connections tools** (all produce on-screen confirm cards; nothing is sent server-side by the
  tool itself):
  - `send_message(channel: telegram|discord|slack|sms|email, to, subject, text)`.
  - `call_phone(number, label)`: any number; unknown numbers flagged.
  - `add_to_calendar(title, date, time, duration_minutes)`: Google Calendar link.
  - `check_email(query)` (above).
- Brains: Claude first (tools + web), then DeepSeek, Gemini, local, as today.

### 6.5 Sending for the user (web app)

Confirm card per action: shows channel, recipient, editable text, Send button.
- Telegram: via the shared Aspire bot to the user's linked chat or a group where the bot was added
  (`/api/send` with the user session; server looks up the link). To message a friend: a
  `https://t.me/share/url?text=...` button.
- Discord / Slack: posts through the channel webhook URL the user saved in Connections
  (`/api/send` proxies; URL validated against `discord.com/api/webhooks/...` /
  `hooks.slack.com/services/...`, nothing stored server-side).
- SMS: `sms:<number>?body=...`; Call: `tel:<number>`; Email: Gmail compose link
  `https://mail.google.com/mail/?view=cm&to=&su=&body=` + `mailto:` fallback.
- `/api/send` is rate limited (10/min/user) and logs no message text or URLs.

### 6.6 Bots

Shared core `lib/bots/handle.ts`: (platform, platformUserId, chatId, text | audio) → look up
`bot_links`; if linked, load `user_state` and run the same `ask()` with that device context; apply
returned actions server-side for linked users (remember/forget → `user_state`; reminder →
`bot_reminders`); call/send actions become text with links. If not linked: smart chat with no memory,
and a "link your account" hint.

- **Telegram** `/api/bots/telegram` (webhook, secret-token header verified). Text and voice notes
  (download OGG → Azure transcribe → answer → Azure TTS `ogg-24khz-16bit-mono-opus` → `sendVoice` +
  text). `/start <code>` links the account. Group chats: answers when mentioned or replied to.
- **Discord** `/api/bots/discord` (interactions endpoint, Ed25519 verify). Commands `/aspire ask
  <question>` and `/aspire link <code>`; deferred response, follow-up after `after()`.
- **Slack** `/api/bots/slack` (Events API, signing-secret verify; url_verification handled).
  `app_mention` and `message.im`; acknowledge immediately, reply in thread after `after()`.
  `/aspire link <code>` slash command or "link 123456" DM.
- Linking flow in the web app: Connections → "Link Telegram/Discord/Slack" → shows a 6-digit code
  (and for Telegram a `t.me/<bot>?start=<code>` button) + an opt-in checkbox "Sync my memory,
  reminders and Gmail to the cloud so the bot can act as me".
- Reminders for linked users: Supabase `pg_cron` every minute → `pg_net` POST to
  `/api/cron/reminders` (shared secret header) → sends due reminders to the linked chat, reschedules
  daily ones.

### 6.7 UI

Stack: Tailwind v4 + Lucide icons + Motion; 21st.dev catalog components where they fit (budget: 2
installs/day; the builder picks e.g. an animated orb/voice visualizer and a sheet/drawer), adapted to
the tokens below. Mobile-first, works on desktop (centered column, max ~720 px; sheets become side
panels ≥1024 px).

Screen (sketch):
```
┌───────────────────────────────┐
│ ◎ ASPIRE        🇲🇳 Монгол  ⚙  │ frosted top bar
│        (Jarvis core)           │ breathes / follows voice / spins / ripples
│     Tap or say anything        │
│ Good morning, sir. 3 emails…   │ briefing card (first open)
│ You: …   Aspire: …             │ chat transcript, tool chips, sources
│ ┌ Discord → #team  [Send] ┐    │ confirm cards
│ [Teach me…] [Research…] [Plan…]│ suggestion chips (localized)
│ ┌ Ask anything… ──────┐ 🎙 ➤   │ pinned ask box
└───────────────────────────────┘
```
Sheets (from the tapped button, same path back): Settings (voice Jarvis/Friday, title, language
note, sign out), Connections (Google/Gmail status, Telegram/Discord/Slack link + webhooks, SMS/calls
info), Memory (facts, reminders, learning progress, routines, each deletable).
Login screen: core + "Continue with Google" + "Email me a code" (6-digit input), 5-language strings.

Design tokens: bg #060B16; glass panels rgba(255,255,255,.06) + blur 20px; accent cyan #38DCFF
(idle/listening), violet #8B7CFF (thinking), amber #FFB547 (speaking); success green, error red with
icon. Body 16–18 px, line-height 1.5; Lucide icons only (no emoji as icons); touch targets ≥44 px,
8 px gaps; text contrast ≥4.5:1; visible focus rings.

Motion (weighting: Jakub primary, Emil secondary, Jhey only for the core): core is the one
expressive element; messages fade+rise ~250 ms; sheets spring (no bounce) from their trigger;
buttons scale 0.97 on press within 100 ms; keyboard/typing actions not animated; everything has a
`prefers-reduced-motion` variant (cross-fades only) and `prefers-reduced-transparency` (solid
panels). Transform/opacity/filter only.

### 6.8 Security and privacy

- Secrets only in Vercel env / `.env.local`: SUPABASE keys (anon public, service role server-only),
  GOOGLE client id/secret, TELEGRAM_BOT_TOKEN + webhook secret, DISCORD app id/public key/bot token,
  SLACK bot token + signing secret, CRON_SECRET, DATA_ENCRYPTION_KEY.
- All bot endpoints verify platform signatures; cron endpoint verifies secret; all user APIs verify
  Supabase session; rate limits stay.
- Webhook URL allow-lists to prevent SSRF; no logging of message bodies, tokens or URLs.
- Privacy page + terms updated: accounts, Gmail read-only use (Google API Services User Data Policy
  "limited use" statement), opt-in cloud sync for linked bots, deletion ("Delete my cloud data" in
  Settings), third parties (Supabase, Google, Telegram, Discord, Slack, Azure, Anthropic...).
- Secret scan before every push (as today).

### 6.9 Testing

- Unit (vitest): new tools (send_message validation, call any number + unknown flag, calendar link,
  lessons, routines), signature verification for Discord/Slack/Telegram, link-code flow, briefing
  composition (Gmail + weather mocked), sync merge rule, encryption round-trip.
- Live: sign in with Google, connect Gmail, briefing speaks mail senders; Discord/Slack/Telegram send
  from the app; Telegram voice note round trip; Discord `/aspire ask`; Slack mention; linked
  reminder delivered by cron; UI checked at 375 px and desktop, reduced motion on.

### 6.10 Answers from the design review

Owner's answers:
- **Scope: nothing can be cut.** Every part of this document ships before the demo.
- **Slack: any workspace.** "Add to Slack" button (Slack OAuth v2 install, scopes `app_mentions:read
  chat:write im:history im:read im:write commands`). New table
  `slack_installations(team_id, bot_user_id, bot_token_encrypted, installed_by, installed_at)`;
  events and commands look up the token by `team_id`. Uninstall event deletes the row. Discord is
  already multi-server through one bot invite link.

Builder's calls (from the review; owner can override):
- **Google sign-in and Gmail are two steps.** Sign-in asks only for basic profile (Google app
  published "In production", no verification needed for basic scopes, so anyone, including judges,
  can sign in). "Connect Gmail" is a separate button (incremental consent for `gmail.readonly`); an
  unverified restricted scope in production shows Google's "unverified app" screen and is capped at
  100 users, which is enough for the demo. No judge pre-registration needed.
- **Linking a bot always turns on cloud sync** (the checkbox is the consent; no "linked but not
  synced" state).
- **Reminders for linked users** live only in the cloud (`bot_reminders`), are delivered by the bot
  to the user's "primary chat" (chosen in Connections; default = first linked) and also spoken by
  the web app if it is open; one reminder id, so it is never duplicated.
- **Telegram groups**: a group becomes a send target when a linked user runs `/link` inside it;
  only that user can send to it from the web app (`bot_links` gets one row per chat).
- **Sync merges item by item**: memory per key, reminders/routines/lessons per id, each with its own
  `updatedAt`; deletions kept as tombstones for 30 days. No whole-document overwrite.

## 7. Builder's calls (owner can override)

- Vercel function region set to `icn1` (Seoul) to sit next to Supabase; Azure speech stays in
  Southeast Asia.
- Supabase built-in email for OTP during the hackathon (rate-limited); custom SMTP later.
- Telegram group behavior: reply only when mentioned or replied to.
- Bot answers are text + (Telegram only) voice; Discord/Slack text only.
- Build order: (1) Supabase + auth + new UI shell, (2) brain/learning tools + send-for-me cards,
  (3) Gmail briefing, (4) Telegram bot + linking, (5) Discord + Slack bots (incl. Slack install flow), (6) cloud sync +
  bot reminders, (7) privacy/terms, tests, deploy.

## 8. Left to the builder

Exact component choices from 21st.dev, copy text and translations, table/column details, prompt
wording, retry/backoff details, how lesson content is structured.
