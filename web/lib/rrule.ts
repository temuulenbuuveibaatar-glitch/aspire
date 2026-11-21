// Weekly and monthly repeats for add_to_calendar (pension day, the heating bill, class and shift
// weekdays). The RRULE is built only from validated enums and numbers, never from the model's raw
// text, and isRRule() re-checks one that comes back from the browser (POST /api/calendar).

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const MAX_COUNT = 52;

export type Repeat =
  | { freq: "weekly"; weekdays: Weekday[]; count?: number }
  /** monthDay -1 = the last day of each month. Missing = the start date's day. */
  | { freq: "monthly"; monthDay?: number; count?: number };

/** Tool parameters, spread into add_to_calendar's properties (and required). */
export const REPEAT_PARAMS = {
  repeat: { type: "string", description: "Repeat the event: 'none', 'weekly' or 'monthly'", enum: ["none", "weekly", "monthly"] },
  repeat_on: {
    type: "string",
    description:
      "weekly: weekdays as MO,TU,WE,TH,FR,SA,SU (e.g. 'MO,WE'); monthly: day of month '1'-'28' or 'last'. Empty string = the same day as the first event.",
  },
  repeat_count: { type: "number", description: `How many times in all, 1-${MAX_COUNT}; 0 = until the person deletes it` },
};

/**
 * The model's repeat / repeat_on / repeat_count -> a Repeat, null for "none", or an error.
 * `startDay` is the first event's day of month: a monthly repeat from the 29th-31st becomes
 * "the last day of the month", so February and 30-day months are not skipped.
 */
export function parseRepeat(input: Record<string, unknown>, startDay: number): Repeat | null | { error: string } {
  const freq = typeof input.repeat === "string" ? input.repeat.trim().toLowerCase() : "";
  if (!freq || freq === "none") return null;
  const on = typeof input.repeat_on === "string" ? input.repeat_on.trim().toUpperCase() : "";
  const n = Number(input.repeat_count ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT) return { error: `repeat_count must be 0-${MAX_COUNT}` };
  const count = n > 0 ? { count: n } : {};
  if (freq === "weekly") {
    const days = on ? on.split(/[\s,]+/).filter(Boolean) : [];
    if (!days.every((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d))) return { error: "repeat_on for weekly must be weekdays like MO,WE,FR" };
    return { freq, weekdays: WEEKDAYS.filter((d) => days.includes(d)), ...count };
  }
  if (freq === "monthly") {
    if (on === "LAST") return { freq, monthDay: -1, ...count };
    if (!on) return startDay >= 29 ? { freq, monthDay: -1, ...count } : { freq, ...count };
    const day = /^\d{1,2}$/.test(on) ? Number(on) : 0;
    if (day < 1 || day > 31) return { error: "repeat_on for monthly must be a day 1-28 or 'last'" };
    return { freq, monthDay: day >= 29 ? -1 : day, ...count };
  }
  return { error: "repeat must be none, weekly or monthly" };
}

/** RFC 5545 rule, e.g. "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10". */
export function buildRRule(r: Repeat): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.freq === "weekly" && r.weekdays.length) parts.push(`BYDAY=${r.weekdays.join(",")}`);
  if (r.freq === "monthly" && r.monthDay !== undefined) parts.push(`BYMONTHDAY=${r.monthDay}`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  return `RRULE:${parts.join(";")}`;
}

const DAY = WEEKDAYS.join("|");
const RRULE = new RegExp(
  `^RRULE:FREQ=(?:WEEKLY(?:;BYDAY=(?:${DAY})(?:,(?:${DAY})){0,6})?|MONTHLY(?:;BYMONTHDAY=(?:-1|[1-9]|1\\d|2[0-8]))?)(?:;COUNT=(?:[1-9]|[1-4]\\d|5[0-2]))?$`,
);

/** Only rules buildRRule can make (for the browser's copy sent back to /api/calendar). */
export const isRRule = (v: unknown): v is string => typeof v === "string" && v.length <= 80 && RRULE.test(v);

/** The no-OAuth path: the Google Calendar template link with the repeat filled in. */
export const withRecur = (url: string, rrule: string): string => `${url}&recur=${encodeURIComponent(rrule)}`;

/** Spoken summary for the tool result, e.g. "weekly on MO,WE, 10 times". */
export function describeRepeat(r: Repeat): string {
  const when = r.freq === "weekly" ? (r.weekdays.length ? `weekly on ${r.weekdays.join(",")}` : "weekly") : r.monthDay === -1 ? "monthly on the last day" : r.monthDay ? `monthly on day ${r.monthDay}` : "monthly";
  return r.count ? `${when}, ${r.count} times` : `${when}, until deleted`;
}
