import { ask, NoBrainConfigured, type Turn } from "@/lib/brain";
import { detectTextLanguage, isLang, type Lang } from "@/lib/lang";
import { requireUser, signedOut } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type { DeviceContext, Reminder } from "@/lib/tools";
import { type Channel, CHANNELS, type Lesson, LESSON_LEVELS, type Routine, type Title } from "@/lib/tools/types";

export const maxDuration = 60;

// POST { text, lang?, history?, device? } -> { lang, reply, brain, actions, steps, sources }
// `device` = what the person's device remembers (memory, reminders, routines, lessons,
// connected channels). It lives only on their device; we use it for this answer and keep nothing.
export async function POST(req: Request) {
  const limited = rateLimit(req, "ask", 20);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();

  const body = (await req.json().catch(() => null)) as {
    text?: unknown;
    lang?: unknown;
    history?: unknown;
    device?: RawDevice;
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

interface RawDevice {
  memory?: unknown;
  reminders?: unknown;
  settings?: unknown;
  routines?: unknown;
  lessons?: unknown;
  connected?: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object";
const clampInt = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min);

function cleanDevice(raw: RawDevice | undefined): DeviceContext {
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
  const routines: Routine[] = Array.isArray(raw?.routines)
    ? raw.routines
        .filter((r): r is Routine => isObj(r) && typeof r.id === "string" && typeof r.trigger === "string" && typeof r.steps === "string")
        .slice(0, 20)
        .map((r) => ({ id: r.id.slice(0, 40), trigger: r.trigger.slice(0, 60), steps: r.steps.slice(0, 500) }))
    : [];
  const lessons: Lesson[] = Array.isArray(raw?.lessons)
    ? raw.lessons
        .filter((l): l is Lesson => isObj(l) && typeof l.id === "string" && typeof l.topic === "string")
        .slice(0, 20)
        .map((l) => ({
          id: l.id.slice(0, 40),
          topic: l.topic.slice(0, 120),
          level: (LESSON_LEVELS as readonly string[]).includes(l.level) ? l.level : "beginner",
          step: clampInt(l.step, 1, 1000),
          score: clampInt(l.score, 0, 100),
        }))
    : [];
  const connected: Channel[] = Array.isArray(raw?.connected)
    ? CHANNELS.filter((c) => (raw.connected as unknown[]).includes(c))
    : [];
  return { memory, reminders, settings, routines, lessons, connected };
}
