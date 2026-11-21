import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/lib/tools/types";

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => ({ id: "user-1", email: null }),
}));

// Trimmed real samples of https://dedtuv.erdenet.mn/api/{traffic,parking/stream,fuel-stations} (2026-11-21 11:33 local).
const NOW = new Date("2026-11-21T03:34:00Z");
const TRAFFIC = [
  { id: "7c2184a2-c6b5-4b14-a605-25011e895b86", name: "Булганын зам", lat: 48.990574, lng: 104.007043, vehicleCount: 5, loadLevel: "LOW", detectedAt: "2026-11-21T03:33:49.272Z" },
  { id: "e9104dd4-b39c-45b6-a623-ea5a472c245d", name: "Төгөл гарден зүүн", lat: 49.031122, lng: 104.039921, vehicleCount: 18, loadLevel: "MEDIUM", detectedAt: "2026-11-21T03:33:48.754Z" },
  { id: "46c5b8ff-0343-4344-82c4-7696701268b8", name: "Хойд дугуй уулзвар", lat: 49.035164, lng: 104.05117, vehicleCount: 31, loadLevel: "HIGH", detectedAt: "2026-11-21T03:33:49.461Z" },
  { id: "d8d17afc-273a-400a-863d-23b9359f6bf3", name: "6-10 Уулзвар", lat: 49.022163, lng: 104.040468, vehicleCount: 40, loadLevel: "HIGH", detectedAt: "2026-11-21T02:00:00.000Z" }, // stale
  { id: "bad id!", name: "x", lat: 49, lng: 104, vehicleCount: 1, loadLevel: "LOW", detectedAt: "2026-11-21T03:33:49Z" },
  { id: "no-time", name: "x", lat: 49, lng: 104, vehicleCount: 1, loadLevel: "LOW", detectedAt: "yesterday" },
  { id: "weird", name: "<b>x</b>", lat: 49.03, lng: 104.05, vehicleCount: -3, loadLevel: "JAMMED", detectedAt: "2026-11-21T03:33:40Z" },
];
const PARKING = {
  lots: [
    { id: "76fe2c1f-77f7-4f7f-88d8-4d78bfb1c646", name: "Захиргааны 4-р байр", total: 45, occupied: 9, available: 36, cameraName: "МШУТ гадна баруун", lat: 49.026346, lng: 104.058332 },
    { id: "b787e23e-4b72-499f-becd-11f286bc304e", name: "Төмөр замын зогсоол", total: 120, occupied: 14, available: 106, lat: 49.060264, lng: 104.164284 },
    { id: "mismatch", name: "Bad sums", total: 30, occupied: 20, available: 20, lat: 49.02, lng: 104.04 },
    { id: "nototal", name: "No total", occupied: 2, available: 3, lat: 49.02, lng: 104.04 },
  ],
};
const PARKING_SSE = `: hello\n\ndata: ${JSON.stringify(PARKING)}\n\n`;
const avail = (fuelType: string, status: string, updatedAt = "2026-11-21T00:00:00.022Z") => ({ fuelType, status, availableAt: null, limitMode: "NONE", limitValue: null, updatedAt });
const none = { totalVotes: 0, status: null, queueLevel: null, updatedAt: null };
const FUEL = [
  {
    id: "17e18c27-e9e2-4bd2-bb92-bbaf8d553859", name: "100 айл шунхлай ШТС- 2", organization: "Шунхлай", lat: 49.024661, lng: 104.060381, active: true,
    availability: [avail("AI92", "UNAVAILABLE"), avail("AI95", "UNAVAILABLE")],
    community: { AI92: none, AI95: { totalVotes: 3, status: "SELLING", queueLevel: "LONG", updatedAt: "2026-11-21T03:20:00Z" } },
  },
  {
    id: "c0ffee00-0000-4000-8000-000000000001", name: "Петровис ШТС", organization: "Петровис", lat: 49.03, lng: 104.05, active: true,
    availability: [avail("AI92", "ALWAYS_AVAILABLE", "2026-11-21T01:54:34.555Z"), avail("EURO92", "SOLD_OUT", "2026-11-21T01:54:34.562Z"), avail("bad type", "SELLING")],
    community: { EURO92: { totalVotes: 1, status: "SELLING", queueLevel: null, updatedAt: null } },
  },
  { id: "closed", name: "Closed", organization: "x", lat: 49.03, lng: 104.05, active: false, availability: [avail("AI92", "ALWAYS_AVAILABLE")] },
];

const ERDENET = { lat: 49.0333, lng: 104.0833 };
type Mod = typeof import("@/lib/erdenet-city");
let C: Mod;
let calls: { url: string; init?: RequestInit }[];
let fail: Set<string>;

/** An SSE body that sends `text` and then never ends (like the real stream), recording when it is cancelled. */
let cancelled = false;
const sse = (text: string) =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.resetModules();
  C = await import("@/lib/erdenet-city");
  calls = [];
  fail = new Set();
  cancelled = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      const feed = u.split("/api/")[1];
      if (fail.has(feed)) return new Response("down", { status: 502 });
      if (feed === "traffic") return Response.json(TRAFFIC);
      if (feed === "fuel-stations") return Response.json(FUEL);
      if (feed === "parking/stream") return sse(PARKING_SSE);
      return new Response("not found", { status: 404 });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("erdenet-city parsing", () => {
  it("keeps only valid cameras and leaves unknown values unknown", () => {
    const cams = C.parseTraffic(TRAFFIC);
    expect(cams.map((c) => c.id)).toEqual([TRAFFIC[0].id, TRAFFIC[1].id, TRAFFIC[2].id, TRAFFIC[3].id, "weird"]);
    expect(cams[0]).toEqual({ id: TRAFFIC[0].id, name: "Булганын зам", lat: 48.990574, lng: 104.007043, vehicles: 5, load: "low", detectedAt: "2026-11-21T03:33:49.272Z" });
    const weird = cams.find((c) => c.id === "weird")!;
    expect([weird.vehicles, weird.load]).toEqual([null, null]);
    expect(C.parseTraffic({ not: "a list" })).toEqual([]);
  });

  it("summarises from fresh cameras only: level, busiest (high first), newest time", () => {
    const s = C.summarize(C.parseTraffic(TRAFFIC), NOW.getTime());
    expect(s.level).toBe("medium"); // low 0 + medium 1 + high 2 over 3 fresh = 1; the stale HIGH is left out
    expect(s.busiest).toEqual(["Хойд дугуй уулзвар", "Төгөл гарден зүүн"]);
    expect(s.updatedAt).toBe("2026-11-21T03:33:49.461Z");
    expect(C.summarize([], NOW.getTime())).toEqual({ level: null, busiest: [], updatedAt: null });
    const future = C.parseTraffic([{ ...TRAFFIC[2], detectedAt: "2099-01-01T00:00:00Z" }, { ...TRAFFIC[1], name: "" }]);
    expect(C.summarize(future, NOW.getTime())).toMatchObject({ level: "medium", busiest: [] }); // future time not trusted, nameless camera not named
  });

  it("parking: free from counts that add up, else unknown; rows without a total dropped", () => {
    const p = C.parseParking(PARKING, NOW.toISOString());
    expect(p.lots.map((l) => [l.id, l.total, l.free])).toEqual([
      ["76fe2c1f-77f7-4f7f-88d8-4d78bfb1c646", 45, 36],
      ["b787e23e-4b72-499f-becd-11f286bc304e", 120, 106],
      ["mismatch", 30, null],
    ]);
    expect(p.updatedAt).toBe(NOW.toISOString());
  });

  it("fuel: the nightly UNAVAILABLE is unknown, community votes only with 2+ agreeing, closed stations dropped", () => {
    const st = C.parseFuel(FUEL);
    expect(st.map((s) => s.id)).toEqual([FUEL[0].id, FUEL[1].id]);
    expect(st[0].fuels).toEqual([
      { type: "AI92", status: "unknown", updatedAt: "2026-11-21T00:00:00.022Z" },
      { type: "AI95", status: "selling", updatedAt: "2026-11-21T03:20:00.000Z", queue: "long", queueAt: "2026-11-21T03:20:00.000Z", source: "community" },
    ]);
    // A vote with no time never overrides; a queue report older than 2 h is dropped.
    const old = { ...FUEL[0], community: { AI92: { totalVotes: 5, status: "SELLING", queueLevel: "LONG", updatedAt: null }, AI95: { totalVotes: 5, status: "SELLING", queueLevel: "LONG", updatedAt: "2026-11-20T20:00:00Z" } } };
    expect(C.parseFuel([old], NOW.getTime())[0].fuels.map((f) => [f.status, f.queue])).toEqual([["unknown", undefined], ["selling", undefined]]);
    expect(st[1].org).toBe("Петровис");
    expect(st[1].fuels).toEqual([
      { type: "AI92", status: "selling", updatedAt: "2026-11-21T01:54:34.555Z" },
      { type: "EURO92", status: "sold_out", updatedAt: "2026-11-21T01:54:34.562Z" }, // one vote does not override the station
    ]);
  });

  it("reads the first SSE event, joining multi-line data and ignoring comments", () => {
    expect(C.sseData(": ping\n\ndata: {\"a\":\ndata: 1}\n\ndata: 2\n\n")).toBe('{"a":\n1}');
    expect(C.sseData("data: {\"partial\"")).toBeNull();
    expect(C.sseData("data: 3", true)).toBe("3");
    expect(C.sseData("event: x\r\ndata: 4\r\n\r\n")).toBe("4");
  });
});

describe("erdenet-city feeds", () => {
  it("calls only the public endpoints with the plain UA, closes the parking stream, and caches", async () => {
    await Promise.all([C.getTraffic(), C.getTraffic(), C.getParking(), C.getFuel()]);
    expect(calls.map((c) => c.url).sort()).toEqual([
      "https://dedtuv.erdenet.mn/api/fuel-stations",
      "https://dedtuv.erdenet.mn/api/parking/stream",
      "https://dedtuv.erdenet.mn/api/traffic",
    ]);
    for (const c of calls) {
      expect(new Headers(c.init?.headers).get("User-Agent")).toBe("Aspire/1.0 (+https://aspire-mn.vercel.app)");
      expect(c.init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(calls.find((c) => c.url.endsWith("/stream"))!.init!.signal!.aborted).toBe(true);
    expect(cancelled).toBe(true);

    vi.setSystemTime(NOW.getTime() + 25_000); // within every TTL
    await Promise.all([C.getTraffic(), C.getParking(), C.getFuel()]);
    expect(calls).toHaveLength(3);
    vi.setSystemTime(NOW.getTime() + 61_000); // traffic (30 s) and parking (60 s) refresh, fuel (5 min) does not
    await Promise.all([C.getTraffic(), C.getParking(), C.getFuel()]);
    expect(calls).toHaveLength(5);
  });

  it("serves the last traffic briefly when the feed fails, then errors", async () => {
    await C.getTraffic();
    fail.add("traffic");
    vi.setSystemTime(NOW.getTime() + 40_000);
    expect((await C.getTraffic()).cameras).toHaveLength(5);
    vi.setSystemTime(NOW.getTime() + 200_000);
    await expect(C.getTraffic()).rejects.toThrow();
  });

  it("cityData: Erdenet gets everything nearest first, UB a link, elsewhere nothing", async () => {
    const e = await C.cityData(ERDENET.lat, ERDENET.lng);
    expect(e.cameras).toEqual({ kind: "embed", url: "https://dedtuv.erdenet.mn/live", credit: "Орхон ТКХДТ" });
    expect(e.credit).toBe("Орхон ТКХДТ");
    expect(e.traffic?.summary.level).toBe("medium");
    expect(e.parking?.lots[0].name).toBe("Захиргааны 4-р байр"); // 1.9 km vs the railway lot's 6 km
    expect(e.parking?.lots[0].distanceM).toBeGreaterThan(1000);
    expect(e.fuel?.stations).toHaveLength(2);
    expect(e.down).toBeUndefined();

    const ub = await C.cityData(47.918, 106.917);
    expect(ub).toEqual({ traffic: null, parking: null, fuel: null, cameras: { kind: "link", url: "https://ubtraffic.mn", credit: "ЗХУТ" }, credit: "ЗХУТ" });
    expect(await C.cityData(52.52, 13.405)).toEqual({ traffic: null, parking: null, fuel: null, cameras: null, credit: null });
    expect(C.cityAt(49.03, 104.08)).toBe("erdenet");
  });

  it("cityData names a failed feed instead of showing it empty", async () => {
    fail.add("fuel-stations");
    const e = await C.cityData(ERDENET.lat, ERDENET.lng);
    expect(e.fuel).toBeNull();
    expect(e.down).toEqual(["fuel"]);
    expect(e.traffic).not.toBeNull();
  });
});

describe("GET /api/city", () => {
  const get = async (q: string) => (await import("@/app/api/city/route")).GET(new Request(`http://localhost/api/city${q}`, { headers: { "x-real-ip": `10.0.0.${q.length}` } }));

  it("validates the position", async () => {
    for (const q of ["", "?lat=49", "?lat=abc&lng=104", "?lat=91&lng=104", "?lat=49&lng=181", "?lat=1e3&lng=104", "?lat=49&lng=Infinity"]) {
      expect((await get(q)).status).toBe(400);
    }
  });

  it("returns the city data, privately cached", async () => {
    const res = await get("?lat=49.0333&lng=104.0833");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=30");
    const body = await res.json();
    expect(body.cameras.kind).toBe("embed");
    expect(body.traffic.cameras[0]).toHaveProperty("detectedAt");
  });
});

describe("city tools", () => {
  const ctx = (extra: Partial<ToolContext> = {}): ToolContext => ({ now: NOW, device: { memory: {}, reminders: [], location: ERDENET }, actions: [], ...extra });
  const tool = async (name: string) => (await import("@/lib/tools/city")).cityTools.find((t) => t.name === name)!;

  it("get_traffic: level, busiest, per-camera ages, stale flagged, live camera page", async () => {
    const out = (await (await tool("get_traffic")).run({ street: "" }, ctx())) as Record<string, unknown> & { cameras: Record<string, unknown>[] };
    expect(out).toMatchObject({ level: "medium", busiest: ["Хойд дугуй уулзвар", "Төгөл гарден зүүн"], ageS: 11, liveCameras: "https://dedtuv.erdenet.mn/live", credit: "Орхон ТКХДТ" });
    expect(out.cameras.find((c) => c.name === "6-10 Уулзвар")).toMatchObject({ stale: true, ageS: 5640 });
    expect(out.cameras.find((c) => c.name === "<b>x</b>")).toMatchObject({ vehicles: "unknown", load: "unknown" });
    const one = (await (await tool("get_traffic")).run({ street: "хойд дугуй" }, ctx())) as { cameras: unknown[] };
    expect(one.cameras).toHaveLength(1);
  });

  it("get_fuel: known stations first, the rest counted, never 'sold out' for no report", async () => {
    const out = (await (await tool("get_fuel")).run({ fuel: "ai92" }, ctx())) as { stations: { name: string; fuels: unknown[] }[]; stationsWithNoReport: number };
    expect(out.stations.map((s) => s.name)).toEqual(["Петровис ШТС"]);
    expect(out.stations[0].fuels).toEqual([{ type: "AI92", status: "selling", ageS: 5965 }]);
    expect(out.stationsWithNoReport).toBe(1);
  });

  it("get_parking: nearest first with free counts marked approximate", async () => {
    const out = (await (await tool("get_parking")).run({}, ctx())) as { lots: Record<string, unknown>[]; approx: string; ageS: number };
    expect(out.lots[0]).toMatchObject({ name: "Захиргааны 4-р байр", free: 36, total: 45 });
    expect(out.lots.find((l) => l.name === "Bad sums")!.free).toBe("unknown");
    expect(out.approx).toBeTruthy();
    expect(out.ageS).toBe(0);
  });

  it("is honest outside Erdenet and when the feed is down", async () => {
    const ub = (await (await tool("get_traffic")).run({ street: "" }, ctx({ device: { memory: {}, reminders: [] }, city: "Ulaanbaatar" }))) as Record<string, unknown>;
    expect(ub).toMatchObject({ liveCameras: "https://ubtraffic.mn", credit: "ЗХУТ" });
    expect(ub.error).toBeTruthy();
    const berlin = (await (await tool("get_parking")).run({}, ctx({ device: { memory: {}, reminders: [], location: { lat: 52.52, lng: 13.405 } } }))) as Record<string, unknown>;
    expect(berlin.error).toMatch(/No live parking data/);
    const ub2 = (await (await tool("get_parking")).run({}, ctx({ device: { memory: {}, reminders: [] }, city: "Ulan-Bator" }))) as Record<string, unknown>;
    expect(ub2.liveCameras).toBe("https://ubtraffic.mn");
    const named = (await (await tool("get_fuel")).run({ fuel: "" }, ctx({ device: { memory: {}, reminders: [] }, city: "Berlin" }))) as Record<string, unknown>;
    expect(named.error).toMatch(/No live fuel data/);
    const unknown = (await (await tool("get_fuel")).run({ fuel: "" }, ctx({ device: { memory: {}, reminders: [] } }))) as Record<string, unknown>;
    expect(unknown.error).toMatch(/Location unknown/);
    fail.add("traffic");
    const dead = (await (await tool("get_traffic")).run({ street: "" }, ctx())) as Record<string, unknown>;
    expect(dead).toMatchObject({ liveDataUnavailable: true });
    expect(calls.some((c) => /nats-creds|\/api\/stream|\/api\/parking$/.test(c.url))).toBe(false);
  });
});
