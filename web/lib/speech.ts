// Speech: listening (speech-to-text + language) and talking (text-to-speech).
//
// Two engines:
//  - "gemini"    Google Gemini API (free tier): no server to run. Default when
//                GEMINI_API_KEY is set and SPEECH_URL is not.
//  - "omnivoice" our own engine (speech/ folder: Whisper + OmniVoice) on a GPU box.
// There is deliberately no browser speech fallback.

import { isLang, LANG_NAMES, type Lang } from "@/lib/lang";

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

type Engine = "gemini" | "omnivoice";

export function speechEngine(): Engine | null {
  const forced = process.env.SPEECH_PROVIDER?.toLowerCase();
  if (forced === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (forced === "omnivoice") return process.env.SPEECH_URL ? "omnivoice" : null;
  if (process.env.SPEECH_URL) return "omnivoice";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export async function transcribe(audio: Blob): Promise<SttResult> {
  const engine = speechEngine();
  if (engine === "gemini") return geminiTranscribe(audio);
  if (engine === "omnivoice") return omnivoiceTranscribe(audio);
  throw new SpeechOffline();
}

export async function synthesize(text: string, lang: Lang): Promise<Audio> {
  const engine = speechEngine();
  if (engine === "gemini") return geminiSpeak(text, lang);
  if (engine === "omnivoice") return omnivoiceSpeak(text, lang);
  throw new SpeechOffline();
}

// ---------------------------------------------------------------------------
// Google Gemini (Interactions API)

const INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";
const STT_MODEL = () => process.env.GEMINI_STT_MODEL ?? "gemini-3.8-flash";
const TTS_MODEL = () => process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-lite-tts";
const TTS_VOICE = () => process.env.GEMINI_TTS_VOICE ?? "Sulafat"; // "Warm"
const TTS_STYLE =
  process.env.GEMINI_TTS_STYLE ?? "warm, gentle and caring, like a kind grandchild; speaking slowly and clearly";

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
  const r = await interact(
    {
      model: STT_MODEL(),
      input: [
        { type: "text", text: STT_PROMPT },
        { type: "audio", data, mime_type: mime },
      ],
    },
    30_000,
  );
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

async function geminiSpeak(text: string, lang: Lang): Promise<Audio> {
  const r = await interact(
    {
      model: TTS_MODEL(),
      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text,
              annotations: [{ type: "speech_metadata", style: `${TTS_STYLE}; ${LANG_NAMES[lang].english}` }],
            },
          ],
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: TTS_VOICE() }] },
    },
    60_000,
  );
  const part = outputParts(r, "audio").at(-1);
  if (!part?.data) throw new SpeechOffline("Gemini returned no audio");
  const bytes = Buffer.from(part.data, "base64");
  const isWav = bytes.subarray(0, 4).toString("ascii") === "RIFF";
  return { body: new Uint8Array(isWav ? bytes : pcmToWav(bytes, 24_000)), contentType: "audio/wav" };
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
