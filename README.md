# Aspire v2 — Jarvis for everyone, connected everywhere

**Live:** https://aspire-mn.vercel.app

Orkhon Hackathon (Erdenet). A Jarvis-style assistant you talk to. Tap the orb and ask anything out loud; it answers out loud in the language you spoke — **Mongolian, Chinese, English, Russian or German** — with no settings. "hi" → English, "ni hao" → Chinese, "hallo" → German, "privet" → Russian, "сайн байна уу" → Mongolian.

## What it does

- **Jarvis screen with a voice orb.** The orb breathes when idle, follows your voice while listening, spins while thinking and ripples while speaking. Typing works too.
- **Research with sources.** Web search through Claude; sources are shown on screen (not read aloud).
- **Teaches and learns.** Lessons with quiz questions and saved progress; it remembers facts about you; you can teach it routines ("when I say *good night*, ...").
- **Send for me.** Telegram, Discord, Slack, SMS, calls and email appear as confirm cards. Nothing is sent until you tap Send.
- **Gmail morning briefing.** With read-only Gmail access, it speaks the senders and subjects of new mail together with weather, air quality and today's reminders.
- **Bots.** Telegram (text and voice notes), Discord (`/aspire ask`) and Slack (mention it, any workspace via "Add to Slack"). Linking a bot syncs your memory, reminders, routines and lessons so the bot can help you as you; reminders are delivered by the bot.
- **5 languages** with automatic detection.
- **Voices:** Azure Speech **Jarvis** (male: Bataa for Mongolian, Ryan en-GB, Yunyang, Dmitry, Conrad) and **Friday** (female: Yesui, Emily en-IE, Xiaoxiao, Svetlana, Katja). It can call you sir/madam in your language.
- **Sign-in with Clerk** (Google, Apple or a 6-digit email code). **Supabase** (Seoul) stores only bot links, Slack installs and the synced copy for users who link a bot. Everything else stays on your device.
- Local skills: next bus (Erdenet sample timetable), weather, air quality, Wikipedia, exchange rates.

## Parts

| Folder | What | Runs on |
|---|---|---|
| `web/` | Next.js app: Jarvis screen, API routes (`/api/ask`, `/api/listen`, `/api/speak`, `/api/send`, `/api/bots/*`) | Vercel |
| `supabase/` | Database migrations (tables, row-level security, reminder cron) | Supabase |
| `speech/` | Optional self-hosted speech engine: Whisper + OmniVoice | Any NVIDIA GPU machine (Docker) |

**Any AI can be the brain.** Set `BRAIN_ORDER` (default `claude,deepseek,gemini,local`). Unconfigured providers are skipped, and if one fails the next answers:

| Provider | Env | Notes |
|---|---|---|
| Claude (`claude-opus-5-5`) | `ANTHROPIC_API_KEY` | Web search, research and all agent tools |
| DeepSeek (`deepseek-chat`) | `DEEPSEEK_API_KEY` | Same agent tools (OpenAI-compatible) |
| Google Gemini (`gemini-3.8-flash`) | `GEMINI_API_KEY` | Google Search + tools |
| Local / self-hosted (Qwen2.5 via Ollama, LM Studio, vLLM) | `LOCAL_LLM_URL` | Any OpenAI-compatible server; no web search |

## Environment variables

Names only; put values in `web/.env.local` (git-ignored) and in Vercel. `web/.env.example` explains each one.

| Area | Variables |
|---|---|
| Brain | `BRAIN_ORDER`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_SEARCH`, `LOCAL_LLM_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_KEY` |
| Speech | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_SPEECH_ENDPOINT`, `AZURE_SPEECH_RATE`, `GEMINI_TTS_VOICE`, `GEMINI_TTS_MODEL`, `GEMINI_STT_MODEL`, `SPEECH_URL`, `SPEECH_TOKEN` |
| Accounts (Clerk) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Database (Supabase) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only) |
| Encryption and cron | `DATA_ENCRYPTION_KEY` (32 random bytes, base64), `CRON_SECRET` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` |
| Discord | `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` |
| Public info | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REPO_URL`, `NEXT_PUBLIC_CONTACT_EMAIL` |

## Run the web app

```bash
cd web
cp .env.example .env.local   # fill in values; never commit .env.local
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (vitest)
```

The smallest working setup is one AI key (for example `GEMINI_API_KEY`) plus the Clerk keys. Everything else turns on when its keys are present.

## Set up the services

1. **Clerk** (accounts): create an application, turn on Google, Apple and email code sign-in, and copy the two keys. For the Gmail briefing, the Google connection needs the read-only Gmail scope (`gmail.readonly`).
2. **Supabase** (database): create a project in Seoul (`ap-northeast-2`) and apply the SQL in `supabase/migrations/`. Copy the project URL, anon key and service role key. Generate `DATA_ENCRYPTION_KEY` with `openssl rand -base64 32` and a random `CRON_SECRET`.
3. **Azure Speech** (voice): create a Speech resource (free F0 tier) and copy its key and region.
4. **Telegram:** create a bot with @BotFather, set the token, username and a random webhook secret, deploy, then run `node scripts/telegram-setup.mjs` to register the webhook.
5. **Discord:** create an application with a bot, copy the app ID, public key and bot token, set the Interactions Endpoint URL to `<site>/api/bots/discord`, then run `node scripts/discord-register.mjs` to register `/aspire`.
6. **Slack:** create an app with the bot scopes `app_mentions:read chat:write im:history im:read im:write commands`, events to `<site>/api/bots/slack/events`, slash command `/aspire` to `<site>/api/bots/slack/commands`, OAuth redirect `<site>/api/bots/slack/oauth`, then copy the client ID, client secret and signing secret.
7. **Deploy** to Vercel with the same variables (production and preview). Run the secret scan before every push.

## Optional: self-hosted speech engine (GPU)

```bash
cd speech
docker build -t aspire-speech .
docker run --gpus all -p 8000:8000 -e SPEECH_TOKEN=change-me -v aspire-data:/data aspire-speech
```

First start downloads the models and designs the persona voice (`/data/persona.wav`). To use a real person's voice instead, put a 10–20 s clean recording at `/data/persona.wav` and its transcript in `/data/persona.txt` — **only with that person's written consent**.

## Bus data

`web/data/erdenet.sample.json` is **sample data** for the demo (illustrative routes and times). Replace it with the operator's real timetable; a GTFS provider can plug into `web/lib/transit.ts`.

## Privacy, security, licenses

- In-app [Privacy Policy](web/app/privacy/page.tsx) and [Terms](web/app/terms/page.tsx) (Mongolian + English), shown at `/privacy` and `/terms`.
- [SECURITY.md](SECURITY.md): how keys and user data are protected, and how to report a problem.
- Code: [MIT](LICENSE). Libraries, models and services: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). OmniVoice weights are non-commercial only.
