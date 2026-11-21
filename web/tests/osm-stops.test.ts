import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nearbyStops, OSM_CREDIT, OVERPASS_MIRRORS, overpassQuery, resetOsmStops } from "@/lib/osm-stops";
import { UA } from "@/lib/site";

const HERE = { lat: 47.9189, lng: 106.9189 }; // Ulaanbaatar, Sükhbaatar Square
const node = (id: number, lat: number, lon: number, tags: Record<string, unknown>) => ({ type: "node", id, lat, lon, tags });
const ELEMENTS = {
  elements: [
    node(3, 47.925, 106.93, { highway: "bus_stop", name: "Far" }),
    node(1, 47.9195, 106.918, { highway: "bus_stop", name: "Сансар", "name:en": "Sansar", "name:zh": "桑萨尔" }),
    node(2, 47.9192, 106.9185, { public_transport: "platform", bus: "yes", name: "Сансар" }), // other side of the road
    node(4, 47.919, 106.919, { highway: "bus_stop" }), // unnamed: left out
    node(5, 47.92, 106.92, { highway: "bus_stop", name: "<b>Bad</b>\u0007 stop" }),
    { type: "way", id: 6, tags: { name: "A way" } },
    node(7, 95, 106.92, { highway: "bus_stop", name: "Off the map" }),
  ],
};

type Route = (url: string, init: RequestInit) => Response | Promise<Response>;
function mockFetch(route: Route) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init: RequestInit) => {
      calls.push({ url: String(u), init });
      return route(String(u), init);
    }),
  );
  return calls;
}
const query = (init: RequestInit) => new URLSearchParams(String(init.body)).get("data") ?? "";

beforeEach(() => resetOsmStops());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("overpassQuery", () => {
  it("asks for bus stops and bus platforms within 800 m", () => {
    const q = overpassQuery({ lat: 47.92, lng: 106.92 });
    expect(q).toContain("node(around:800,47.92,106.92)[highway=bus_stop]");
    expect(q).toContain("node(around:800,47.92,106.92)[public_transport=platform][bus=yes]");
    expect(q).toMatch(/^\[out:json\]/);
  });
});

describe("nearbyStops", () => {
  it("names stops in the person's language, nearest first, one per name; never invents a name", async () => {
    const calls = mockFetch(() => Response.json(ELEMENTS));
    const mn = await nearbyStops(HERE, { lang: "mn" });
    expect(mn[0]).toEqual({ id: "osm-node-2", name: "Сансар", lat: 47.9192, lng: 106.9185, distanceM: expect.any(Number) });
    expect(mn.map((s) => s.name)).toEqual(["Сансар", "bBad/b stop", "Far"]);
    expect(mn[0].distanceM).toBeLessThan(mn[1].distanceM);
    // name:<lang> first, else the local name on the sign.
    expect((await nearbyStops(HERE, { lang: "en" }))[0].name).toBe("Sansar");
    expect((await nearbyStops(HERE, { lang: "zh" }))[0].name).toBe("桑萨尔");
    expect((await nearbyStops(HERE, { lang: "de" }))[0].name).toBe("Сансар");
    expect(await nearbyStops(HERE, { lang: "en", max: 1 })).toHaveLength(1);
    // One call for the whole cell, sent with our User-Agent and only the ~1 km cell.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OVERPASS_MIRRORS[0]);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["User-Agent"]).toBe(UA);
    expect(query(calls[0].init)).toContain("around:800,47.92,106.92");
    expect(query(calls[0].init)).not.toContain("47.9189");
    expect(OSM_CREDIT).toBe("OpenStreetMap contributors");
  });

  it("tries the mirrors in order until one answers", async () => {
    const calls = mockFetch((url) => {
      if (url === OVERPASS_MIRRORS[0]) return new Response("Too Many Requests", { status: 429 });
      if (url === OVERPASS_MIRRORS[1]) return Response.json({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1 after 10 seconds." });
      return Response.json(ELEMENTS);
    });
    const stops = await nearbyStops(HERE, { lang: "en" });
    expect(stops[0].name).toBe("Sansar");
    expect(calls.map((c) => c.url)).toEqual([...OVERPASS_MIRRORS]);
  });

  it("throws when every mirror fails, and keeps the failure only 10 minutes", async () => {
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    let up = false;
    const calls = mockFetch(() => (up ? Response.json(ELEMENTS) : Promise.reject(new TypeError("network down"))));
    await expect(nearbyStops(HERE)).rejects.toThrow("network down");
    expect(calls).toHaveLength(3);
    up = true;
    // Within 10 minutes the cell is not asked again (Overpass is a shared, free service).
    clock.mockReturnValue(t0 + 9 * 60_000);
    await expect(nearbyStops(HERE)).rejects.toThrow("recently");
    expect(calls).toHaveLength(3);
    clock.mockReturnValue(t0 + 11 * 60_000);
    expect((await nearbyStops(HERE)).length).toBe(3);
    expect(calls).toHaveLength(4);
  });

  it("rests a mirror that answers 429 for its Retry-After", async () => {
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    const calls = mockFetch((url) => (url === OVERPASS_MIRRORS[0] ? new Response("busy", { status: 429, headers: { "Retry-After": "120" } }) : Response.json(ELEMENTS)));
    await nearbyStops(HERE);
    expect(calls.map((c) => c.url)).toEqual(OVERPASS_MIRRORS.slice(0, 2));
    // Another cell 100 s later skips the resting mirror; after 120 s it is asked again.
    clock.mockReturnValue(t0 + 100_000);
    await nearbyStops({ lat: 47.95, lng: 106.95 });
    expect(calls.slice(2).map((c) => c.url)).toEqual([OVERPASS_MIRRORS[1]]);
    clock.mockReturnValue(t0 + 121_000);
    await nearbyStops({ lat: 47.97, lng: 106.97 });
    expect(calls[3].url).toBe(OVERPASS_MIRRORS[0]);
  });

  it("rejects an answer with no elements (an HTML error page)", async () => {
    const calls = mockFetch((url) => (url === OVERPASS_MIRRORS[0] ? Response.json({ error: "x" }) : Response.json(ELEMENTS)));
    expect((await nearbyStops(HERE)).length).toBe(3);
    expect(calls).toHaveLength(2);
  });

  it("keeps a cell for a day (an empty answer too), then asks again", async () => {
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    const calls = mockFetch(() => Response.json({ elements: [] }));
    expect(await nearbyStops(HERE)).toEqual([]);
    // Another point in the same ~1 km cell, 23 hours later: still cached.
    clock.mockReturnValue(t0 + 23 * 3_600_000);
    await nearbyStops({ lat: 47.9211, lng: 106.9161 });
    expect(calls).toHaveLength(1);
    // Another cell asks; the first cell after a day asks again.
    await nearbyStops({ lat: 47.95, lng: 106.95 });
    expect(calls).toHaveLength(2);
    clock.mockReturnValue(t0 + 25 * 3_600_000);
    await nearbyStops(HERE);
    expect(calls).toHaveLength(3);
  });

  it("shares one request between callers asking for the same cell at once", async () => {
    const calls = mockFetch(() => Response.json(ELEMENTS));
    await Promise.all([nearbyStops(HERE), nearbyStops(HERE, { lang: "mn" })]);
    expect(calls).toHaveLength(1);
  });

  it("stops trying mirrors once the time budget is spent", async () => {
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    const calls = mockFetch(() => {
      clock.mockReturnValue(t0 + 9_500); // the first mirror took 9.5 s and failed
      return new Response("Gateway Timeout", { status: 504 });
    });
    await expect(nearbyStops(HERE, { budgetMs: 10_000 })).rejects.toThrow("504");
    expect(calls).toHaveLength(1);
  });
});
