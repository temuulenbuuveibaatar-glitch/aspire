// When the morning briefing plays: once per calendar day in Mongolia. Safe for the browser.

const TZ = "Asia/Ulaanbaatar";

/** YYYY-MM-DD in Mongolia time. */
export function mongoliaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True on the first open of a new Mongolia calendar day (or the very first open ever). */
export function shouldBrief(lastBriefingDate: string | undefined | null, now: Date): boolean {
  return lastBriefingDate !== mongoliaDate(now);
}
