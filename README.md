# Эмээ товч — Grandma Button

Orkhon Hackathon (Erdenet). One big button: press it and ask out loud. It answers out loud in the language you spoke — **Mongolian, Chinese, English, Russian or German** — with no settings. "hi" → English, "ni hao" → Chinese, "hallo" → German, "privet" → Russian, "сайн байна уу" → Mongolian.

It knows when the next bus comes and looks up anything else on the web.

## Parts

| Folder | What | Runs on |
|---|---|---|
| `web/` | Next.js app: the Jarvis screen + API (`/api/listen`, `/api/ask`, `/api/speak`) | Vercel |
| `speech/` | Our speech engine: Whisper (listening + language detection) and OmniVoice (one warm voice in all 5 languages) | AWS GPU machine (Docker) |

**Any AI can be the brain.** Set `BRAIN_ORDER` (default `claude,gemini,local`). Unconfigured providers are skipped, and if one fails the next answers:

| Provider | Env | Notes |
|---|---|---|
| Claude (`claude-opus-5-5`) | `ANTHROPIC_API_KEY` | Web search + bus tool; Anthropic refusal fallback on |
| Google Gemini (`gemini-3.8-flash`) | `GEMINI_API_KEY` | Google Search + bus tool |
| Local / self-hosted (Qwen2.5 via Ollama, LM Studio, vLLM) | `LOCAL_LLM_URL` | Any OpenAI-compatible server; bus tool, no web search |

## Run the web app

```bash
cd web
cp .env.example .env.local   # add at least one AI key; never commit .env.local
npm install
npm run dev                  # http://localhost:3000
npm test                     # language detection + bus timetable tests
```

Without `SPEECH_URL` the app still works by typing; answers show on screen and a note says the voice engine is offline. There is no browser voice fallback.

## Run the speech engine (GPU)

```bash
cd speech
docker build -t emee-speech .
docker run --gpus all -p 8000:8000 -e SPEECH_TOKEN=change-me -v emee-data:/data emee-speech
```

First start downloads the models and designs the persona voice (`/data/persona.wav`). To use a real person's voice instead, put a 10–20 s clean recording at `/data/persona.wav` and its transcript in `/data/persona.txt` — **only with that person's written consent**.

## Bus data

`web/data/erdenet.sample.json` is **sample data** for the demo (illustrative routes and times). Replace it with the operator's real timetable; a GTFS provider can plug into `web/lib/transit.ts`.

## Privacy, security, licenses

- In-app [Privacy Policy](web/app/privacy/page.tsx) and [Terms](web/app/terms/page.tsx) (Mongolian + English), shown at `/privacy` and `/terms`.
- [SECURITY.md](SECURITY.md): how keys and user data are protected, and how to report a problem.
- Code: [MIT](LICENSE). Models and services: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). OmniVoice weights are non-commercial only.
