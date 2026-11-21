import { chooseSpokenLanguage, isLang } from "@/lib/lang";
import { SpeechOffline, transcribe } from "@/lib/speech";

import { requireUser, signedOut } from "@/lib/auth";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

export const maxDuration = 60;
const MAX_AUDIO = 4_000_000;
const MAX_UPLOAD = MAX_AUDIO + 64_000; // the audio plus the form's boundaries and the language hint

// POST multipart { audio } -> { text, lang }
export async function POST(req: Request) {
  const limited = rateLimit(req, "listen", 20);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`listen-user:${user.id}`, 15); // one account cannot rotate IPs to run up the bill
  if (perUser) return perUser;

  // Refuse an oversized upload before reading it (the size check below needs the parsed form).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD) return Response.json({ error: "audio too long" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "audio is required" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO) return Response.json({ error: "audio too long" }, { status: 413 });

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
