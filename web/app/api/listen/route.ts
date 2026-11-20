import { chooseSpokenLanguage } from "@/lib/lang";
import { SpeechOffline, transcribe } from "@/lib/speech";

import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// POST multipart { audio } -> { text, lang }
export async function POST(req: Request) {
  const limited = rateLimit(req, "listen", 20);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "audio is required" }, { status: 400 });
  }
  if (audio.size > 4_000_000) return Response.json({ error: "audio too long" }, { status: 413 });

  try {
    const stt = await transcribe(audio);
    const text = stt.text.trim();
    return Response.json({ text, lang: chooseSpokenLanguage(text, stt.probs) });
  } catch (e) {
    if (e instanceof SpeechOffline) return Response.json({ error: "voice_offline" }, { status: 503 });
    throw e;
  }
}
