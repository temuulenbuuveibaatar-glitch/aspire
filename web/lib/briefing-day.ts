// When the morning briefing plays: once per calendar day where the person is (their device's
// time zone), in any country. Safe for the browser.

/** The device's IANA time zone, or UTC when the browser cannot tell. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** YYYY-MM-DD in a time zone (default: the device's own). */
export function localDate(now: Date, tz: string = deviceTimeZone()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

/** True on the first open of a new local calendar day (or the very first open ever). */
export function shouldBrief(lastBriefingDate: string | undefined | null, now: Date, tz?: string): boolean {
  return lastBriefingDate !== localDate(now, tz);
}
