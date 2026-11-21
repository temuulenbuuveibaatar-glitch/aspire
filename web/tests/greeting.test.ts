import { describe, expect, it } from "vitest";
import type { Ambient } from "@/lib/ambient-types";
import { greeting, notableFrom } from "@/lib/greeting";
import { LANGS } from "@/lib/lang";

const base: Ambient = {
  place: "Lagos, Nigeria",
  coords: { lat: 6.45, lng: 3.39 },
  locatedBy: "network",
  sky: { kind: "clear", intensity: 0, isDay: false, windKph: 5, cloudCover: 10 },
  weather: null,
  air: { aqi: 40, category: "good", pm25: 8, pm10: 12, dominant: null },
  traffic: { level: "light", delayMin: 1, ratio: 1.05, towards: "to the city centre" },
  stops: [],
  timeZone: "Africa/Lagos",
  localHour: 20,
  source: { weather: "google", air: "google" },
  updatedAt: "2026-11-21T19:00:00.000Z",
};

const GLYPH = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

describe("greeting", () => {
  it("is the short Jarvis line when nothing is notable", () => {
    expect(greeting("en", "mr", 20, base, true)).toBe("Good evening, sir. How is it going?");
    expect(greeting("en", "mr", 20, base, false)).toBe("Good evening, sir.");
    expect(greeting("en", "mrs", 8, null, true)).toBe("Good morning, ma'am. How is it going?");
  });

  it("adds exactly one notable fact", () => {
    const snow: Ambient = { ...base, sky: { ...base.sky, kind: "snow", intensity: 0.6 } };
    expect(greeting("en", "mr", 18, snow, true)).toBe("Good evening, sir. It is snowing outside.");
    const bus: Ambient = {
      ...base,
      stops: [{ name: "Central", distanceM: 200, walkMin: 3, mapsUrl: "https://maps.google.com", lines: [{ route: "12", minutes: 4 }, { route: "3", minutes: 25 }] }],
    };
    expect(greeting("en", "mr", 13, bus, false)).toBe("Good afternoon, sir. Bus 12 leaves in 4 minutes.");
    expect(notableFrom({ ...base, air: { ...base.air!, category: "unhealthy", aqi: 170 }, sky: snow.sky })?.kind).toBe("air");
    expect(notableFrom({ ...base, traffic: { ...base.traffic!, level: "heavy" } })?.kind).toBe("traffic");
  });

  it("never exclaims, lists capabilities or uses emojis, in any language", () => {
    const storm: Ambient = { ...base, sky: { ...base.sky, kind: "storm", intensity: 1 } };
    for (const lang of LANGS) {
      for (const a of [base, storm, null]) {
        const g = greeting(lang, "mr", 9, a, true);
        expect(g).not.toMatch(/[!！]/);
        expect(g).not.toMatch(GLYPH);
        expect(g).not.toMatch(/I can|weather, |remind/i);
        expect(g.length).toBeLessThanOrEqual(90);
      }
    }
  });
});
