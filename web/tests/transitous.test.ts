import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextBus, tripPlanner } from "@/lib/tools/local";
import type { ToolContext } from "@/lib/tools/types";
import { along, decodePolyline, departuresNear, findPlace, PLAN_DAILY_LIMIT, planTrip, resetTransitous, TRANSITOUS_UA, vehiclesNear } from "@/lib/transitous";

const NOW = new Date("2026-11-21T10:00:00Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const HERE = { lat: 52.5208, lng: 13.4095 }; // Berlin, Alexanderplatz

// MOTIS (Transitous) response shapes, trimmed.
const stop = (name: string, lat: number, lon: number, min: number, extra: Record<string, unknown> = {}) => ({
  place: { name, lat, lon, tz: "Europe/Berlin", departure: at(min), scheduledDeparture: at(min), ...extra },
});
const STOPTIMES = {
  stopTimes: [
    { ...stop("S+U Alexanderplatz", 52.5215, 13.4115, 6), mode: "BUS", realTime: false, headsign: "Zoo", routeShortName: "100" },
    { ...stop("Alexanderplatz/Memhardstr.", 52.5232, 13.4105, 2), mode: "TRAM", realTime: true, headsign: "Nordbahnhof", routeShortName: "M2" },
    { ...stop("S+U Alexanderplatz", 52.5215, 13.4115, 3), mode: "BUS", realTime: true, headsign: "Hermannplatz", routeShortName: "M48", cancelled: true },
    { ...stop("S+U Alexanderplatz", 52.5215, 13.4115, -2), mode: "BUS", realTime: true, headsign: "Gone", routeShortName: "200" },
    // A feed with a gap: its next bus is days away (Moscow's did this), no "next bus".
    { ...stop("S+U Alexanderplatz", 52.5215, 13.4115, 2604), mode: "BUS", realTime: false, headsign: "Later", routeShortName: "M7" },
    { place: { name: "No time", lat: 52.52, lon: 13.41 }, realTime: true, routeShortName: "X" },
    { ...stop("S+U Alexanderplatz", 52.5215, 13.4115, 5), realTime: true, routeShortName: "Y", pickupDropoffType: "NOT_ALLOWED" },
    { ...stop("", 52.5215, 13.4115, 5), realTime: true, routeShortName: "Z" },
    { ...stop("<b>Far</b>", 52.6, 13.5, 4), realTime: true, routeShortName: "999" },
  ],
};
const PLAN = {
  itineraries: [
    {
      legs: [
        { mode: "WALK", startTime: at(0), endTime: at(4), from: { name: "Start", lat: 52.52, lon: 13.41 }, to: { name: "Alex", lat: 52.52, lon: 13.41 } },
        {
          mode: "BUS", realTime: true, startTime: at(5), endTime: at(17), routeShortName: "100", routeLongName: "Bus 100", headsign: "Zoo",
          from: { name: "S+U Alexanderplatz", lat: 52.52, lon: 13.41, tz: "Europe/Berlin" }, to: { name: "Zoo", lat: 52.5, lon: 13.33, tz: "Europe/Berlin" },
          intermediateStops: [{}, {}, {}],
        },
      ],
    },
    { legs: [{ mode: "WALK", startTime: at(0), endTime: at(40) }] },
    { legs: [{ mode: "SUBWAY", realTime: false, startTime: at(-5), endTime: at(10), routeShortName: "U2", from: { name: "Old" }, to: { name: "Zoo" } }] },
  ],
};
// Google's polyline encoding (precision 5), as MOTIS sends route shapes.
function encode(points: [number, number][]): string {
  let out = "", pl = 0, pg = 0;
  const one = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    out += String.fromCharCode(n + 63);
  };
  for (const [la, lg] of points) {
    const a = Math.round(la * 1e5), g = Math.round(lg * 1e5);
    one(a - pl); one(g - pg);
    [pl, pg] = [a, g];
  }
  return out;
}
const seg = (route: string, mode: string, from: number, to: number, line: [number, number][], extra: Record<string, unknown> = {}) => ({
  trips: [{ tripId: `trip-${route}`, routeShortName: route }], mode, departure: at(from), arrival: at(to), realTime: true,
  from: { name: "A" }, to: { name: `Next ${route}` }, polyline: encode(line), ...extra,
});
const TRIPS = [
  // Halfway along a 2 km east-west line through HERE at 10:00.
  seg("100", "BUS", -1, 1, [[52.5208, 13.3948], [52.5208, 13.4242]]),
  seg("100", "BUS", 1, 3, [[52.5208, 13.4242], [52.53, 13.45]]), // the same trip later: shown once
  seg("M2", "TRAM", 1, 4, [[52.5232, 13.4105], [52.53, 13.42]], { realTime: false }), // waits at its stop
  seg("U2", "SUBWAY", -1, 1, [[52.52, 13.40], [52.52, 13.42]]), // not on the road
  seg("200", "BUS", -5, -2, [[52.52, 13.40], [52.52, 13.42]]), // already past
  seg("300", "BUS", -1, 1, [[52.60, 13.50], [52.61, 13.51]]), // far away
];
const GEOCODE = (u: URL) => (u.searchParams.get("text")?.startsWith("Zoo") ? [{ type: "STOP", name: "Zoologischer Garten", lat: 52.5069, lon: 13.3323 }] : [{ type: "PLACE", name: "Far town", lat: 10, lon: 10 }]);

let calls: { url: URL; init: RequestInit }[];
let fail = false;
beforeEach(() => {
  resetTransitous();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
  calls = [];
  fail = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init: RequestInit) => {
      const url = new URL(String(u));
      calls.push({ url, init });
      if (fail) return new Response("down", { status: 503 });
      if (url.pathname.endsWith("/v5/stoptimes")) return Response.json(STOPTIMES);
      if (url.pathname.endsWith("/v5/plan")) return Response.json(PLAN);
      if (url.pathname.endsWith("/v1/geocode")) return Response.json(GEOCODE(url));
      if (url.pathname.endsWith("/v5/map/trips")) return Response.json(TRIPS);
      throw new TypeError("network down");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("transitous", () => {
  it("lists departures near a point: live or scheduled, gone, cancelled and days-away ones dropped", async () => {
    const d = await departuresNear(HERE, NOW);
    expect(d.map((x) => [x.route, x.minutes, x.live])).toEqual([["M2", 2, true], ["100", 6, false]]);
    expect(d[0]).toMatchObject({ stop: "Alexanderplatz/Memhardstr.", headsign: "Nordbahnhof", time: "11:02", mode: "TRAM", lat: 52.5232, lng: 13.4105 });
    expect(d[0].distanceM).toBeGreaterThan(0);
    // Only the ~1 km cell leaves the server, with a User-Agent that names the app and a contact.
    const { url, init } = calls[0];
    expect(url.origin + url.pathname).toBe("https://api.transitous.org/api/v5/stoptimes");
    expect(url.searchParams.get("center")).toBe("52.52,13.41");
    expect(url.searchParams.get("radius")).toBe("1000");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(TRANSITOUS_UA);
    expect(TRANSITOUS_UA).toMatch(/^Aspire\/6 \(\+\S+\)$/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("caches stop times for 30 s and recounts minutes from now; failures are not cached", async () => {
    const t0 = Date.now();
    await departuresNear(HERE, NOW);
    const later = await departuresNear(HERE, new Date(NOW.getTime() + 60_000));
    expect(calls).toHaveLength(1);
    expect(later[0].minutes).toBe(1);
    vi.spyOn(Date, "now").mockReturnValue(t0 + 31_000);
    await departuresNear(HERE, NOW);
    expect(calls).toHaveLength(2);

    resetTransitous();
    fail = true;
    await expect(departuresNear(HERE, NOW)).rejects.toThrow(/503/);
    fail = false;
    expect(await departuresNear(HERE, NOW)).toHaveLength(2);
  });

  it("plans trips (transit legs only, waits counted from now) and keeps /plan under the daily budget", async () => {
    const o = await planTrip(HERE, { lat: 52.5069, lng: 13.3323 }, NOW);
    expect(o).toEqual([{ line: "100", lineName: "Bus 100", headsign: "Zoo", stop: "S+U Alexanderplatz", departs: "11:05", arrives: "11:17", waitMinutes: 5, rideMinutes: 12, stops: 4, live: true }]);
    expect(calls[0].url.searchParams.get("fromPlace")).toBe("52.521,13.41");
    await planTrip(HERE, { lat: 52.5069, lng: 13.3323 }, NOW);
    expect(calls).toHaveLength(1); // 5-minute cache

    resetTransitous();
    for (let i = 0; i < PLAN_DAILY_LIMIT; i++) await planTrip({ lat: 1, lng: i / 100 }, HERE, NOW);
    await expect(planTrip({ lat: 2, lng: 2 }, HERE, NOW)).rejects.toThrow(/budget/);
    expect(calls.filter((c) => c.url.pathname.endsWith("/v5/plan"))).toHaveLength(1 + PLAN_DAILY_LIMIT);
  });

  it("finds places near the person and refuses a namesake in another town", async () => {
    expect(await findPlace("Zoo", HERE)).toEqual({ name: "Zoologischer Garten", lat: 52.5069, lng: 13.3323 });
    expect(calls[0].url.searchParams.get("place")).toBe("52.52,13.41");
    expect(await findPlace("Market", HERE)).toBeNull();
    expect(await findPlace("   ", HERE)).toBeNull();
  });
});

describe("bus tools fall back to Transitous outside Erdenet", () => {
  const ctx = (where: Partial<ToolContext>): ToolContext => ({ now: NOW, lang: "en", device: { memory: {}, reminders: [] }, actions: [], timeZone: "Europe/Berlin", city: "Berlin", ...where });
  const berlin = ctx({ device: { memory: {}, reminders: [], location: HERE } });

  it("get_next_bus: departures near the person, each marked live or not", async () => {
    const r = await nextBus.run({ stop: "", route: "", to: "", bus: "" }, berlin);
    expect(r).toMatchObject({
      source: "transitous",
      credit: "Transitous and sources",
      creditUrl: "https://transitous.org/sources/",
      note: "Stops near the person",
      now: "11:00",
      arrivals: [
        { route: "M2", minutes: 2, time: "11:02", towards: "Nordbahnhof", live: true },
        { route: "100", minutes: 6, live: false },
      ],
    });
    expect(nextBus.description).toMatch(/scheduled/);
    expect((await nextBus.run({ stop: "", route: "100", to: "", bus: "" }, berlin)) as { arrivals: unknown[] }).toMatchObject({ arrivals: [{ route: "100" }] });
  });

  it("get_next_bus and plan_trip with a destination plan a trip", async () => {
    expect(await nextBus.run({ stop: "", route: "", to: "Zoo", bus: "" }, berlin)).toMatchObject({
      source: "transitous",
      stop: "S+U Alexanderplatz",
      arrivals: [{ route: "100", minutes: 5, time: "11:05", towards: "Zoo", live: true }],
    });
    expect(await tripPlanner.run({ from: "", to: "Zoo" }, berlin)).toMatchObject({
      source: "transitous",
      options: [{ route: "100", departs: "11:05", arrives: "11:17", waitMinutes: 5, rideMinutes: 12, stops: 4, live: true }],
    });
  });

  it("says so instead of guessing when Transitous has nothing or is down", async () => {
    fail = true;
    expect(await nextBus.run({ stop: "", route: "", to: "", bus: "" }, berlin)).toMatchObject({ liveDataUnavailable: true, error: expect.stringMatching(/Transitous\) is not answering/) });
    expect(await tripPlanner.run({ from: "", to: "Zoo" }, berlin)).toMatchObject({ liveDataUnavailable: true, error: expect.stringMatching(/get_directions/) });
    fail = false;
    // Nothing on that route: said, not guessed.
    expect(await nextBus.run({ stop: "", route: "7", to: "", bus: "" }, berlin)).toMatchObject({ error: expect.stringMatching(/No bus times found/) });
    // A namesake 50 km+ away is not used.
    expect(await tripPlanner.run({ from: "", to: "Market" }, berlin)).toMatchObject({ error: expect.stringMatching(/get_directions/) });
    // Nothing known about the place: Transitous is not asked at all.
    calls = [];
    expect(await nextBus.run({ stop: "Zoo", route: "", to: "", bus: "" }, ctx({ timeZone: "Europe/Berlin", city: undefined }))).toMatchObject({ error: expect.stringMatching(/Location unknown/) });
    expect(calls).toHaveLength(0);
  });
});

describe("vehicles on the road (Transitous map trips)", () => {
  it("decodes route shapes and walks along them by distance", () => {
    const line = decodePolyline(encode([[52.5, 13.4], [52.5, 13.42], [-33.86, 151.2]]));
    expect(line).toEqual([{ lat: 52.5, lng: 13.4 }, { lat: 52.5, lng: 13.42 }, { lat: -33.86, lng: 151.2 }]);
    expect(along([{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }], 0.25)).toEqual({ lat: 0, lng: 0.5 });
    expect(along([{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }], 9)).toEqual({ lat: 0, lng: 2 });
    expect(along([], 0.5)).toBeNull();
  });

  it("places buses and trams near the point by the clock, each trip once, nearest first", async () => {
    const v = await vehiclesNear(HERE, NOW);
    expect(v.map((x) => [x.route, x.mode, x.live, x.nextStop])).toEqual([["100", "BUS", true, "Next 100"], ["M2", "TRAM", false, "Next M2"]]);
    expect(v[0].lat).toBeCloseTo(52.5208, 4);
    expect(v[0].lng).toBeCloseTo(13.4095, 3);
    expect(v[0].distanceM).toBeLessThan(30);
    expect(v[1]).toMatchObject({ lat: 52.5232, lng: 13.4105 });
  });

  it("sends only the ~1 km cell's box and a short window, with our User-Agent, and caches 30 s", async () => {
    await vehiclesNear(HERE, NOW);
    const q = calls[0].url.searchParams;
    expect(q.get("min")).toBe("52.505,13.3853");
    expect(q.get("max")).toBe("52.535,13.4347");
    expect(Date.parse(q.get("endTime")!) - Date.parse(q.get("startTime")!)).toBe(120_000);
    expect(new Headers(calls[0].init.headers).get("User-Agent")).toBe(TRANSITOUS_UA);
    await vehiclesNear({ lat: 52.5211, lng: 13.4099 }, new Date(NOW.getTime() + 10_000));
    expect(calls).toHaveLength(1);
    await vehiclesNear(HERE, new Date(NOW.getTime() + 40_000));
    expect(calls).toHaveLength(2);
  });

  it("throws when Transitous is down (so the tool can say so)", async () => {
    fail = true;
    await expect(vehiclesNear(HERE, NOW)).rejects.toThrow();
  });
});
