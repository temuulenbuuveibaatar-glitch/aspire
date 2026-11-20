import { ask, NoBrainConfigured, type Turn } from "@/lib/brain";
import { detectTextLanguage, isLang, type Lang } from "@/lib/lang";
import { rateLimit } from "@/lib/rate-limit";
import type { DeviceContext, Reminder } from "@/lib/tools";
import type { Title } from "@/lib/tools/types";

export const maxDuration = 60;

// POST { text, lang?, history?, device? } -> { lang, reply, brain, actions, steps }
// `device` = what the person's device remembers (memory + reminders). It lives
// only on their device; we use it for this answer and keep nothing.
export async function POST(req: Request) {
  const limited = rateLimit(req, "ask", 20);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    text?: unknown;
    lang?: unknown;
    history?: unknown;
    device?: { memory?: unknown; reminders?: unknown; settings?: unknown };
  } | null;
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
    const result = await ask(text, lang, history, cleanDevice(body?.device));
    return Response.json({ lang, ...result });
  } catch (e) {
    if (e instanceof NoBrainConfigured) return Response.json({ lang, error: "brain_not_configured" }, { status: 503 });
    console.error("All brains failed", e instanceof Error ? e.message.slice(0, 300) : e);
    return Response.json({ lang, error: "brain_error" }, { status: 502 });
  }
}

function cleanDevice(raw: { memory?: unknown; reminders?: unknown; settings?: unknown } | undefined): DeviceContext {
  const memory: Record<string, string> = {};
  if (raw?.memory && typeof raw.memory === "object") {
    for (const [k, v] of Object.entries(raw.memory as Record<string, unknown>).slice(0, 40)) {
      if (typeof v === "string") memory[k.slice(0, 60)] = v.slice(0, 200);
    }
  }
  const reminders: Reminder[] = Array.isArray(raw?.reminders)
    ? (raw.reminders as Reminder[])
        .filter((r) => r && typeof r.id === "string" && typeof r.text === "string" && typeof r.at === "string")
        .slice(0, 30)
        .map((r) => ({ id: r.id.slice(0, 40), text: r.text.slice(0, 200), at: r.at.slice(0, 40), repeatDaily: r.repeatDaily === true }))
    : [];
  const s = (raw?.settings ?? {}) as { voice?: unknown; title?: unknown };
  const settings = {
    voice: s.voice === "friday" ? ("friday" as const) : ("jarvis" as const),
    title: (s.title === "mr" || s.title === "mrs" ? s.title : "") as Title,
  };
  return { memory, reminders, settings };
}
