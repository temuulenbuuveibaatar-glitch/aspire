import { ask, NoBrainConfigured, type Turn } from "@/lib/brain";
import { detectTextLanguage, isLang, type Lang } from "@/lib/lang";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// POST { text, lang?, history? } -> { lang, reply }
// `lang` is passed when the speech engine already detected it from the voice.
export async function POST(req: Request) {
  const limited = rateLimit(req, "ask", 20);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { text?: unknown; lang?: unknown; history?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  const lang: Lang = isLang(body?.lang) ? body.lang : detectTextLanguage(text);
  const history: Turn[] = Array.isArray(body?.history)
    ? (body.history as Turn[])
        .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
        .slice(-8)
        .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) }))
    : [];

  try {
    const { reply, brain } = await ask(text, lang, history);
    return Response.json({ lang, reply, brain });
  } catch (e) {
    if (e instanceof NoBrainConfigured) return Response.json({ lang, error: "brain_not_configured" }, { status: 503 });
    console.error("All brains failed", e instanceof Error ? e.message : e);
    return Response.json({ lang, error: "brain_error" }, { status: 502 });
  }
}
