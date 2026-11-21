import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/lib/tools/types";
import staticRaw from "./fixtures/erdenet-static.json";
import vehiclesRaw from "./fixtures/erdenet-vehicles.json";

// Trimmed real samples of https://dedtuv.erdenet.mn/api/transit/{static,vehicles} (2026-11-21 08:57 local).
const NOW = new Date("2026-11-21T00:57:30Z");
type Mod = typeof import("@/lib/erdenet-transit");
let T: Mod;
let calls: { url: string; init?: RequestInit }[];
let vehicles: unknown;
let fail = false;

beforeEach(async () => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", ""); // Google transit off: these tests cover the Erdenet feed only
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.resetModules();
  T = await import("@/lib/erdenet-transit");
  calls = [];
  vehicles = vehiclesRaw;
  fail = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (fail) return new Response("down", { status: 502 });
      return Response.json(String(url).endsWith("/static") ? staticRaw : vehicles);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// A bus on route 3 (Баян тал) near МУИС, driving south toward Хунт at 22 km/h (feed speed is m/s).
const south = { id: "1", name: "1111 ОРО", lat: 49.0126, lng: 104.0400, speed: 6.111, heading: 195, updatedAt: "2026-11-21T00:57:20Z", valid: true };

describe("erdenet-transit", () => {
  it("parses the feed with the right coordinate order and route ids", async () => {
    const { routes, stations, paths } = await T.getStatic();
    expect(routes.map((r) => r.short)).toContain("Ч:3");
    expect(routes.some((r) => r.id === "0")).toBe(false); // "all buses" pseudo-route dropped
    const end = stations.find((s) => s.name === "Баян тал эцэс")!;
    expect(end.lat).toBeCloseTo(48.98412, 4); // GeoJSON [lng, lat] swapped, no rounding
    expect(end.lng).toBeCloseTo(104.03249, 4);
    expect(end.routeIds).toEqual(["64"]);
    const p = paths.find((x) => x.name === "Баян Тал Эх")!;
    expect(p.routeIds).toEqual(["64"]); // unknown tag 47 dropped
    expect(p.color).toBe("#53DBD0");
    expect(p.coords[0][0]).toBeCloseTo(49.03, 1); // [lat, lng]
  });

  it("calls only the public endpoints, politely, and caches static for 6 h", async () => {
    await Promise.all([T.getStatic(), T.getStatic(), T.getVehicles()]);
    expect(calls.map((c) => c.url.split("/").pop()).sort()).toEqual(["static", "vehicles"]); // in-flight dedupe
    expect(new Headers(calls[0].init?.headers).get("User-Agent")).toBe("Aspire/1.0 (+https://aspire-mn.vercel.app)");
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
    vi.setSystemTime(NOW.getTime() + 5 * 3600_000);
    await T.getStatic();
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.url.includes("nats-creds"))).toBe(false);
  });

  it("caches vehicles for 10 s, serves the last list briefly when the feed fails, then errors", async () => {
    const first = await T.getVehicles();
    vi.setSystemTime(NOW.getTime() + 5_000);
    await T.getVehicles();
    expect(calls).toHaveLength(2);
    fail = true;
    vi.setSystemTime(NOW.getTime() + 15_000);
    expect(await T.getVehicles()).toBe(first);
    const n = calls.length;
    vi.setSystemTime(NOW.getTime() + 20_000);
    await T.getVehicles();
    expect(calls).toHaveLength(n); // backs off for 10 s after a failure
    vi.setSystemTime(NOW.getTime() + 120_000);
    await expect(T.getVehicles()).rejects.toThrow();
  });

  it("converts speed to km/h, drops invalid rows and assigns buses to the nearest path", async () => {
    vehicles = [south, { ...south, id: "2", lat: "x" }, { ...south, id: "3", valid: false }, { ...south, id: "4", lat: 10, lng: 10 }];
    const list = await T.getVehicles();
    expect(list.map((v) => v.id)).toEqual(["1", "4"]);
    expect(list[0]).toMatchObject({ speedKph: 22, routeId: "64", heading: 195 });
    expect(list[1].routeId).toBeNull();
  });

  it("estimates arrivals along the route, conservatively, only for buses coming this way", async () => {
    const { stations } = await T.getStatic();
    const hunt = stations.find((s) => s.name === "Хунт")!;
    vehicles = [south, { ...south, id: "n", name: "2222 ОРО", heading: 15 }, { ...south, id: "old", updatedAt: "2026-11-21T00:40:00Z" }];
    const a = await T.arrivals(hunt.id);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ route: "Ч:3", routeName: "Ч:3 БАЯН ТАЛ", color: "#53DBD0", bus: "1111 ОРО", ageS: 10 });
    // About 0.6 km away: at most 20 km/h counted, so 2 to 4 minutes, never less.
    expect(a[0].minutes).toBeGreaterThanOrEqual(2);
    expect(a[0].minutes).toBeLessThanOrEqual(4);
    expect(await T.arrivals("nope")).toEqual([]);
  });

  it("gives every bus its data age, marks positions over 60 s stale, and joins the route name", async () => {
    vehicles = [south, { ...south, id: "s", name: "0216 ОРХ", updatedAt: "2026-11-21T00:56:29Z" }, { ...south, id: "x", lat: 10, lng: 10 }];
    const [fresh, stale, lost] = await T.liveVehicles();
    expect(fresh).toMatchObject({ ageS: 10, stale: false, routeId: "64", routeName: "Ч:3 БАЯН ТАЛ", routeShort: "Ч:3", routeColor: "#53DBD0", name: "1111 ОРО" });
    expect(stale).toMatchObject({ ageS: 61, stale: true, routeShort: "Ч:3" });
    expect(lost).toMatchObject({ routeId: null, routeName: null, routeShort: null, routeColor: null });
    // A stale bus never gets an estimate, even when it is on the route and coming this way.
    const { stations } = await T.getStatic();
    const hunt = stations.find((s) => s.name === "Хунт")!;
    expect((await T.arrivals(hunt.id)).map((a) => a.bus)).toEqual(["1111 ОРО"]);
    vehicles = [{ ...south, updatedAt: "2026-11-21T00:56:00Z" }];
    vi.setSystemTime(NOW.getTime() + 11_000); // past the 10 s cache
    expect(await T.arrivals(hunt.id)).toEqual([]);
    // Plate lookup: digits alone find the bus; too short a query finds nothing.
    expect((await T.findVehicles("1111"))?.[0]).toMatchObject({ name: "1111 ОРО", stale: true });
    expect(await T.findVehicles("11")).toBeNull();
  });

  it("finds stations by name and by distance, and knows Erdenet", async () => {
    expect((await T.findStations("хунт"))[0].name).toBe("Хунт");
    expect(await T.findStations("")).toEqual([]);
    const near = await T.nearestStations(48.9841, 104.0325, 3);
    expect(near[0].name).toBe("Баян тал эцэс");
    expect(near[0].distanceM).toBeLessThan(20);
    expect(near[1].distanceM).toBeGreaterThanOrEqual(near[0].distanceM);
    expect(T.isErdenet(49.03, 104.08)).toBe(true);
    expect(T.isErdenet(47.92, 106.92)).toBe(false); // Ulaanbaatar
  });

  it("get_next_bus and plan_trip answer from the live feed in Erdenet, and never elsewhere", async () => {
    const { nextBus, tripPlanner } = await import("@/lib/tools/local");
    vehicles = [south];
    const ctx = (where: Partial<ToolContext>): ToolContext => ({ now: NOW, lang: "en", device: { memory: {}, reminders: [] }, actions: [], ...where });
    const here = ctx({ timeZone: "Asia/Ulaanbaatar", device: { memory: {}, reminders: [], location: { lat: 49.0072, lng: 104.0381 } } });
    expect(await nextBus.run({ stop: "", route: "3", to: "" }, here)).toMatchObject({
      stop: "Хунт",
      note: "Nearest stop to the person",
      arrivals: [{ route: "Ч:3", bus: "1111 ОРО" }],
      source: "erdenet-live",
      estimate: true,
      credit: "Орхон ТКХДТ",
    });
    expect(await nextBus.run({ stop: "Хунт", route: "5", to: "" }, here)).toMatchObject({ arrivals: [], source: "erdenet-live" });
    expect(await tripPlanner.run({ from: "Хунт", to: "Баян тал эцэс" }, here)).toMatchObject({ options: [{ route: "Ч:3" }], source: "erdenet-live" });
    // No device position: an unknown name gets the real stop names back instead of a guess.
    const unknown = (await nextBus.run({ stop: "Central Square", route: "", to: "" }, ctx({ city: "Erdenet" }))) as { stops: string[] };
    expect(unknown.stops).toContain("Хунт");

    const lagos = ctx({ timeZone: "Africa/Lagos", city: "Lagos", approxLocation: { lat: 6.45, lng: 3.39 } });
    expect(await nextBus.run({ stop: "Хунт", route: "", to: "" }, lagos)).toMatchObject({ error: expect.stringMatching(/get_directions/) });
    expect(calls.some((c) => c.url.includes("erdenet"))).toBe(true);
    const before = calls.length;
    await tripPlanner.run({ from: "A", to: "B" }, lagos);
    // No Erdenet feed call outside Erdenet (worldwide transit may be asked instead).
    expect(calls.slice(before).some((c) => c.url.includes("erdenet"))).toBe(false);
    // Only a Mongolian clock (could be Ulaanbaatar): an unknown stop is not answered with Erdenet's stop list.
    const mn = ctx({ timeZone: "Asia/Ulaanbaatar" });
    expect(await nextBus.run({ stop: "Sukhbaatar Square", route: "", to: "" }, mn)).toEqual({ error: expect.stringMatching(/city/) });
    expect(await tripPlanner.run({ from: "Sukhbaatar Square", to: "Zaisan" }, mn)).toEqual({ error: expect.stringMatching(/city/) });

    fail = true;
    vi.resetModules();
    const fresh = await import("@/lib/tools/local");
    expect(await fresh.nextBus.run({ stop: "Хунт", route: "", to: "" }, here)).toMatchObject({ liveDataUnavailable: true, error: expect.stringMatching(/unavailable/) });
    expect(await fresh.tripPlanner.run({ from: "Хунт", to: "Баян тал эцэс" }, here)).toMatchObject({ liveDataUnavailable: true });
    expect(await fresh.nextBus.run({ stop: "", route: "", to: "", bus: "0216" }, here)).toMatchObject({ liveDataUnavailable: true });
  });

  it("tells the truth: data age on every bus, stale buses left out, plate lookups, and says when nothing reports", async () => {
    const { nextBus, tripPlanner } = await import("@/lib/tools/local");
    const here: ToolContext = { now: NOW, lang: "en", timeZone: "Asia/Ulaanbaatar", actions: [], device: { memory: {}, reminders: [], location: { lat: 49.0072, lng: 104.0381 } } };
    const old = { ...south, id: "o", name: "0216 ОРХ", updatedAt: "2026-11-21T00:55:00Z" }; // 150 s old, same route, same place
    vehicles = [south, old];
    const r = (await nextBus.run({ stop: "Хунт", route: "", to: "", bus: "" }, here)) as { arrivals: { bus: string; ageS: number }[] };
    expect(r.arrivals).toEqual([expect.objectContaining({ bus: "1111 ОРО", ageS: 10, routeName: "Ч:3 БАЯН ТАЛ" })]);
    expect(nextBus.description).toMatch(/about N minutes \(estimate\)/);
    expect(tripPlanner.description).toMatch(/over 30/);
    const [opt] = ((await tripPlanner.run({ from: "Хунт", to: "Баян тал эцэс" }, here)) as { options: { bus: string; ageS: number }[] }).options;
    expect(opt).toMatchObject({ bus: "1111 ОРО", ageS: 10 });

    expect(await nextBus.run({ stop: "", route: "", to: "", bus: "0216" }, here)).toMatchObject({
      bus: "0216 ОРХ",
      route: "Ч:3",
      routeName: "Ч:3 БАЯН ТАЛ",
      speedKph: 22,
      heading: 195,
      ageS: 150,
      stale: true,
      source: "erdenet-live",
    });
    expect(await nextBus.run({ stop: "", route: "", to: "", bus: "9999" }, here)).toMatchObject({ error: expect.stringMatching(/No bus with plate "9999"/) });
    expect(await nextBus.run({ stop: "", route: "", to: "", bus: "02" }, here)).toMatchObject({ error: expect.stringMatching(/at least 3/) });

    // Every position stale: no estimate, and the answer says nothing is reporting rather than "no bus coming".
    vehicles = [old];
    vi.setSystemTime(NOW.getTime() + 11_000);
    expect(await nextBus.run({ stop: "Хунт", route: "", to: "", bus: "" }, here)).toMatchObject({ arrivals: [], empty: expect.stringMatching(/last minute/) });

    // Two plates match: the freshest is shown, the other is named, and the person is asked which.
    vehicles = [{ ...south, id: "t", name: "1111 ОРХ", updatedAt: "2026-11-21T00:56:50Z" }, south];
    vi.setSystemTime(NOW.getTime() + 22_000);
    expect(await nextBus.run({ stop: "", route: "", to: "", bus: "1111" }, here)).toMatchObject({ bus: "1111 ОРО", alsoMatches: ["1111 ОРХ"], nearStop: expect.any(String) });
  });

  it("never invents speed or heading, and keeps a standing bus in the estimates (marked stopped)", async () => {
    vehicles = [{ ...south, speed: 0 }, { ...south, id: "2", name: "2222 ОРО", speed: undefined, heading: "x" }];
    const [parked, blank] = await T.getVehicles();
    expect(parked).toMatchObject({ speedKph: 0, heading: 195, routeId: "64" });
    expect(blank).toMatchObject({ speedKph: null, heading: null });
    const { stations } = await T.getStatic();
    const hunt = stations.find((s) => s.name === "Хунт")!;
    const a = await T.arrivals(hunt.id);
    expect(a.find((x) => x.bus === "1111 ОРО")).toMatchObject({ route: "Ч:3", stopped: true });
  });

  it("names a route only when one route is clearly nearest (a shared street gives null)", () => {
    const street: [number, number][] = [[49.0, 104.0], [49.01, 104.0]];
    const at = { id: "b", name: "1", lat: 49.005, lng: 104.0001, speed: 5, heading: 0, updatedAt: "2026-11-21T00:57:20Z" };
    const one = [{ name: "A", routeIds: ["1"], color: "#fff", coords: street }];
    expect(T.parseVehicles([at], one)[0].routeId).toBe("1");
    const shared = [...one, { name: "B", routeIds: ["2"], color: "#fff", coords: street.map(([la, ln]) => [la, ln + 0.0001] as [number, number]) }];
    expect(T.parseVehicles([at], shared)[0].routeId).toBeNull();
    expect(T.parseVehicles([at], [{ ...one[0], routeIds: ["1", "2"] }])[0].routeId).toBeNull();
  });

  it("plans a direct trip with the live wait and an estimated ride", async () => {
    vehicles = [south];
    const { stations } = await T.getStatic();
    const id = (n: string) => stations.find((s) => s.name === n)!.id;
    const [opt] = await T.trip(id("Хунт"), id("Баян тал эцэс"));
    expect(opt).toMatchObject({ route: "Ч:3", bus: "1111 ОРО" });
    expect(opt.waitMinutes).toBeGreaterThan(0);
    expect(opt.rideMinutes).toBeGreaterThan(5);
  });
});
