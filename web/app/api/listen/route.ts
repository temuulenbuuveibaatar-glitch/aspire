import { chooseSpokenLanguage, isLang } from "@/lib/lang";
import { SpeechOffline, transcribe } from "@/lib/speech";

import { requireUser, signedOut } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// POST multipart { audio } -> { text, lang }
export async function POST(req: Request) {
  const limited = rateLimit(req, "listen", 20);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "audio is required" }, { status: 400 });
  }
  if (audio.size > 4_000_000) return Response.json({ error: "audio too long" }, { status: 413 });

  try {
    // The language the person has been using (validated): settles Mongolian vs Russian close calls.
    const h = form?.get("hint");
    const hint = isLang(h) ? h : undefined;
    const stt = await transcribe(audio, hint);
    const text = stt.text.trim();
    return Response.json({ text, lang: chooseSpokenLanguage(text, stt.probs, hint) });
  } catch (e) {
    if (e instanceof SpeechOffline) {
      console.error("listen:", e.message);
      return Response.json({ error: "voice_offline" }, { status: 503 });
    }
    throw e;
  }
}
