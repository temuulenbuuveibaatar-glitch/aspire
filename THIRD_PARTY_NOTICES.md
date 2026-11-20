# Third-party software, models and services

The code in this repository is MIT-licensed. It uses, but does not include, the following:

| Component | Use | License / terms |
|---|---|---|
| [OmniVoice](https://github.com/k2-fsa/OmniVoice) (k2-fsa) | Optional self-hosted text-to-speech (speech/) | Code: Apache-2.0. **Model weights: CC-BY-NC (non-commercial only)** |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) / OpenAI Whisper | Speech-to-text + language detection | MIT |
| [Anthropic Claude API](https://www.anthropic.com/legal) | Brain + web search | Anthropic's commercial terms |
| [Microsoft Azure AI Speech](https://learn.microsoft.com/legal/cognitive-services/speech-service/speech-to-text/data-privacy-security) | Speech recognition and neural voices (default speech engine) | Microsoft Online Services terms; audio is not stored after processing |
| [DeepSeek API](https://platform.deepseek.com) | Optional brain | DeepSeek API terms |
| [Google Gemini API](https://ai.google.dev/gemini-api/terms) | Brain, speech recognition and voice (default speech engine) | Gemini API terms. On the free tier Google may use content to improve its products |
| Qwen2.5 via Ollama (optional, local) | Offline brain | Qwen license (see model card) |
| [Open-Meteo](https://open-meteo.com) | Weather and air quality | Free for non-commercial use, CC BY 4.0 data |
| [Wikipedia](https://www.wikipedia.org) | Encyclopedia tool | CC BY-SA text |
| [ExchangeRate-API open access](https://www.exchangerate-api.com/docs/free) | Exchange rates | Free with attribution |
| Next.js, React | Web app | MIT |
| Nunito, Orbitron fonts | UI | SIL Open Font License |

**Commercial use:** because of the OmniVoice weights license, a paid product must switch to a
commercially licensed voice model (e.g. a Qwen3-TTS fine-tune, Apache-2.0) or obtain a license.

**Voices:** the default assistant voice is synthetic (designed by the model). Only clone a real
person's voice with that person's written consent.

**Bus data:** `web/data/erdenet.sample.json` is illustrative sample data, not an official schedule.
