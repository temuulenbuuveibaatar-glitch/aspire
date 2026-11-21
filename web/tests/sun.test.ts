// The real sun and its phases, the hour fallback, the demo override, the cached photo's trust boundary
// and the sky layer.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Sky } from "@/components/aspire/Sky";
import { phaseFromSun, phaseParam, skySun, sunPosition } from "@/lib/sun";
import { parseCachedPhoto } from "@/lib/use-ambient";

const ERDENET = { lat: 49.03, lng: 104.08 };

describe("sunPosition", () => {
  it("puts the June solstice noon sun over Erdenet at about 64 degrees", () => {
    // Solar noon at 104.08 E is about 05:05 UTC.
    const { altDeg, haDeg } = sunPosition(new Date("2026-06-21T05:05:00Z"), ERDENET.lat, ERDENET.lng);
    expect(altDeg).toBeGreaterThan(63.5);
    expect(altDeg).toBeLessThan(65.2);
    expect(Math.abs(haDeg)).toBeLessThan(3);
  });

  it("matches the equinox sun over London", () => {
    const { altDeg } = sunPosition(new Date("2026-03-20T12:10:00Z"), 51.5, -0.13);
    expect(altDeg).toBeGreaterThan(37.5);
    expect(altDeg).toBeLessThan(39.5);
  });
});

describe("phases", () => {
  it("classifies the sun's height and side of noon", () => {
    expect(phaseFromSun(-40, 170)).toBe("midnight");
    expect(phaseFromSun(-30, -120)).toBe("night");
    expect(phaseFromSun(-8, -95)).toBe("dawn");
    expect(phaseFromSun(1, -85)).toBe("sunrise");
    expect(phaseFromSun(40, -10)).toBe("day");
    expect(phaseFromSun(30, 50)).toBe("afternoon");
    expect(phaseFromSun(7, 75)).toBe("golden");
    expect(phaseFromSun(0, 85)).toBe("sunset");
    expect(phaseFromSun(-8, 95)).toBe("dusk");
    expect(phaseFromSun(-25, 120)).toBe("evening");
  });

  it("uses the real sun when it has a position and a clock, whatever the hour says", () => {
    expect(skySun({ at: new Date("2026-06-21T05:05:00Z"), coords: ERDENET, hour: 0 }).phase).toBe("day");
    expect(skySun({ at: new Date("2026-12-21T17:05:00Z"), coords: ERDENET, hour: 12 }).phase).toBe("midnight");
    // Midsummer in Erdenet: 21:00 local (13:00 UTC) is still golden or sunset light.
    expect(["golden", "sunset"]).toContain(skySun({ at: new Date("2026-06-21T13:00:00Z"), coords: ERDENET }).phase);
  });

  it("falls back to the local hour, and ignores a position that is not on Earth", () => {
    const at = new Date("2026-06-21T05:05:00Z");
    const byHour = (hour: number) => skySun({ at, coords: { lat: 200, lng: 0 }, hour }).phase;
    expect([0, 3, 5, 6, 7, 10, 15, 16, 17, 18, 20, 23].map(byHour)).toEqual([
      "midnight", "night", "dawn", "sunrise", "sunrise", "day", "afternoon", "golden", "sunset", "dusk", "evening", "midnight",
    ]);
    expect(skySun({}).phase).toBe("day");
    expect(skySun({ isDay: false }).phase).toBe("midnight");
  });

  it("agrees with the weather's day/night flag when guessing from the hour", () => {
    expect(skySun({ hour: 12, isDay: false }).phase).toBe("dusk");
    expect(skySun({ hour: 2, isDay: true }).phase).toBe("sunrise");
  });

  it("takes the demo override from ?time=, and nothing else", () => {
    expect(phaseParam("?sky=snow&time=sunset")).toBe("sunset");
    expect(phaseParam("?time=SUNRISE")).toBe("sunrise");
    expect(phaseParam("?time=bogus")).toBeNull();
    expect(phaseParam("")).toBeNull();
    const s = skySun({ override: "golden", coords: ERDENET, at: new Date("2026-12-21T17:05:00Z") });
    expect(s.phase).toBe("golden");
    expect(s.altDeg).toBeGreaterThan(0);
  });
});

describe("cached photo", () => {
  const good = { url: "https://lh3.googleusercontent.com/p/x", attribution: { name: "A. Bat", uri: "https://maps.google.com/c/1" }, place: "Erdenet", savedAt: Date.now() };

  it("keeps a well-formed https photo with its credit and place", () => {
    expect(parseCachedPhoto(JSON.stringify(good))).toEqual(good);
    expect(parseCachedPhoto(JSON.stringify({ ...good, place: 42 }))?.place).toBeNull();
    expect(parseCachedPhoto(JSON.stringify({ ...good, attribution: { name: "x".repeat(500), uri: "u" } }))?.attribution.name).toHaveLength(80);
  });

  it("keeps a Google photo for a day at most; a Wikimedia one has no such limit", () => {
    const old = { ...good, savedAt: Date.now() - 25 * 3600_000 };
    expect(parseCachedPhoto(JSON.stringify(old))).toBeNull();
    expect(parseCachedPhoto(JSON.stringify({ ...good, savedAt: undefined }))).toBeNull();
    const wiki = { ...old, url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1600px-X.jpg" };
    expect(parseCachedPhoto(JSON.stringify(wiki))?.url).toBe(wiki.url);
  });

  it("refuses anything else", () => {
    expect(parseCachedPhoto(null)).toBeNull();
    expect(parseCachedPhoto("{not json")).toBeNull();
    expect(parseCachedPhoto(JSON.stringify({ ...good, url: "http://a.test/x" }))).toBeNull();
    expect(parseCachedPhoto(JSON.stringify({ ...good, url: "javascript:alert(1)" }))).toBeNull();
    expect(parseCachedPhoto(JSON.stringify({ url: good.url }))).toBeNull();
    expect(parseCachedPhoto("null")).toBeNull();
  });
});

describe("Sky", () => {
  it("draws cloud banks for cloud cover and none for a clear sky", () => {
    const cloudy = renderToString(createElement(Sky, { kind: "cloudy", intensity: 0.5, isDay: true, overlay: true, phase: "day", cloudCover: 90 }));
    const clearSky = renderToString(createElement(Sky, { kind: "clear", intensity: 0, isDay: true, overlay: true, phase: "day", cloudCover: 90 }));
    // Day clouds are lit white (#EEF1F5); only the banks are visible (opacity 1), fog and flash stay at 0.
    expect(cloudy).toContain("rgba(238, 241, 245");
    expect(cloudy.match(/opacity:1;/g)).toHaveLength(2);
    expect(clearSky).not.toMatch(/opacity:1;/);
  });
});
