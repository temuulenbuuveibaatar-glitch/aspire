import { requireUser, signedOut } from "@/lib/auth";
import { makeBriefing } from "@/lib/briefing";
import { googleAccessToken } from "@/lib/google-token";
import { isLang, type Lang } from "@/lib/lang";
import { rateLimit } from "@/lib/rate-limit";
import type { Reminder, Title } from "@/lib/tools/types";
import { whereFrom } from "@/lib/where";

export const maxDuration = 60;

// POST { lang, reminders, title?, tz?, city?, location? } -> { text, mailCount, gmailError, headlines? } (headlines: up to 3 from newsdata.io, shown on the card)
// `tz` and `city` come from the device; `location` only when the person shares it (rounded).
// Google tokens stay with Clerk; mail headers are used for this answer only and never stored.
export async function POST(req: Request) {
  const limited = rateLimit(req, "briefing", 6);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();

  const body = (await req.json().catch(() => null)) as {
    lang?: unknown;
    reminders?: unknown;
    title?: unknown;
    tz?: unknown;
    city?: unknown;
    location?: unknown;
  } | null;
  const lang: Lang = isLang(body?.lang) ? body.lang : "en";
  const title: Title = body?.title === "mr" || body?.title === "mrs" ? body.title : "";
  const reminders: Reminder[] = Array.isArray(body?.reminders)
    ? (body.reminders as Reminder[])
        .filter((r) => r && typeof r.id === "string" && typeof r.text === "string" && typeof r.at === "string")
        .slice(0, 30)
        .map((r) => ({ id: r.id.slice(0, 40), text: r.text.slice(0, 200), at: r.at.slice(0, 40), repeatDaily: r.repeatDaily === true }))
    : [];

  const location = roundedLocation(body?.location);
  const where = whereFrom(req.headers, { tz: body?.tz, city: body?.city }, { location });
  const accessToken = await googleAccessToken(user.id);
  const result = await makeBriefing({ lang, title, reminders, accessToken, now: new Date(), where, ...(location ? { location } : {}) });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

/** A shared device position, rounded to 2 decimals (about 1 km): enough for weather and air. */
function roundedLocation(v: unknown): { lat: number; lng: number } | undefined {
  if (!v || typeof v !== "object") return undefined;
  const { lat, lng } = v as { lat?: unknown; lng?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { lat: r2(lat), lng: r2(lng) };
}
