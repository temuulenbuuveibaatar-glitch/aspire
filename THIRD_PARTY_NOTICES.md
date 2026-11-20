# Third-party software, models and services

The code in this repository is MIT-licensed. It uses, but does not include, the following:

| Component | Use | License / terms |
|---|---|---|
| [Clerk](https://clerk.com/legal) (`@clerk/nextjs`) | Accounts and sign-in (Google, Apple, email code) | SDK: MIT. Service: Clerk terms and DPA |
| [Supabase](https://supabase.com/terms) (`@supabase/supabase-js`, `@supabase/ssr`) | Database (Seoul region) for bot links, Slack installs and synced data of linked users | SDKs: MIT. Service: Supabase terms |
| [Vercel](https://vercel.com/legal/terms) | Hosting | Vercel terms |
| [Anthropic Claude API](https://www.anthropic.com/legal) | Brain, web search and research | Anthropic's commercial terms |
| [DeepSeek API](https://platform.deepseek.com) | Optional brain | DeepSeek API terms |
| [Google Gemini API](https://ai.google.dev/gemini-api/terms) | Optional brain; alternative speech engine | Gemini API terms. On the free tier Google may use content to improve its products |
| [Microsoft Azure AI Speech](https://learn.microsoft.com/legal/cognitive-services/speech-service/speech-to-text/data-privacy-security) | Speech recognition and neural voices (default speech engine) | Microsoft Online Services terms; audio is not stored after processing |
| [Gmail API](https://developers.google.com/terms/api-services-user-data-policy) | Read-only mail senders and subjects for the briefing | Google APIs terms and User Data Policy (Limited Use) |
| [Telegram Bot API](https://telegram.org/tos/bot-developers), [Discord](https://discord.com/developers/docs/policies-and-agreements/developer-terms-of-service), [Slack](https://slack.com/terms-of-service/api) | Bots | Each platform's developer terms |
| Voice Orb component ([21st.dev](https://21st.dev) / [chatcn](https://chatcn.dev), by aadixc0de) | The animated Jarvis orb (`web/components/ui/voice-orb.tsx`, adapted) | As published by the author on 21st.dev / chatcn |
| [lucide-react](https://lucide.dev) | Icons | ISC |
| [Motion](https://motion.dev) (`motion`) | Animations | MIT |
| [Tailwind CSS](https://tailwindcss.com) | Styling | MIT |
| clsx, tailwind-merge | Class name helpers | MIT |
| Next.js, React | Web app | MIT |
| Inter, Orbitron fonts | UI | SIL Open Font License |
| [OmniVoice](https://github.com/k2-fsa/OmniVoice) (k2-fsa) | Optional self-hosted text-to-speech (speech/) | Code: Apache-2.0. **Model weights: CC-BY-NC (non-commercial only)** |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) / OpenAI Whisper | Optional self-hosted speech-to-text + language detection (speech/) | MIT |
| Qwen2.5 via Ollama (optional, local) | Offline brain | Qwen license (see model card) |
| [Open-Meteo](https://open-meteo.com) | Weather and air quality | Free for non-commercial use, CC BY 4.0 data |
| [Wikipedia](https://www.wikipedia.org) | Encyclopedia tool | CC BY-SA text |
| [ExchangeRate-API open access](https://www.exchangerate-api.com/docs/free) (open.er-api.com) | Exchange rates | Free with attribution |

**Commercial use:** because of the OmniVoice weights license, a paid product must switch to a
commercially licensed voice model (e.g. a Qwen3-TTS fine-tune, Apache-2.0) or obtain a license.

**Voices:** the assistant voices are synthetic (Azure neural voices, or a voice designed by the model).
Only clone a real person's voice with that person's written consent.

**Bus data:** `web/data/erdenet.sample.json` is illustrative sample data, not an official schedule.
