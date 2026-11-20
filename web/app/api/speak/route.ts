import { isLang } from "@/lib/lang";
import { SpeechOffline, synthesize } from "@/lib/speech";

import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// POST { text, lang } -> audio/wav from our own voice engine
export async function POST(req: Request) {
  const limited = rateLimit(req, "speak", 30);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { text?: unknown; lang?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 600) : "";
  if (!text || !isLang(body?.lang)) return Response.json({ error: "text and lang are required" }, { status: 400 });

  try {
    const audio = await synthesize(text, body.lang);
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
