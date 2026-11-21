import "server-only";
// Google Calendar (primary calendar, events scope). Access tokens come from Clerk
// (lib/google-token.ts); nothing here is stored or logged.
import { GoogleAuthError } from "@/lib/google";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export const MAX_EVENTS = 25;

/** One event as the assistant sees it. `start`/`end` are ISO; all-day events use YYYY-MM-DD. */
export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
}

interface GEvent {
  summary?: string;
  status?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

async function calendar<T>(url: string, accessToken: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    // Read only the reason code; never echo the body (or the token) into logs or errors.
    const err = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] } } | null;
    const reasons = [...(err?.error?.errors ?? []), ...(err?.error?.details ?? [])].map((e) => e?.reason ?? "");
    throw new GoogleAuthError(res.status, res.status === 403 && reasons.some((r) => /insufficientPermissions|SCOPE_INSUFFICIENT/i.test(r)));
  }
  if (!res.ok) throw new Error(`Calendar returned ${res.status}`);
  return (await res.json()) as T;
}

/** Events between two instants, in start order (recurring events expanded). Throws GoogleAuthError on 401/403. */
export async function listEvents(accessToken: string, fromISO: string, toISO: string, tz: string): Promise<CalendarEvent[]> {
  const q = new URLSearchParams({
    timeMin: fromISO,
    timeMax: toISO,
    timeZone: tz,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(MAX_EVENTS),
  });
  const data = await calendar<{ items?: GEvent[] }>(`${API}?${q}`, accessToken);
  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      title: (e.summary ?? "").slice(0, 200),
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      allDay: !e.start?.dateTime,
      location: (e.location ?? "").slice(0, 200),
    }));
}

export interface NewEvent {
  title: string;
  startISO: string;
  endISO: string;
  tz: string;
  location?: string;
  details?: string;
}

/** Adds a timed event to the primary calendar. Throws GoogleAuthError on 401/403. */
export async function insertEvent(accessToken: string, ev: NewEvent): Promise<{ id: string; htmlLink: string }> {
  const out = await calendar<{ id?: string; htmlLink?: string }>(API, accessToken, {
    summary: ev.title,
    start: { dateTime: ev.startISO, timeZone: ev.tz },
    end: { dateTime: ev.endISO, timeZone: ev.tz },
    ...(ev.location ? { location: ev.location } : {}),
    ...(ev.details ? { description: ev.details } : {}),
  });
  return { id: out.id ?? "", htmlLink: out.htmlLink ?? "" };
}
