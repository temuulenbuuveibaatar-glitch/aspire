// Client for our own speech engine (speech/ service: Whisper + OmniVoice).
// It runs on a GPU machine (AWS); Vercel calls it with a shared secret.

import type { Lang } from "@/lib/lang";

export class SpeechOffline extends Error {
  constructor(msg = "Speech engine is not configured or not reachable") {
    super(msg);
  }
}

function config() {
  const url = process.env.SPEECH_URL?.replace(/\/$/, "");
  if (!url) throw new SpeechOffline();
  const headers: Record<string, string> = {};
  if (process.env.SPEECH_TOKEN) headers.Authorization = `Bearer ${process.env.SPEECH_TOKEN}`;
  return { url, headers };
}

export interface SttResult {
  text: string;
  language: string;
  probs: Record<string, number>;
}

export async function transcribe(audio: Blob): Promise<SttResult> {
  const { url, headers } = config();
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

export async function synthesize(text: string, lang: Lang): Promise<Response> {
  const { url, headers } = config();
  const res = await fetch(`${url}/tts`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
    signal: AbortSignal.timeout(60_000),
  }).catch((e) => {
    throw new SpeechOffline(String(e));
  });
  if (!res.ok || !res.body) throw new SpeechOffline(`TTS failed: ${res.status}`);
  return res;
}
