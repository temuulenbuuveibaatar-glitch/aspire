import { ask, NoBrainConfigured, type Turn } from "@/lib/brain";
import { detectTextLanguage, isLang, type Lang } from "@/lib/lang";
import { requireUser, signedOut } from "@/lib/auth";
import { readText } from "@/lib/body";
import { googleAccessToken } from "@/lib/google-token";
import { cleanListItems } from "@/lib/lists";
import { parsePhoto, type Photo } from "@/lib/photo";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import type { DeviceContext, Reminder } from "@/lib/tools";
import { type Channel, CHANNELS, type Lesson, LESSON_LEVELS, type Routine, type Title } from "@/lib/tools/types";
import { whereFrom } from "@/lib/where";

export const maxDuration = 60;

// POST { text, lang?, history?, device?, tz?, city?, image? } -> { lang, reply, brain, actions, steps, sources }
// `image` = one JPEG, PNG or WebP photo (data: URL or base64), checked by lib/photo.ts parsePhoto,
// passed to a vision AI for this answer only and never stored or logged.
// `tz` (IANA, from the browser) and `city` (from the device) are optional; without them the
// Vercel network headers (x-vercel-ip-timezone / -city / -country / -latitude / -longitude) are used.
// `device` = what the person's device remembers (memory, reminders, routines, lessons,
// connected channels, and a location only if they turned on location sharing). It lives only on
// their device; we use it for this answer and keep nothing.
export async function POST(req: Request) {
  const limited = rateLimit(req, "ask", 20);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`ask-user:${user.id}`, 20); // one account cannot rotate IPs to run up the bill
  if (perUser) return perUser;

  // A photo makes the body large: refuse anything bigger than one photo plus the usual fields before parsing.
  const raw = await readText(req, MAX_BODY_BYTES);
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const body = parsed as {
    text?: unknown;
    lang?: unknown;
    history?: unknown;
    device?: RawDevice;
    tz?: unknown;
    timeZone?: unknown;
    city?: unknown;
    image?: unknown;
    images?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  let photo: Photo | undefined;
  if (body?.images !== undefined) return Response.json({ error: "one photo per message" }, { status: 400 });
  if (body?.image !== undefined) {
    const p = parsePhoto(body.image);
    if ("error" in p) return Response.json({ error: p.error }, { status: 400 });
    // Vision calls cost more: a tighter per-person bucket for photos.
    const photoLimited = rateLimitKey(`ask-photo:${user.id}`, 5);
    if (photoLimited) return photoLimited;
    photo = p;
  }

  const lang: Lang = isLang(body?.lang) ? body.lang : detectTextLanguage(text);
  const history: Turn[] = Array.isArray(body?.history)
    ? (body.history as Turn[])
        .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
        .slice(-8)
        .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) }))
    : [];

  try {
    // Gmail token only when a tool actually needs it (one Clerk call at most per request).
    let gmail: Promise<string | null> | undefined;
    const gmailToken = () => (gmail ??= googleAccessToken(user.id));
    const device = cleanDevice(body?.device);
    const result = await ask(text, lang, history, device, new Date(), {
      gmailToken,
      ...whereFrom(req.headers, body ?? {}, device),
      // A direct, signed-in request: the only kind that may queue jobs on their paired computer.
      userId: user.id,
      source: "web",
    }, photo);
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
  location?: unknown;
  lists?: unknown;
}

/** One photo (3 MB as base64 is about 4 MB) plus history and device context. Vercel stops at 4.5 MB anyway. */
const MAX_BODY_BYTES = 4_400_000;

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
  const s = (raw?.settings ?? {}) as { voice?: unknown; title?: unknown; units?: unknown };
  const settings = {
    voice: s.voice === "friday" ? ("friday" as const) : ("jarvis" as const),
    title: (s.title === "mr" || s.title === "mrs" ? s.title : "") as Title,
    units: s.units === "imperial" ? ("imperial" as const) : ("metric" as const),
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
  const location = cleanLocation(raw?.location);
  const lists = cleanListItems(raw?.lists);
  return { memory, reminders, settings, routines, lessons, connected, lists, ...(location ? { location } : {}) };
}

/** Rounded to 3 decimals (about 100 m): enough for directions and nearby places, no more. */
function cleanLocation(v: unknown): { lat: number; lng: number } | undefined {
  if (!isObj(v)) return undefined;
  const { lat, lng } = v;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return { lat: r3(lat), lng: r3(lng) };
}
