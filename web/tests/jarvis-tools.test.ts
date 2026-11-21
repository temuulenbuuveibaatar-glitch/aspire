import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_TOOLS, runTool, TOOLS, type ToolStep } from "@/lib/tools";
import { parseAirDetail, resetAirDetail } from "@/lib/tools/air";
import { convertUnits } from "@/lib/tools/jarvis";
import type { DeviceContext, ToolContext } from "@/lib/tools/types";
import { resetTransitous } from "@/lib/transitous";

const NOW = new Date("2026-11-21T10:00:00Z");
const ctx = (device: Partial<DeviceContext> = {}, extra: Partial<ToolContext> = {}): ToolContext => ({
  now: NOW,
  lang: "en",
  timeZone: "Europe/Berlin",
  device: { memory: {}, reminders: [], ...device },
  actions: [],
  ...extra,
});
const run = async (name: string, input: unknown, c = ctx()) => {
  const steps: ToolStep[] = [];
  return { out: JSON.parse(await runTool(name, input, c, steps)), c, steps };
};

beforeEach(() => {
  resetTransitous();
  resetAirDetail();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("registration", () => {
  it("every new tool is shared (bots too), named once, with English and Mongolian labels", () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of ["set_timer", "convert_units", "buses_near_me", "daily_summary", "get_air_quality"]) expect(names).toContain(n);
    expect(new Set(ALL_TOOLS.map((t) => t.name)).size).toBe(ALL_TOOLS.length);
    for (const t of TOOLS.filter((x) => ["set_timer", "convert_units", "buses_near_me", "daily_summary"].includes(x.name))) {
      expect(t.label.en && t.label.mn).toBeTruthy();
      expect(t.description).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("set_timer", () => {
  it("is a one-off spoken reminder at now + duration", async () => {
    const { out, c } = await run("set_timer", { minutes: 10, seconds: 30, label: "Tea is ready" });
    expect(out).toMatchObject({ ok: true, seconds: 630, endsAt: "11:10" });
    expect(c.actions).toEqual([{ type: "reminder", id: out.id, text: "Tea is ready", at: "2026-11-21T10:10:30.000Z", repeatDaily: false }]);
  });

  it("refuses nonsense, over a day, and a full reminder list", async () => {
    expect((await run("set_timer", { minutes: 0, seconds: 2, label: "x" })).out.error).toBeTruthy();
    expect((await run("set_timer", { minutes: "abc", seconds: 0, label: "x" })).out.error).toBeTruthy();
    expect((await run("set_timer", { minutes: 1500, seconds: 0, label: "x" })).out.error).toMatch(/24 hours/);
    const full = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, text: "x", at: NOW.toISOString(), repeatDaily: false }));
    expect((await run("set_timer", { minutes: 5, seconds: 0, label: "x" }, ctx({ reminders: full }))).out.error).toMatch(/Too many/);
  });

  it("says a default line when no label is given", async () => {
    const { c } = await run("set_timer", { minutes: 1, seconds: 0, label: "" });
    expect(c.actions[0]).toMatchObject({ text: "Time is up." });
  });
});

describe("convert_units", () => {
  it("converts lengths, weights, cooking measures, speeds, areas and data", () => {
    expect(convertUnits(5, "miles", "km")).toBe(8.04672);
    expect(convertUnits(180, "lb", "kg")).toBe(81.6466);
    expect(convertUnits(2, "cups", "ml")).toBe(473.176);
    expect(convertUnits(100, "km/h", "mph")).toBe(62.1371);
    expect(convertUnits(1, "hectare", "m²")).toBe(10000);
    expect(convertUnits(1, "GB", "MB")).toBe(1000);
    expect(convertUnits(1013.25, "hPa", "atm")).toBe(1);
  });

  it("converts temperatures with their offsets", () => {
    expect(convertUnits(-40, "F", "C")).toBe(-40);
    expect(convertUnits(100, "celsius", "fahrenheit")).toBe(212);
    expect(convertUnits(0, "K", "C")).toBe(-273.15);
  });

  it("rejects unknown units and mixed dimensions", () => {
    expect(() => convertUnits(1, "parsec", "km")).toThrow(/Unknown unit parsec/);
    expect(() => convertUnits(1, "kg", "km")).toThrow(/mass to length/);
  });

  it("as a tool: units here, currency codes through today's exchange rate", async () => {
    expect((await run("convert_units", { value: 3, from: "ft", to: "m" })).out).toEqual({ value: 3, from: "ft", to: "m", result: 0.9144 });
    expect((await run("convert_units", { value: 1, from: "kg", to: "C" })).out.error).toBeTruthy();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rates: { USD: 1, MNT: 3400 } })));
    expect((await run("convert_units", { value: 10, from: "usd", to: "MNT" })).out).toMatchObject({ result: 34000, from: "USD", to: "MNT" });
  });
});

describe("buses_near_me", () => {
  const here = ctx({ location: { lat: 52.5208, lng: 13.4095 } });
  const enc = "_~p_IodwpA?wvD"; // 52.5208,13.3948 -> 52.5208,13.4242 (precision 5)

  it("needs a shared location and asks nothing of the network without it", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await run("buses_near_me", { line: "" })).out.error).toMatch(/location/);
    expect(f).not.toHaveBeenCalled();
  });

  it("lists nearby vehicles with how their timing is known, filtered by line", async () => {
    const at = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([
      { trips: [{ tripId: "a", routeShortName: "100" }], mode: "BUS", departure: at(-1), arrival: at(1), realTime: true, to: { name: "Alexanderplatz" }, polyline: enc },
      { trips: [{ tripId: "b", routeShortName: "M2" }], mode: "TRAM", departure: at(-1), arrival: at(1), realTime: false, to: { name: "Hackescher Markt" }, polyline: enc },
    ])));
    const all = (await run("buses_near_me", { line: "" }, here)).out;
    expect(all.count).toBe(2);
    expect(all.vehicles[0]).toMatchObject({ route: "100", mode: "BUS", nextStop: "Alexanderplatz", timing: "real-time" });
    expect(all.vehicles[1]).toMatchObject({ route: "M2", timing: "timetable" });
    const m2 = (await run("buses_near_me", { line: "m2" }, here)).out;
    expect(m2.vehicles.map((v: { route: string }) => v.route)).toEqual(["M2"]);
  });

  it("says plainly when there are none or the service is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    expect((await run("buses_near_me", { line: "" }, here)).out).toMatchObject({ count: 0, note: expect.stringMatching(/never invent/) });
    resetTransitous();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect((await run("buses_near_me", { line: "" }, here)).out.error).toMatch(/not answering/);
  });
});

describe("air quality detail", () => {
  it("parses pollutants, the dominant one and the worst hour per day; no index means no reading", () => {
    const d = parseAirDetail({
      current: { us_aqi: 61.4, pm2_5: 15.04, pm10: 30, ozone: 120, nitrogen_dioxide: -1, us_aqi_pm2_5: 55, us_aqi_ozone: 61 },
      hourly: { time: ["2026-11-21T00:00", "2026-11-21T01:00", "2026-11-22T00:00", "bad"], us_aqi: [20, 70, 201, 999] },
    });
    expect(d).toEqual({
      aqi: 61,
      pollutants: { pm25: 15, pm10: 30, o3: 120, no2: null, so2: null, co: null },
      dominant: "o3",
      forecast: [{ date: "2026-11-21", maxAqi: 70, category: "moderate" }, { date: "2026-11-22", maxAqi: 201, category: "very_unhealthy" }],
    });
    expect(parseAirDetail({ current: { pm2_5: 10 } })).toBeNull();
    expect(parseAirDetail(null)).toBeNull();
  });

  it("get_air_quality keeps its reading and adds the detail at the person's position", async () => {
    const f = vi.fn(async (u: string) => {
      void u;
      return Response.json({ current: { us_aqi: 160, pm2_5: 70, us_aqi_pm2_5: 160 }, hourly: { time: ["2026-11-22T00:00"], us_aqi: [90] } });
    });
    vi.stubGlobal("fetch", f);
    const { out } = await run("get_air_quality", { place: "" }, ctx({ location: { lat: 47.9187, lng: 106.9177 } }, { city: "Ulaanbaatar" }));
    expect(out).toMatchObject({ usAqi: 160, level: "unhealthy", source: "open-meteo", dominant: "pm25", pollutants: { pm25: 70 }, forecast: [{ date: "2026-11-22", maxAqi: 90 }] });
    expect(String(f.mock.calls.at(-1)![0])).toContain("latitude=47.92&longitude=106.92");
  });
});

describe("daily_summary", () => {
  it("gathers weather, air, today's reminders and lessons; a failed part is null", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (String(u).includes("air-quality") ? new Response("down", { status: 503 }) : Response.json({
      current: { temperature_2m: 3, apparent_temperature: 0, weather_code: 61, wind_speed_10m: 10, relative_humidity_2m: 80 },
      daily: { time: ["2026-11-21"], temperature_2m_max: [5], temperature_2m_min: [-1], weather_code: [61], precipitation_probability_max: [70] },
    }))));
    const c = ctx(
      {
        location: { lat: 52.52, lng: 13.405 },
        reminders: [
          { id: "a", text: "Doctor", at: "2026-11-21T15:30:00Z", repeatDaily: false },
          { id: "b", text: "Pills", at: "2026-11-01T07:00:00Z", repeatDaily: true },
          { id: "c", text: "Tomorrow", at: "2026-11-22T08:00:00Z", repeatDaily: false },
        ],
        lessons: [{ id: "l1", topic: "German", level: "beginner", step: 3, score: 80 }],
      },
      { city: "Berlin" },
    );
    const { out } = await run("daily_summary", {}, c);
    expect(out).toMatchObject({ date: "2026-11-21", weekday: "Saturday", time: "11:00", air: null, calendar: null, lessons: [{ topic: "German", step: 3 }] });
    expect(out.weather).toMatchObject({ place: "Berlin", now: { temperatureC: 3 } });
    expect(out.reminders).toEqual([{ time: "08:00", text: "Pills" }, { time: "16:30", text: "Doctor" }]);
    // The weather card still shows on screen.
    expect(c.actions.map((a) => a.type)).toEqual(["weather"]);
  });
});
