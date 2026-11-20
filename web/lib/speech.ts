// Speech: listening (speech-to-text + language) and talking (text-to-speech).
//
// Three engines, tried in order (the next one is used if one fails):
//  - "omnivoice" our own engine (speech/ folder: Whisper + OmniVoice) on a GPU box.
//  - "azure"     Azure Speech (free F0 tier: 500k voice characters + 5 h listening
//                a month). Neural voices for all 5 languages incl. Mongolian.
//  - "gemini"    Google Gemini API.
// SPEECH_PROVIDER=azure|gemini|omnivoice puts one engine first.
// There is deliberately no browser speech fallback.

import { detectTextLanguage, greetingLanguage, isLang, LANG_NAMES, LANGS, type Lang } from "@/lib/lang";
import type { VoiceStyle } from "@/lib/tools/types";

export class SpeechOffline extends Error {
  constructor(msg = "Speech engine is not configured or not reachable") {
    super(msg);
  }
}

export interface SttResult {
  text: string;
  language: string;
  probs: Record<string, number>;
}
export interface Audio {
  body: BodyInit;
  contentType: string;
}

type Engine = "omnivoice" | "azure" | "gemini";

const configured: Record<Engine, () => boolean> = {
  omnivoice: () => !!process.env.SPEECH_URL,
  azure: () => !!process.env.AZURE_SPEECH_KEY && !!(process.env.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_ENDPOINT),
  gemini: () => !!process.env.GEMINI_API_KEY,
};

/** Configured engines, best first. */
export function speechEngines(): Engine[] {
  const forced = process.env.SPEECH_PROVIDER?.toLowerCase() as Engine | undefined;
  const order: Engine[] = ["omnivoice", "azure", "gemini"];
  if (forced && order.includes(forced)) order.sort((a, b) => Number(b === forced) - Number(a === forced));
  return order.filter((e) => configured[e]());
}

export function speechEngine(): Engine | null {
  return speechEngines()[0] ?? null;
}

async function firstWorking<T>(what: string, run: Record<Engine, () => Promise<T>>): Promise<T> {
  let lastError: unknown = new SpeechOffline();
  for (const engine of speechEngines()) {
    try {
      return await run[engine]();
    } catch (e) {
      lastError = e;
      console.error(`${what}: ${engine} failed:`, e instanceof Error ? e.message.slice(0, 200) : e);
    }
  }
  throw lastError instanceof SpeechOffline ? lastError : new SpeechOffline(String(lastError));
}

export async function transcribe(audio: Blob): Promise<SttResult> {
  return firstWorking("listen", {
    omnivoice: () => omnivoiceTranscribe(audio),
    azure: () => azureTranscribe(audio),
    gemini: () => geminiTranscribe(audio),
  });
}

export async function synthesize(text: string, lang: Lang, voice: VoiceStyle = "jarvis"): Promise<Audio> {
  return firstWorking("speak", {
    omnivoice: () => omnivoiceSpeak(text, lang),
    azure: () => azureSpeak(text, lang, voice),
    gemini: () => geminiSpeak(text, lang, voice),
  });
}

// ---------------------------------------------------------------------------
// Azure Speech (REST: fast transcription + neural text-to-speech)

const AZURE_LOCALES: Record<Lang, string> = { mn: "mn-MN", zh: "zh-CN", en: "en-US", ru: "ru-RU", de: "de-DE" };
// "jarvis" = calm male butler voices (British English, like the films);
// "friday" = female voices (Irish English, like FRIDAY). Override with
// AZURE_VOICE_JARVIS_MN, AZURE_VOICE_FRIDAY_EN, ...
export const AZURE_VOICES: Record<VoiceStyle, Record<Lang, string>> = {
  jarvis: {
    mn: "mn-MN-BataaNeural",
    zh: "zh-CN-YunyangNeural",
    en: "en-GB-RyanNeural",
    ru: "ru-RU-DmitryNeural",
    de: "de-DE-ConradNeural",
  },
  friday: {
    mn: "mn-MN-YesuiNeural",
    zh: "zh-CN-XiaoxiaoNeural",
    en: "en-IE-EmilyNeural",
    ru: "ru-RU-SvetlanaNeural",
    de: "de-DE-KatjaNeural",
  },
};
const azureVoice = (lang: Lang, voice: VoiceStyle) =>
  process.env[`AZURE_VOICE_${voice.toUpperCase()}_${lang.toUpperCase()}`] || AZURE_VOICES[voice][lang];
const AZURE_RATE = () => process.env.AZURE_SPEECH_RATE ?? "0%";
const azureAudioCache = new Map<string, Uint8Array<ArrayBuffer>>();

function azureSttUrl() {
  const base = process.env.AZURE_SPEECH_ENDPOINT?.replace(/\/$/, "") || `https://${process.env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com`;
  return `${base}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;
}

class NoLanguageHeard extends Error {}

interface AzurePass {
  text: string;
  phrases: Array<{ text?: string; locale?: string; confidence?: number }>;
}

/** One fast-transcription request; retries briefly when the free tier says "too many requests". */
async function azureRequest(audio: Blob, locales: string[]): Promise<AzurePass> {
  for (let attempt = 0; ; attempt++) {
    const res = await azureFetch(audio, locales);
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      continue;
    }
    if (res.status === 422) throw new NoLanguageHeard();
    if (!res.ok) throw new SpeechOffline(`Azure listening error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const r = (await res.json()) as { combinedPhrases?: Array<{ text?: string }>; phrases?: AzurePass["phrases"] };
    return { text: (r.combinedPhrases ?? []).map((p) => p.text ?? "").join(" ").trim(), phrases: r.phrases ?? [] };
  }
}

/** Short clips ("hi", "ni hao") are too short for Azure's language detection,
 *  so each language transcribes them and the one whose words fit its own
 *  language wins (greetings first, then script/words, then confidence). */
export function pickShortClip(
  tries: Array<{ lang: Lang; text: string; confidence: number }>,
  detected: Lang | null,
): { lang: Lang; text: string } | null {
  const valid = tries.filter((t) => t.text.trim());
  // Chinese recognition maps almost any short sound to characters with high confidence.
  const score = (t: { lang: Lang; confidence: number }) => t.confidence - (t.lang === "zh" ? 0.25 : 0);
  const best = <T extends { lang: Lang; confidence: number }>(list: T[]) => list.sort((a, b) => score(b) - score(a))[0];
  return (
    best(valid.filter((t) => greetingLanguage(t.text) === t.lang)) ??
    valid.find((t) => t.lang === detected && detectTextLanguage(t.text) === t.lang) ??
    best(valid.filter((t) => detectTextLanguage(t.text) === t.lang)) ??
    best(valid) ??
    null
  );
}

const isShort = (text: string) => text.replace(/[\p{P}\p{S}\s]/gu, "").length <= 12;

async function azureTranscribe(audio: Blob): Promise<SttResult> {
  let lid: AzurePass | null = null;
  try {
    lid = await azureRequest(audio, Object.values(AZURE_LOCALES));
  } catch (e) {
    if (!(e instanceof NoLanguageHeard)) throw e;
  }
  if (lid && !isShort(lid.text)) return lidResult(lid);

  const detected = lid ? (lidResult(lid).language as Lang) : null;
  const tries = await Promise.all(
    LANGS.map(async (lang) => {
      try {
        const r = await azureRequest(audio, [AZURE_LOCALES[lang]]);
        const c = r.phrases.map((p) => p.confidence ?? 0);
        return { lang, text: r.text, confidence: c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0 };
      } catch {
        return { lang, text: "", confidence: 0 };
      }
    }),
  );
  const pick = pickShortClip(tries, isLang(detected) ? detected : null);
  if (!pick) return lid ? lidResult(lid) : { text: "", language: "", probs: {} };
  return { text: pick.text, language: pick.lang, probs: { [pick.lang]: 0.9 } };
}

function azureFetch(audio: Blob, locales: string[]): Promise<Response> {
  const form = new FormData();
  const ext = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a" }[(audio.type || "").split(";")[0]] ?? "webm";
  form.append("audio", audio, `speech.${ext}`);
  form.append("definition", JSON.stringify({ locales, profanityFilterMode: "None" }));
  return fetch(azureSttUrl(), {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY ?? "" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => {
    throw new SpeechOffline(String(e));
  });
}

function lidResult(r: AzurePass): SttResult {
  const text = r.text;
  // Weight each detected locale by how much text it covered.
  const probs: Record<string, number> = {};
  let total = 0;
  for (const p of r.phrases ?? []) {
    const lang = p.locale?.slice(0, 2).toLowerCase();
    const n = (p.text ?? "").length;
    if (!lang || !n) continue;
    probs[lang] = (probs[lang] ?? 0) + n;
    total += n;
  }
  for (const k of Object.keys(probs)) probs[k] = probs[k] / total;
  const language = Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return { text, language, probs };
}

const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function azureSsml(text: string, lang: Lang, voice: VoiceStyle = "jarvis"): string {
  const name = azureVoice(lang, voice);
  const locale = /^[a-z]{2,3}-[A-Z]{2}/.exec(name)?.[0] ?? AZURE_LOCALES[lang];
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${xml(name)}"><prosody rate="${xml(AZURE_RATE())}">${xml(text)}</prosody></voice></speak>`
  );
}

async function azureSpeak(text: string, lang: Lang, voice: VoiceStyle): Promise<Audio> {
  const key = `${voice}:${lang}:${text}`;
  const cached = azureAudioCache.get(key);
  if (cached) return { body: cached, contentType: "audio/mpeg" };
  const region = process.env.AZURE_SPEECH_REGION;
  const url = region
    ? `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
    : `${process.env.AZURE_SPEECH_ENDPOINT!.replace(/\/$/, "")}/tts/cognitiveservices/v1`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY ?? "",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "emee-tovch",
    },
    body: azureSsml(text, lang, voice),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => {
    throw new SpeechOffline(String(e));
  });
  if (!res.ok) throw new SpeechOffline(`Azure voice error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const mp3 = new Uint8Array(await res.arrayBuffer());
  if (!mp3.length) throw new SpeechOffline("Azure returned no audio");
  if (azureAudioCache.size > 300) azureAudioCache.delete(azureAudioCache.keys().next().value!);
  azureAudioCache.set(key, mp3);
  return { body: mp3, contentType: "audio/mpeg" };
}

// ---------------------------------------------------------------------------
// Google Gemini (Interactions API)

const INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
// Tried in order: free-tier models get "high demand" errors, so fall back fast.
const STT_MODELS = () =>
  (process.env.GEMINI_STT_MODEL ?? "gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.8-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
// Each voice model has its own free-tier daily quota, so chain them.
const TTS_MODELS = () =>
  (
    process.env.GEMINI_TTS_MODEL ??
    "gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
// Same sentence -> same audio: reuse it instead of spending quota again.
const ttsCache = new Map<string, Uint8Array<ArrayBuffer>>();
const TTS_VOICES: Record<VoiceStyle, () => string> = {
  jarvis: () => process.env.GEMINI_TTS_VOICE_JARVIS ?? "Charon", // "Informative"
  friday: () => process.env.GEMINI_TTS_VOICE_FRIDAY ?? "Sulafat", // "Warm"
};
const TTS_STYLES: Record<VoiceStyle, string> = {
  jarvis: "calm, confident and polished, like a refined AI butler; clear, natural pace",
  friday: "warm, bright and friendly AI assistant; clear, natural pace",
};

interface InteractionContent {
  type?: string;
  text?: string;
  data?: string;
  mime_type?: string;
}
interface InteractionResponse {
  output_text?: string;
  steps?: Array<{ type?: string; content?: InteractionContent[] }>;
}

async function interact(body: unknown, timeoutMs: number): Promise<InteractionResponse> {
  const res = await fetch(INTERACTIONS, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e) => {
    throw new SpeechOffline(String(e));
  });
  if (!res.ok) throw new SpeechOffline(`Gemini speech error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as InteractionResponse;
}

function outputParts(r: InteractionResponse, type: string): InteractionContent[] {
  return (r.steps ?? []).filter((s) => s.type === "model_output").flatMap((s) => (s.content ?? []).filter((c) => c.type === type));
}

const STT_PROMPT = `Transcribe exactly what the speaker says, word for word, in the original language and script (Mongolian in Cyrillic, Chinese in Simplified characters). Do not translate or answer.
The speaker uses one of: Mongolian (mn), Chinese (zh), English (en), Russian (ru), German (de).
Reply with only this JSON: {"text": "<transcript>", "language": "<mn|zh|en|ru|de>"}
If nothing is said, reply {"text": "", "language": ""}.`;

async function geminiTranscribe(audio: Blob): Promise<SttResult> {
  const mime = (audio.type || "audio/webm").split(";")[0];
  const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
  let r: InteractionResponse | null = null;
  let lastError: unknown;
  for (const model of STT_MODELS()) {
    try {
      r = await interact(
        {
          model,
          input: [
            { type: "text", text: STT_PROMPT },
            { type: "audio", data, mime_type: mime },
          ],
        },
        12_000,
      );
      break;
    } catch (e) {
      lastError = e;
      console.error(`listen: ${model} failed, trying next:`, e instanceof Error ? e.message.slice(0, 160) : e);
    }
  }
  if (!r) throw lastError instanceof Error ? lastError : new SpeechOffline();
  const raw = r.output_text ?? outputParts(r, "text").map((c) => c.text ?? "").join("");
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  let text = "";
  let language = "";
  try {
    const parsed = JSON.parse(json ?? "{}") as { text?: unknown; language?: unknown };
    text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    language = typeof parsed.language === "string" ? parsed.language.trim().toLowerCase() : "";
  } catch {
    text = raw.trim(); // model ignored the format: keep the words, detect language from them
  }
  return { text, language, probs: isLang(language) ? { [language]: 0.9 } : {} };
}

async function geminiSpeak(text: string, lang: Lang, voice: VoiceStyle = "jarvis"): Promise<Audio> {
  const key = `${voice}:${lang}:${text}`;
  const cached = ttsCache.get(key);
  if (cached) return { body: cached, contentType: "audio/wav" };

  let lastError: unknown;
  for (const model of TTS_MODELS()) {
    try {
      const r = await interact(
        {
          model,
          input: [
            {
              type: "user_input",
              content: [
                {
                  type: "text",
                  text,
                  annotations: [{ type: "speech_metadata", style: `${TTS_STYLES[voice]}; ${LANG_NAMES[lang].english}` }],
                },
              ],
            },
          ],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice: TTS_VOICES[voice]() }] },
        },
        30_000,
      );
      const part = outputParts(r, "audio").at(-1);
      if (!part?.data) throw new SpeechOffline(`${model} returned no audio`);
      const bytes = Buffer.from(part.data, "base64");
      const isWav = bytes.subarray(0, 4).toString("ascii") === "RIFF";
      const wav = new Uint8Array(isWav ? bytes : pcmToWav(bytes, 24_000));
      if (ttsCache.size > 300) ttsCache.delete(ttsCache.keys().next().value!);
      ttsCache.set(key, wav);
      return { body: wav, contentType: "audio/wav" };
    } catch (e) {
      lastError = e;
      console.error(`speak: ${model} failed, trying next:`, e instanceof Error ? e.message.slice(0, 160) : e);
    }
  }
  throw lastError instanceof Error ? lastError : new SpeechOffline();
}

/** Wrap raw 16-bit mono PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// ---------------------------------------------------------------------------
// Our own engine (speech/ folder) on a GPU machine

function omnivoiceConfig() {
  const url = process.env.SPEECH_URL?.replace(/\/$/, "");
  if (!url) throw new SpeechOffline();
  const headers: Record<string, string> = {};
  if (process.env.SPEECH_TOKEN) headers.Authorization = `Bearer ${process.env.SPEECH_TOKEN}`;
  return { url, headers };
}

async function omnivoiceTranscribe(audio: Blob): Promise<SttResult> {
  const { url, headers } = omnivoiceConfig();
  const form = new FormData();
  form.append("audio", audio, "speech.webm");
  const res = await fetch(`${url}/stt`, { method: "POST", body: form, headers, signal: AbortSignal.timeout(30_000) }).catch(
    (e) => {
      throw new SpeechOffline(String(e));
    },
  );
  if (!res.ok) throw new SpeechOffline(`STT failed: ${res.status}`);
  return (await res.json()) as SttResult;
}

async function omnivoiceSpeak(text: string, lang: Lang): Promise<Audio> {
  const { url, headers } = omnivoiceConfig();
  const res = await fetch(`${url}/tts`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
    signal: AbortSignal.timeout(60_000),
  }).catch((e) => {
    throw new SpeechOffline(String(e));
  });
  if (!res.ok || !res.body) throw new SpeechOffline(`TTS failed: ${res.status}`);
  return { body: res.body, contentType: res.headers.get("Content-Type") ?? "audio/wav" };
}
