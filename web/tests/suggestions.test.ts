import { describe, expect, it } from "vitest";
import type { Ambient } from "@/lib/ambient-types";
import { LANGS } from "@/lib/lang";
import { buildSuggestions, currencyPair, deviceRegion } from "@/lib/suggestions";

const PICTOGRAPH = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

const ambient = (patch: Partial<Ambient> = {}): Ambient => ({
  place: "Berlin",
  coords: null,
  locatedBy: "network",
  sky: { kind: "rain", intensity: 0.6, isDay: true, windKph: 10, cloudCover: 90 },
  weather: { tempC: 8, feelsC: 5, text: "Rain", days: [{ date: "2026-11-21", minC: 4, maxC: 9, text: "", kind: "rain", precipChance: 80 }] },
  air: { aqi: 160, category: "unhealthy" },
  traffic: null,
  stops: [{ name: "Alexanderplatz", distanceM: 200 }],
  timeZone: "Europe/Berlin",
  localHour: 8,
  ...patch,
});

describe("starters from context", () => {
  it("puts rain, poor air, the briefing and the nearest stop first", () => {
    const s = buildSuggestions({ ambient: ambient(), hour: 8, lang: "en", tags: ["de-DE"] });
    expect(s.map((x) => x.kind)).toEqual(["rain", "air", "briefing", "bus"]);
    expect(s[3].label).toBe("Next bus from Alexanderplatz?");
  });

  it("falls back to general starters with no data, in every language, without symbols", () => {
    for (const lang of LANGS) {
      const s = buildSuggestions({ ambient: null, hour: 15, lang, tags: [] });
      expect(s).toHaveLength(4);
      for (const x of s) expect(x.label).not.toMatch(PICTOGRAPH);
    }
  });

  it("never claims rain when the sky is a placeholder", () => {
    const a = ambient({ sky: { kind: "rain", intensity: 0, isDay: true, windKph: null, cloudCover: null, known: false }, weather: null });
    const s = buildSuggestions({ ambient: a, hour: 15, lang: "en" });
    expect(s[0].kind).not.toBe("rain");
  });
});

describe("currency pair", () => {
  it("uses the device region's currency first", () => {
    expect(currencyPair(deviceRegion(["mn-MN"]))).toEqual(["MNT", "USD"]);
    expect(currencyPair(deviceRegion(["en-US"]))).toEqual(["USD", "EUR"]);
    expect(currencyPair(null)).toEqual(["USD", "EUR"]);
  });
});
