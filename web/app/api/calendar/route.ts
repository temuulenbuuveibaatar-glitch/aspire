import { requireUser, signedOut } from "@/lib/auth";
import { GoogleAuthError } from "@/lib/google";
import { insertEvent } from "@/lib/google-calendar";
import { googleAccessToken } from "@/lib/google-token";
import { isRRule } from "@/lib/rrule";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { zoneOr } from "@/lib/tools/time";

export const maxDuration = 30;

// POST { title, start, end, details?, location?, tz?, recurrence? } -> { ok: true, link }
// recurrence: only a rule lib/rrule.ts buildRRule can make (checked with isRRule).
// Called only after the person pressed "Add to Google Calendar" on a calendar card. Saves one
// event to their primary calendar with their Clerk-held Google token. Nothing is stored or logged.
// 403 { error: "not_connected" } when Calendar access was never granted or was revoked: the card
// then falls back to the plain Google Calendar link.

// An instant with an explicit offset, e.g. 2026-11-21T07:00:00.000Z or 2026-11-21T15:00+08:00.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const instant = (v: unknown): number => (typeof v === "string" && ISO.test(v) ? Date.parse(v) : NaN);
const text = (v: unknown, max: number): string | null => (v === undefined ? "" : typeof v === "string" && v.length <= max ? v.trim() : null);

export async function POST(req: Request) {
  const limited = rateLimit(req, "calendar", 10);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`calendar-user:${user.id}`, 30); // one account cannot rotate IPs to run up the bill
  if (perUser) return perUser;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = text(body?.title, 200);
  const details = text(body?.details, 1000);
  const location = text(body?.location, 300);
  const start = instant(body?.start);
  const end = instant(body?.end);
  if (!title) return Response.json({ error: "bad_title" }, { status: 400 });
  if (details === null || location === null) return Response.json({ error: "bad_text" }, { status: 400 });
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return Response.json({ error: "bad_time" }, { status: 400 });
  const recurrence = body?.recurrence ?? undefined;
  if (recurrence !== undefined && !isRRule(recurrence)) return Response.json({ error: "bad_recurrence" }, { status: 400 });

  const token = await googleAccessToken(user.id);
  if (!token) return Response.json({ error: "not_connected" }, { status: 403 });
  try {
    const { htmlLink } = await insertEvent(token, {
      title,
      startISO: new Date(start).toISOString(),
      endISO: new Date(end).toISOString(),
      tz: zoneOr(body?.tz),
      location,
      details,
      recurrence,
    });
    return Response.json({ ok: true, link: htmlLink.startsWith("https://") ? htmlLink : "" });
  } catch (e) {
    if (e instanceof GoogleAuthError) return Response.json({ error: "not_connected" }, { status: 403 });
    console.error("[calendar] insert failed", e instanceof Error ? e.name : "error");
    return Response.json({ error: "calendar_failed" }, { status: 502 });
  }
}
