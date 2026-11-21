import { afterEach, describe, expect, it, vi } from "vitest";
import { frostbite, iceRisk, outdoorCheck, uvLevel, windChill } from "@/lib/tools/outdoor";
import type { ToolContext } from "@/lib/tools/types";

describe("ice, frostbite and UV helpers", () => {
  it("ice: freezing codes, or wet and at or below 0 C; never says no ice", () => {
    expect(iceRisk(56, 3, 0)).toBe("risk of ice");
    expect(iceRisk(48, 5, 0)).toBe("risk of ice");
    expect(iceRisk(3, -1, 0.2)).toBe("risk of ice");
    expect(iceRisk(3, 0, 0.1)).toBe("risk of ice");
    expect(iceRisk(3, -5, 0)).toBeNull();
    expect(iceRisk(61, 2, 5)).toBeNull();
  });

  it("wind chill and frostbite follow the Environment Canada table", () => {
    expect(windChill(-30, 20)).toBe(-43);
    expect(windChill(15, 20)).toBeNull();
    expect(windChill(-10, 2)).toBeNull();
    expect(frostbite(-20)).toBeNull();
    expect(frostbite(-28)).toMatch(/10-30 minutes/);
    expect(frostbite(-43)).toMatch(/5-10 minutes/);
    expect(frostbite(-50)).toMatch(/2-5 minutes/);
    expect(frostbite(-60)).toMatch(/under 2 minutes/);
    expect(frostbite(-43)).toMatch(/children and older people sooner/);
  });

  it("UV uses the WHO bands", () => {
    expect(uvLevel(2.9)).toBe("low");
    expect(uvLevel(3)).toMatch(/^moderate/);
    expect(uvLevel(6)).toMatch(/^high/);
    expect(uvLevel(8)).toMatch(/^very high/);
    expect(uvLevel(11)).toMatch(/^extreme/);
  });
});

// Erdenet (UTC+8): now is 05:00 local on 22 Nov. Hours run from 21 Nov 00:00 local for 4 days.
const NOW = new Date("2026-11-21T21:00:00Z");
const HOURS = 96;
const time = Array.from({ length: HOURS }, (_, k) => new Date(Date.UTC(2026, 10, 21, k)).toISOString().slice(0, 16));
const fill = (v: number) => new Array(HOURS).fill(v);
const forecast = () => {
  const precipitation = fill(0);
  precipitation[time.indexOf("2026-11-22T02:00")] = 0.3; // snow three hours before 05:00
  return {
    utc_offset_seconds: 8 * 3600,
    hourly: {
      time,
      temperature_2m: fill(-30),
      apparent_temperature: fill(-40),
      precipitation,
      snowfall: fill(0),
      weather_code: fill(3),
      visibility: fill(20000),
      wind_speed_10m: fill(20),
      wind_gusts_10m: fill(35),
      uv_index: fill(0.4),
    },
    daily: { time: ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"], uv_index_max: [1.2, 1.5, 1, 1] },
  };
};
const ctx = (extra: Partial<ToolContext> = {}): ToolContext => ({
  now: NOW,
  lang: "en",
  city: "Erdenet",
  approxLocation: { lat: 49.0333, lng: 104.0833 },
  device: { memory: {}, reminders: [] },
  actions: [],
  ...extra,
});

describe("outdoor_check", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports the asked hour with ice, frostbite and UV; position rounded to about 1 km", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => Response.json(forecast()));
    vi.stubGlobal("fetch", fetchMock);
    const out = (await outdoorCheck.run({ place: "", hour: "2026-11-22T05:30" }, ctx())) as Record<string, unknown>;
    expect(out).toMatchObject({ place: "Erdenet", localTime: "2026-11-22T05:00", tempC: -30, ice: "risk of ice", windChillC: -43, uvLevel: "low", uvMaxToday: 1.5 });
    expect(out.frostbite).toMatch(/5-10 minutes/);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("latitude=49.03&longitude=104.08");
    expect(url).toContain("uv_index");
  });

  it("no ice signal is never reported as safe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(forecast())));
    const out = (await outdoorCheck.run({ place: "", hour: "2026-11-23T12:00" }, ctx())) as Record<string, unknown>;
    expect(out.ice).toMatch(/can still be icy/);
  });

  it("refuses bad, past and far-off hours, and unknown places", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(forecast())));
    expect(await outdoorCheck.run({ place: "", hour: "tomorrow 5" }, ctx())).toHaveProperty("error");
    expect(await outdoorCheck.run({ place: "", hour: "2026-11-21T20:00" }, ctx())).toHaveProperty("error");
    expect(await outdoorCheck.run({ place: "", hour: "2026-11-24T08:00" }, ctx())).toHaveProperty("error");
    expect(await outdoorCheck.run({ place: "", hour: "" }, ctx({ city: undefined, approxLocation: undefined }))).toHaveProperty("error");
  });
});
