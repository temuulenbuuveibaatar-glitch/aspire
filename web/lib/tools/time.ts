// Time zone helpers. Aspire serves every country, so clock times are always read in the
// person's own IANA time zone (from the device, else the network), never a fixed offset.

/** Used only when nothing tells us where the person is. */
export const FALLBACK_TIME_ZONE = "UTC";

/** A valid IANA time zone name (e.g. "Europe/Berlin"), or null. */
export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== "string") return null;
  const t = tz.trim();
  if (!t || t.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(t)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: t }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** The zone to use for this request: the given one if valid, else UTC. */
export const zoneOr = (tz: unknown): string => validTimeZone(tz) ?? FALLBACK_TIME_ZONE;

function wallParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: n("year"), mo: n("month"), d: n("day"), h: n("hour") % 24, mi: n("minute"), s: n("second") };
}

/** Milliseconds the zone is ahead of UTC at that instant. */
function offsetMs(at: Date, timeZone: string): number {
  const p = wallParts(at, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(at.getTime() / 1000) * 1000;
}

/** "2026-11-21" + "08:30" read as a wall clock in `timeZone` -> the instant. Handles DST. */
export function zonedTime(date: string, time: string, timeZone: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Reject days the month does not have ("2026-02-30" would otherwise roll into March).
  if (Number.isNaN(wall) || new Date(wall).getUTCDate() !== d) return null;
  const zone = zoneOr(timeZone);
  const first = wall - offsetMs(new Date(wall), zone);
  const second = wall - offsetMs(new Date(first), zone);
  return new Date(second);
}

/** YYYY-MM-DD of that instant in the zone. */
export function dayIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zoneOr(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** 0..23 in the zone. */
export function hourIn(at: Date, timeZone: string): number {
  return wallParts(at, zoneOr(timeZone)).h;
}

/** HH:MM (24h) in the zone. */
export function clockIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zoneOr(timeZone), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

/** 05-11 morning, 12-17 afternoon, 18-22 evening, 23-04 night. */
export function partOfDay(hour: number): PartOfDay {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  if (hour >= 18 && hour <= 22) return "evening";
  return "night";
}
