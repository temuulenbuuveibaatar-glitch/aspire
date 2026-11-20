import { isLang } from "@/lib/lang";
import { SpeechOffline, synthesize } from "@/lib/speech";

import { requireUser, signedOut } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// POST { text, lang, voice?: "jarvis" | "friday" } -> audio
export async function POST(req: Request) {
  const limited = rateLimit(req, "speak", 30);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();

  const body = (await req.json().catch(() => null)) as { text?: unknown; lang?: unknown; voice?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 600) : "";
  if (!text || !isLang(body?.lang)) return Response.json({ error: "text and lang are required" }, { status: 400 });

  try {
    const audio = await synthesize(text, body.lang, body.voice === "friday" ? "friday" : "jarvis");
    return new Response(audio.body, {
      headers: { "Content-Type": audio.contentType, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof SpeechOffline) {
      console.error("speak:", e.message);
      return Response.json({ error: "voice_offline" }, { status: 503 });
    }
    throw e;
  }
}
