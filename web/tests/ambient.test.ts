import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/ambient/route";
import { cityParam, getAmbient, googleSky, locate, photoScore, photoVariants, placeName, resetAmbientCache, skyText, trafficLevel, wmoSky, cityPhoto } from "@/lib/ambient";
import { resetAirDetail } from "@/lib/tools/air";
import { drivingTraffic, haversineKm, resetMapsUsage } from "@/lib/maps";
import { resetTransitous } from "@/lib/transitous";

const user = vi.hoisted(() => ({ current: { id: "user_2abc", email: null } as { id: string; email: null } | null }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => user.current,
}));

const NOW = new Date("2026-11-21T10:00:00Z");

beforeEach(() => {
  user.current = { id: "user_2abc", email: null };
  resetAmbientCache();
  resetAirDetail();
  resetMapsUsage();
  resetTransitous();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
  vi.stubEnv("MAPS_DAILY_LIMIT", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type Handler = (url: string, init: RequestInit) => unknown;
/** Fake fetch routed by URL substring; unknown URLs fail like a network error. */
function mockFetch(routes: Array<[string, Handler | unknown]>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init: RequestInit) => {
      const url = String(u);
      calls.push({ url, init });
      const hit = routes.find(([part]) => url.includes(part));
      if (!hit) throw new TypeError("network down");
      const body = typeof hit[1] === "function" ? (hit[1] as Handler)(url, init) : hit[1];
      if (body instanceof Response) return body;
      return Response.json(body);
    }),
  );
  return calls;
}

const OPEN_METEO = {
  timezone: "Asia/Ulaanbaatar",
  current: { temperature_2m: -12, apparent_temperature: -18, weather_code: 71, is_day: 1, cloud_cover: 90, wind_speed_10m: 14, wind_direction_10m: 300, relative_humidity_2m: 70 },
  daily: { time: ["2026-11-21"], temperature_2m_max: [-8], temperature_2m_min: [-20], weather_code: [73], precipitation_probability_max: [60] },
};
const OPEN_METEO_AIR = { current: { pm2_5: 40.2, pm10: 80, us_aqi: 112 } };

// A tiny Erdenet network in the feed's own shape: stations are GeoJSON [lng, lat], paths [lat, lng].
// One bus of line Ч:1-Ч:2 is 915 m before "Төв" at 6 m/s (estimates assume at most 20 km/h).
const ERDENET: Array<[string, Handler]> = [
  [
    "dedtuv.erdenet.mn/api/transit/static",
    () => ({
      routes: [
        { _id: "r0", name: "БҮХ АВТОБУС", tagId: 0, color: "#007BFF", busName: "", order: 1 },
        { _id: "r1", name: "Ч:1-Ч:2 ИХ ЗАЛУУ-ШАНД", tagId: 63, color: "#B5DB53", busName: "Ч:1-Ч:2", order: 2 },
      ],
      stations: [
        { _id: "s1", name: "Төв", location: { type: "Point", coordinates: [104.08, 49.03] }, tagIds: [63] },
        { _id: "s2", name: "Зах", location: { type: "Point", coordinates: [104.09, 49.035] }, tagIds: [63] },
        { _id: "s3", name: "Уурхай", location: { type: "Point", coordinates: [104.03, 49.05] }, tagIds: [63] },
      ],
      routePaths: [{ name: "Ч:1", tagIds: [63], coords: [[49.02, 104.06], [49.03, 104.08], [49.04, 104.1]] }],
    }),
  ],
  [
    "dedtuv.erdenet.mn/api/transit/vehicles",
    () => [{ id: "86616424", name: "0216 ОРХ", lat: 49.025, lng: 104.07, alt: 1271, speed: 6, heading: 53, updatedAt: new Date().toISOString(), valid: true }],
  ],
];

describe("condition mapping", () => {
  it("maps Google weather types to sky kinds and intensity", async () => {
    expect(googleSky("LIGHT_RAIN")).toEqual({ kind: "rain", intensity: 0.35 });
    expect(googleSky("RAIN")).toEqual({ kind: "rain", intensity: 0.6 });
    expect(googleSky("HEAVY_RAIN")).toEqual({ kind: "rain", intensity: 0.9 });
    expect(googleSky("THUNDERSTORM").kind).toBe("storm");
    for (const t of ["SNOW", "LIGHT_SNOW", "HEAVY_SNOW", "BLOWING_SNOW", "SNOWSTORM"]) expect(googleSky(t).kind).toBe("snow");
    expect(googleSky("RAIN_AND_SNOW").kind).toBe("sleet");
    expect(googleSky("HAIL").kind).toBe("hail");
    expect(googleSky("FOG").kind).toBe("fog");
    expect(googleSky("HAZE").kind).toBe("fog");
    expect(googleSky("CLEAR")).toEqual({ kind: "clear", intensity: 0 });
    expect(googleSky("PARTLY_CLOUDY", 40)).toEqual({ kind: "partly", intensity: 0.4 });
  });

  it("reads compound Google types by what happens now", async () => {
    expect(googleSky("RAIN_LATER_BECOMING_CLEAR").kind).toBe("rain");
    expect(googleSky("CLEAR_BUT_LATER_TURNING_CLOUDY").kind).toBe("clear");
    expect(googleSky("SNOW_ACCOMPANIED_BY_LIGHTNING").kind).toBe("storm");
    expect(googleSky("RAINSNOW_MIX_RAIN_AS_MAIN").kind).toBe("sleet");
    expect(googleSky("CLOUDY_WITH_BRIEF_SNOW")).toEqual({ kind: "snow", intensity: 0.35 });
    expect(googleSky("WINDY", 10).kind).toBe("clear");
    expect(googleSky(null, 85).kind).toBe("cloudy");
  });

  it("maps Open-Meteo WMO codes", async () => {
    expect(wmoSky(0).kind).toBe("clear");
    expect(wmoSky(45).kind).toBe("fog");
    expect(wmoSky(53).kind).toBe("drizzle");
    expect(wmoSky(65)).toEqual({ kind: "rain", intensity: 0.9 });
    expect(wmoSky(71)).toEqual({ kind: "snow", intensity: 0.35 });
    expect(wmoSky(67).kind).toBe("sleet");
    expect(wmoSky(95).kind).toBe("storm");
    expect(wmoSky(99).kind).toBe("hail");
  });

  it("has condition words in every language and no emojis", async () => {
    for (const lang of ["mn", "zh", "en", "ru", "de"] as const) {
      const text = skyText({ kind: "snow", intensity: 0.3 }, lang);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(skyText({ kind: "snow", intensity: 0.3 }, "en")).toBe("Light snow");
  });
});

describe("traffic levels", () => {
  it("light below 1.15, moderate below 1.4, heavy above", async () => {
    expect(trafficLevel(1)).toBe("light");
    expect(trafficLevel(1.14)).toBe("light");
    expect(trafficLevel(1.15)).toBe("moderate");
    expect(trafficLevel(1.39)).toBe("moderate");
    expect(trafficLevel(1.4)).toBe("heavy");
    expect(trafficLevel(2.3)).toBe("heavy");
  });
});

describe("location precedence", () => {
  const vercel = new Headers({
    "x-vercel-ip-latitude": "49.0278",
    "x-vercel-ip-longitude": "104.0444",
    "x-vercel-ip-city": encodeURIComponent("Эрдэнэт"),
    "x-vercel-ip-country": "MN",
    "x-vercel-ip-timezone": "Asia/Ulaanbaatar",
  });

  it("valid query coordinates win over a city and keep 4 decimals (about 11 m)", async () => {
    const loc = await locate(new URLSearchParams("lat=49.03456&lng=104.08321&city=Berlin"), vercel);
    expect(loc).toEqual({ coords: { lat: 49.0346, lng: 104.0832 }, locatedBy: "device", city: "Эрдэнэт", country: "MN", timeZone: "Asia/Ulaanbaatar" });
  });

  it("geocodes a typed city (once a day) before falling back to the network", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const calls = mockFetch([["places:searchText", { places: [{ displayName: { text: "Erdenet" }, location: { latitude: 49.027812, longitude: 104.044391 } }] }]]);
    for (let i = 0; i < 2; i++) {
      const loc = await locate(new URLSearchParams("city=%20Erdenet%20"), vercel);
      expect(loc).toEqual({ coords: { lat: 49.0278, lng: 104.0444 }, locatedBy: "city", city: "Erdenet", english: "Erdenet", country: null, timeZone: null });
    }
    // Google once a day; GeoNames (down here) once, its miss kept an hour.
    expect(calls.map((c) => new URL(c.url).host)).toEqual(["places.googleapis.com", "geocoding-api.open-meteo.com"]);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ textQuery: "Erdenet" });
    expect(calls[0].url).not.toContain("test-key");
  });

  it("puts a typed city at its GeoNames centre, with its country and time zone, when it agrees with Google", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const geonames = (latitude: number, longitude: number) => ({ results: [{ name: "Singapore", latitude, longitude, country_code: "SG", timezone: "Asia/Singapore" }] });
    // Google gives the middle of the island; GeoNames the city centre 7.7 km away.
    mockFetch([
      ["places:searchText", { places: [{ formattedAddress: "Singapore", location: { latitude: 1.3521, longitude: 103.8198 } }] }],
      ["geocoding-api.open-meteo.com", geonames(1.28967, 103.85007)],
    ]);
    expect(await locate(new URLSearchParams("city=Singapore"), vercel)).toEqual({
      coords: { lat: 1.2897, lng: 103.8501 }, locatedBy: "city", city: "Singapore", english: "Singapore", country: "SG", timeZone: "Asia/Singapore",
    });
    // Within 3 km Google's precise point stays; the country and time zone still come from GeoNames.
    resetAmbientCache();
    mockFetch([
      ["places:searchText", { places: [{ formattedAddress: "Singapore", location: { latitude: 1.3521, longitude: 103.8198 } }] }],
      ["geocoding-api.open-meteo.com", geonames(1.36, 103.83)],
    ]);
    expect(await locate(new URLSearchParams("city=Singapore"), vercel)).toMatchObject({ coords: { lat: 1.3521, lng: 103.8198 }, country: "SG", timeZone: "Asia/Singapore" });
    // Another place of the same name (over 40 km off): Google's answer, nothing borrowed from it.
    resetAmbientCache();
    mockFetch([
      ["places:searchText", { places: [{ formattedAddress: "Singapore", location: { latitude: 1.3521, longitude: 103.8198 } }] }],
      ["geocoding-api.open-meteo.com", geonames(40.1, -75.2)],
    ]);
    expect(await locate(new URLSearchParams("city=Singapore"), vercel)).toMatchObject({ coords: { lat: 1.3521, lng: 103.8198 }, country: null, timeZone: null });
    // Untrusted answers: a bad country code or time zone is dropped, a bad position ignored.
    resetAmbientCache();
    mockFetch([
      ["places:searchText", { places: [{ formattedAddress: "Singapore", location: { latitude: 1.3521, longitude: 103.8198 } }] }],
      ["geocoding-api.open-meteo.com", { results: [{ latitude: 1.29, longitude: 103.85, country_code: "<b>", timezone: "Not a zone" }] }],
    ]);
    expect(await locate(new URLSearchParams("city=Singapore"), vercel)).toMatchObject({ coords: { lat: 1.29, lng: 103.85 }, country: null, timeZone: null });
  });

  it("names the typed city's country in the snapshot, for the place line and the news card", async () => {
    mockFetch([
      ["geocoding-api.open-meteo.com", { results: [{ name: "Tokyo", country: "Japan", country_code: "JP", timezone: "Asia/Tokyo", latitude: 35.6895, longitude: 139.69171 }] }],
      ["api.open-meteo.com/v1/forecast", { ...OPEN_METEO, timezone: "Asia/Tokyo" }],
    ]);
    const a = await getAmbient(await locate(new URLSearchParams("city=Tokyo"), vercel), "en", NOW);
    expect(a).toMatchObject({ place: "Tokyo, Japan", country: "JP", timeZone: "Asia/Tokyo", localHour: 19 });
  });

  it("geocodes a typed city with Open-Meteo when there is no Maps key", async () => {
    const calls = mockFetch([["geocoding-api.open-meteo.com", { results: [{ name: "Darkhan", country: "Mongolia", latitude: 49.4867, longitude: 105.9228 }] }]]);
    expect(await locate(new URLSearchParams("city=Darkhan"), vercel)).toMatchObject({ locatedBy: "city", city: "Darkhan", coords: { lat: 49.4867, lng: 105.9228 } });
    expect(calls[0].url).toContain("name=Darkhan");
  });

  it("searches the city photo by the geocoder's English name, not the typed Cyrillic", async () => {
    const calls = mockFetch([
      ["geocoding-api.open-meteo.com", { results: [{ name: "Darkhan", country: "Mongolia", latitude: 49.4867, longitude: 105.9228 }] }],
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
      ["commons.wikimedia.org/w/api.php", { query: { pages: {} } }],
    ]);
    const loc = await locate(new URLSearchParams(`city=${encodeURIComponent("Дархан")}`), new Headers());
    expect(loc).toMatchObject({ locatedBy: "city", city: "Дархан", english: "Darkhan" });
    const a = await getAmbient(loc, "mn", NOW);
    expect(a.place).toBe("Дархан");
    const searches = calls.filter((c) => c.url.includes("commons.wikimedia.org")).map((c) => new URL(c.url).searchParams.get("gsrsearch"));
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((q) => q?.startsWith("Darkhan "))).toBe(true);
  });

  it("uses the network when the city is invalid or unknown", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    mockFetch([["places:searchText", { places: [] }]]);
    for (const q of ["city=%3Cscript%3E", "city=12345", "city=Atlantis"]) {
      expect(await locate(new URLSearchParams(q), vercel)).toMatchObject({ locatedBy: "network", coords: { lat: 49.03, lng: 104.04 } });
    }
  });

  it("accepts city names in every script and rejects markup", async () => {
    for (const c of ["Erdenet", "Эрдэнэт", "额尔登特", "Sankt Pölten", "Saint-Étienne", "N'Djamena"]) expect(cityParam(c)).toBe(c);
    expect(cityParam("  New   York ")).toBe("New York");
    for (const c of ["", "   ", "<b>x</b>", "a".repeat(81), "123", "x;drop", null]) expect(cityParam(c)).toBeNull();
  });

  it("does not borrow the network city for a far away device position", async () => {
    const loc = await locate(new URLSearchParams("lat=52.52&lng=13.405"), vercel);
    expect(loc.locatedBy).toBe("device");
    expect(loc.city).toBeNull();
    expect(loc.timeZone).toBeNull();
  });

  it("falls back to the network headers when the query is missing or invalid", async () => {
    for (const q of ["", "lat=91&lng=10", "lat=abc&lng=1", "lat=10"]) {
      const loc = await locate(new URLSearchParams(q), vercel);
      expect(loc).toEqual({ coords: { lat: 49.03, lng: 104.04 }, locatedBy: "network", city: "Эрдэнэт", country: "MN", timeZone: "Asia/Ulaanbaatar" });
    }
  });

  it("gives nothing without query or headers, and a clear sky with no data", async () => {
    const calls = mockFetch([]);
    const loc = await locate(new URLSearchParams(), new Headers());
    expect(loc).toEqual({ coords: null, locatedBy: null, city: null, country: null, timeZone: null });
    const a = await getAmbient(loc, "en", NOW);
    expect(a).toMatchObject({ place: null, coords: null, locatedBy: null, weather: null, air: null, traffic: null, stops: [], photo: null, taxis: [], nextBus: null, localHour: null });
    expect(a.sky.kind).toBe("clear");
    expect(typeof a.sky.isDay).toBe("boolean");
    expect(calls).toHaveLength(0);
  });

  it("ignores a bad time zone header", async () => {
    const loc = await locate(new URLSearchParams(), new Headers({ "x-vercel-ip-timezone": "Not/A Zone<script>" }));
    expect(loc.timeZone).toBeNull();
  });
});

describe("snapshot without a Google key", () => {
  it("uses Open-Meteo for weather and air; no traffic; Erdenet live stops and next bus", async () => {
    const calls = mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
      ...ERDENET,
    ]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=49.0301&lng=104.0801"), new Headers()), "ru", NOW);
    expect(a.sky).toEqual({ kind: "snow", intensity: 0.35, isDay: true, windKph: 14, cloudCover: 90 });
    expect(a.weather).toMatchObject({ tempC: -12, feelsC: -18, text: "Небольшой снег" });
    expect(a.weather?.days[0]).toMatchObject({ date: "2026-11-21", minC: -20, maxC: -8, kind: "snow", precipChance: 60 });
    expect(a.air).toEqual({
      aqi: 112, category: "sensitive", pm25: 40.2, source: "open-meteo", at: expect.any(String),
      pollutants: { pm25: 40.2, pm10: 80, o3: null, no2: null, so2: null, co: null }, dominant: null, forecast: [],
    });
    expect(a.weather).toMatchObject({ source: "open-meteo", at: expect.any(String) });
    expect(a.stopsSource).toBe("erdenet-live");
    expect(a.traffic).toBeNull();
    // Erdenet's own feed works without a Maps key: real stop positions, live estimates.
    expect(a.coords).toEqual({ lat: 49.0301, lng: 104.0801 });
    expect(a.stops.map((s) => s.name)).toEqual(["Төв", "Зах", "Уурхай"]);
    expect(a.stops[0]).toMatchObject({ lat: 49.03, lng: 104.08, lines: [{ route: "Ч:1-Ч:2", minutes: 3 }] });
    expect(a.stops[0].distanceM).toBeLessThan(20);
    expect(a.stops[1].lines).toEqual([{ route: "Ч:1-Ч:2", minutes: 6 }]);
    expect(a.stops[2].lines).toBeUndefined();
    // The stop the soonest bus leaves from is named with it.
    expect(a.nextBus).toEqual({ line: "Ч:1-Ч:2", departsInMin: 3, source: "erdenet-live", kind: "estimate", at: NOW.toISOString(), stop: "Төв" });
    expect(a.taxis).toEqual([]);
    expect(a.photo).toBeNull();
    expect(a.timeZone).toBe("Asia/Ulaanbaatar");
    expect(a.localHour).toBe(18);
    expect(calls.every((c) => !c.url.includes("googleapis"))).toBe(true);
    // Polite: the static network and the vehicles only, with our User-Agent; never the credentials.
    const feed = calls.filter((c) => c.url.includes("dedtuv.erdenet.mn"));
    expect(feed.every((c) => /\/api\/transit\/(?:static|vehicles)$/.test(c.url))).toBe(true);
    expect(feed.every((c) => (c.init.headers as Record<string, string>)["User-Agent"] === "Aspire/1.0 (+https://aspire-mn.vercel.app)")).toBe(true);
  });

  it("serves the second request in the same 1 km cell from the cache", async () => {
    const calls = mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
      ["en.wikipedia.org/w/api.php", { query: { pages: {} } }], // "no image here" is kept for the day
      ["api.transitous.org", { stopTimes: [] }], // "no departures here" is kept for 30 s
      ["overpass-api.de", { elements: [] }], // "no OSM stops here" is kept for the day
    ]);
    const first = await getAmbient(await locate(new URLSearchParams("lat=47.9211&lng=106.9211"), new Headers()), "en", NOW);
    // The street address is per ~11 m, so only it is looked up again.
    const notAddress = () => calls.filter((c) => !/geocode\.googleapis|nominatim/.test(c.url)).length;
    const n = notAddress();
    const second = await getAmbient(await locate(new URLSearchParams("lat=47.9189&lng=106.9189"), new Headers()), "en", NOW);
    expect(notAddress()).toBe(n);
    expect(second.weather).toEqual(first.weather);
    expect(second.coords).toEqual({ lat: 47.9189, lng: 106.9189 });
  });

  it("takes stops and the next bus from Transitous, live or scheduled, with only the 1 km cell sent", async () => {
    const dep = (name: string, lat: number, lon: number, min: number, route: string, realTime: boolean) => ({
      place: { name, lat, lon, tz: "Europe/Paris", departure: new Date(NOW.getTime() + min * 60_000).toISOString() },
      routeShortName: route,
      realTime,
      headsign: "Centre",
    });
    const calls = mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["api.transitous.org/api/v5/stoptimes", { stopTimes: [dep("Gare", 48.8443, 2.3745, 4, "91", false), dep("Bastille", 48.8532, 2.3691, 2, "29", true), dep("Gare", 48.8443, 2.3745, 9, "24", true)] }],
    ]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=48.8449&lng=2.3739"), new Headers()), "en", NOW);
    expect(a.stops).toEqual([
      { name: "Gare", distanceM: expect.any(Number), lat: 48.8443, lng: 2.3745, lines: [{ route: "91", minutes: 4, live: false }, { route: "24", minutes: 9, live: true }] },
      { name: "Bastille", distanceM: expect.any(Number), lat: 48.8532, lng: 2.3691, lines: [{ route: "29", minutes: 2, live: true }] },
    ]);
    expect(a.nextBus).toEqual({ line: "29", departsInMin: 2, source: "transitous", kind: "live", at: NOW.toISOString(), stop: "Bastille" });
    const t = calls.find((c) => c.url.includes("transitous"))!;
    expect(new URL(t.url).searchParams.get("center")).toBe("48.84,2.37");
    expect(t.url).not.toContain("48.8449");
    // A network (IP) position never gets a "next bus from here".
    resetAmbientCache();
    const ip = await getAmbient(await locate(new URLSearchParams(), new Headers({ "x-vercel-ip-latitude": "48.84", "x-vercel-ip-longitude": "2.37" })), "en", NOW);
    expect(ip).toMatchObject({ stops: [], nextBus: null });
  });

  it("falls back to OpenStreetMap stops (no times, credited to OSM) where no feed has departures", async () => {
    const node = (id: number, lat: number, lon: number, tags: Record<string, string>) => ({ type: "node", id, lat, lon, tags });
    const calls = mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["api.transitous.org/api/v5/stoptimes", { stopTimes: [] }],
      ["overpass-api.de", { elements: [node(1, 47.9195, 106.918, { highway: "bus_stop", name: "Сансар", "name:en": "Sansar" }), node(2, 47.925, 106.93, { highway: "bus_stop" })] }],
    ]);
    const mn = await getAmbient(await locate(new URLSearchParams("lat=47.9189&lng=106.9189"), new Headers()), "mn", NOW);
    expect(mn.stops).toEqual([{ name: "Сансар", distanceM: expect.any(Number), lat: 47.9195, lng: 106.918, kind: "stop", source: "osm" }]);
    expect(mn.stops[0]).not.toHaveProperty("lines");
    expect(mn).not.toHaveProperty("stopsSource");
    expect(mn.nextBus).toBeNull();
    // Transitous was asked first; Overpass got only the ~1 km cell.
    const order = calls.map((c) => c.url).filter((u) => /transitous|overpass/.test(u));
    expect(order[0]).toContain("transitous");
    const q = new URLSearchParams(String(calls.find((c) => c.url.includes("overpass"))!.init.body)).get("data")!;
    expect(q).toContain("around:800,47.92,106.92");
    expect(q).not.toContain("47.9189");
    // English asks name:en of the same (cached) cell.
    const en = await getAmbient(await locate(new URLSearchParams("lat=47.9189&lng=106.9189"), new Headers()), "en", NOW);
    expect(en.stops[0].name).toBe("Sansar");
    expect(calls.filter((c) => c.url.includes("overpass"))).toHaveLength(1);
  });

  it("prefers Transitous departures over OSM stops (OSM is never asked)", async () => {
    const calls = mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["api.transitous.org/api/v5/stoptimes", { stopTimes: [{ place: { name: "Gare", lat: 48.8443, lon: 2.3745, departure: new Date(NOW.getTime() + 4 * 60_000).toISOString() }, routeShortName: "91", realTime: false }] }],
      ["overpass", { elements: [{ type: "node", id: 1, lat: 48.845, lon: 2.374, tags: { name: "Other" } }] }],
    ]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=48.8449&lng=2.3739"), new Headers()), "en", NOW);
    expect(a.stopsSource).toBe("transitous");
    expect(a.stops.map((s) => s.name)).toEqual(["Gare"]);
    expect(calls.some((c) => c.url.includes("overpass"))).toBe(false);
  });

  it("a typed city uses its geocoded centre for departures (searching Berlin shows Berlin)", async () => {
    const calls = mockFetch([
      ["geocoding-api.open-meteo.com", { results: [{ name: "Berlin", country: "Germany", latitude: 52.52437, longitude: 13.41053 }] }],
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["api.transitous.org/api/v5/stoptimes", { stopTimes: [{ place: { name: "Alexanderplatz", lat: 52.5215, lon: 13.4115, tz: "Europe/Berlin", departure: new Date(NOW.getTime() + 3 * 60_000).toISOString() }, routeShortName: "100", realTime: true }] }],
    ]);
    // The network says Erdenet; the typed city wins over it.
    const net = new Headers({ "x-vercel-ip-latitude": "49.03", "x-vercel-ip-longitude": "104.08" });
    const a = await getAmbient(await locate(new URLSearchParams("city=Berlin"), net), "de", NOW);
    expect(a).toMatchObject({ locatedBy: "city", stopsSource: "transitous", nextBus: { line: "100", source: "transitous", kind: "live" } });
    expect(a.stops[0].name).toBe("Alexanderplatz");
    expect(new URL(calls.find((c) => c.url.includes("transitous"))!.url).searchParams.get("center")).toBe("52.52,13.41");
    expect(calls.some((c) => c.url.includes("dedtuv.erdenet.mn"))).toBe(false);
  });

  it("fills the hero's hourly strip from Open-Meteo (UTC times), and an hourly failure never fails the weather", async () => {
    const t0 = Math.floor(Date.now() / 3_600_000) * 3600;
    const hourly = { hourly: { time: [t0, t0 + 3600], temperature_2m: [-12, -13], weather_code: [71, 0], precipitation_probability: [40, 150] } };
    mockFetch([["api.open-meteo.com/v1/forecast", (url: string) => (url.includes("hourly=") ? hourly : OPEN_METEO)]]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=47.9189&lng=106.9189"), new Headers()), "en", NOW);
    expect(a.weather?.hourly).toEqual([
      { time: new Date(t0 * 1000).toISOString(), tempC: -12, kind: "snow", precipChance: 40 },
      { time: new Date((t0 + 3600) * 1000).toISOString(), tempC: -13, kind: "clear", precipChance: null },
    ]);
    resetAmbientCache();
    mockFetch([["api.open-meteo.com/v1/forecast", (url: string) => (url.includes("hourly=") ? new Response("", { status: 503 }) : OPEN_METEO)]]);
    const b = await getAmbient(await locate(new URLSearchParams("lat=47.9189&lng=106.9189"), new Headers()), "en", NOW);
    expect(b.weather?.tempC).toBe(-12);
    expect(b.weather).not.toHaveProperty("hourly");
  });

  it("still answers when every source fails", async () => {
    mockFetch([]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=10&lng=20"), new Headers()), "en", NOW);
    expect(a).toMatchObject({ coords: { lat: 10, lng: 20 }, weather: null, air: null, traffic: null, stops: [] });
    expect(a.sky.kind).toBe("clear");
  });
});

describe("snapshot with Google", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key"));

  const current = {
    timeZone: { id: "Europe/Berlin" },
    isDaytime: false,
    weatherCondition: { type: "HEAVY_RAIN", description: { text: "Starker Regen" } },
    temperature: { degrees: 6.5 },
    feelsLikeTemperature: { degrees: 3 },
    relativeHumidity: 92,
    cloudCover: 100,
    wind: { speed: { value: 22 }, direction: { degrees: 250 } },
    precipitation: { probability: { percent: 90 }, qpf: { quantity: 4.2 } },
  };
  const forecast = {
    forecastDays: [
      {
        displayDate: { year: 2026, month: 11, day: 21 },
        maxTemperature: { degrees: 8 },
        minTemperature: { degrees: 2 },
        daytimeForecast: { weatherCondition: { type: "RAIN", description: { text: "Regen" } }, precipitation: { probability: { percent: 80 } } },
      },
    ],
  };
  const air = { indexes: [{ code: "uaqi", aqi: 70, dominantPollutant: "no2" }], pollutants: [{ code: "pm25", concentration: { value: 8 } }] };
  const centre = { places: [{ displayName: { text: "Mitte" }, location: { latitude: 52.52, longitude: 13.405 }, addressComponents: [{ longText: "Berlin", types: ["locality", "political"] }] }] };
  const stops = {
    places: [
      { id: "abc", displayName: { text: "Alexanderplatz" }, location: { latitude: 52.5219, longitude: 13.4132 }, googleMapsUri: "https://maps.google.com/?cid=1" },
      { id: "def", displayName: { text: "Rosenthaler Platz" }, location: { latitude: 52.5297, longitude: 13.4015 }, googleMapsUri: "javascript:alert(1)" },
    ],
  };

  const taxiStand = { id: "t1", displayName: { text: "Taxistand Invalidenstr." }, location: { latitude: 52.5301, longitude: 13.3801 }, nationalPhoneNumber: "<b>" };
  const taxiCo = { id: "t2", displayName: { text: "Taxi Berlin" }, location: { latitude: 52.5505, longitude: 13.4005 }, nationalPhoneNumber: "030 202020" };
  const photos = {
    places: [
      {
        googleMapsUri: "https://maps.google.com/?cid=9",
        photos: [
          { name: "places/p1/photos/tall", widthPx: 800, heightPx: 1200, authorAttributions: [{ displayName: "Tall", uri: "https://maps.google.com/maps/contrib/2" }] },
          { name: "places/p1/photos/wide", widthPx: 1600, heightPx: 900, authorAttributions: [{ displayName: "A. Bat", uri: "//maps.google.com/maps/contrib/1" }] },
        ],
      },
    ],
  };
  const PHOTO_URI = "https://lh3.googleusercontent.com/place-photos/wide=s1600";
  const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
  const transit = {
    routes: [
      {
        legs: [
          {
            steps: [
              {
                travelMode: "TRANSIT",
                transitDetails: {
                  stopDetails: { departureStop: { name: "Nordbahnhof" }, departureTime: at(7), arrivalTime: at(20) },
                  headsign: "S Ostkreuz",
                  transitLine: { nameShort: "M10", name: "M10" },
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const body = (init: RequestInit) => JSON.parse(String(init.body ?? "{}"));
  const mask = (init: RequestInit) => String((init.headers as Record<string, string>)["X-Goog-FieldMask"] ?? "");

  /** Google routed by what each call asks for. */
  function google(drive: { duration: string; staticDuration: string }) {
    return mockFetch([
      ["currentConditions:lookup?location", current],
      ["forecast/days:lookup", forecast],
      ["airquality.googleapis.com", air],
      ["/media?", { name: "places/p1/photos/wide/media", photoUri: PHOTO_URI }],
      ["places:searchText", (_u: string, init: RequestInit) => (body(init).textQuery === "taxi" ? { places: [taxiCo, taxiStand] } : mask(init).includes("photos") ? photos : centre)],
      ["places:searchNearby", (_u: string, init: RequestInit) => (body(init).includedTypes.includes("taxi_stand") ? { places: [taxiStand] } : stops)],
      ["computeRoutes", (_u: string, init: RequestInit) => (body(init).travelMode === "TRANSIT" ? transit : { routes: [drive] })],
    ]);
  }

  it("maps weather, air, traffic, stops, taxis, the next bus and a photo", async () => {
    const calls = google({ duration: "1500s", staticDuration: "1000s" });
    const a = await getAmbient(await locate(new URLSearchParams("lat=52.5512&lng=13.4049"), new Headers()), "de", NOW);
    expect(a.place).toBe("Berlin");
    expect(a.coords).toEqual({ lat: 52.5512, lng: 13.4049 });
    expect(a.sky).toEqual({ kind: "rain", intensity: 0.9, isDay: false, windKph: 22, cloudCover: 100 });
    expect(a.weather).toMatchObject({ tempC: 6.5, feelsC: 3, text: "Starker Regen" });
    expect(a.weather?.days).toEqual([{ date: "2026-11-21", minC: 2, maxC: 8, text: "Regen", kind: "rain", precipChance: 80 }]);
    // No US index from Google here: the number comes from PM2.5.
    expect(a.air).toMatchObject({ aqi: 44, category: "good", source: "google" });
    expect(a.traffic).toEqual({ level: "heavy", delayMin: 8, at: expect.any(String) });
    expect(a.timeZone).toBe("Europe/Berlin");
    expect(a.localHour).toBe(11);
    expect(a.stops.map((s) => s.name)).toEqual(["Rosenthaler Platz", "Alexanderplatz"]);
    expect(a.stops[1]).toMatchObject({ lat: 52.5219, lng: 13.4132 });
    // Distances are measured from the precise position, not the 1 km cell (52.55, 13.40).
    expect(a.stops[0].distanceM).toBe(Math.round(haversineKm({ lat: 52.5512, lng: 13.4049 }, { lat: 52.5297, lng: 13.4015 }) * 1000));

    expect(a.taxis).toEqual([
      { name: "Taxi Berlin", phone: "030 202020", distanceM: expect.any(Number), lat: 52.5505, lng: 13.4005 },
      { name: "Taxistand Invalidenstr.", phone: null, distanceM: expect.any(Number), lat: 52.5301, lng: 13.3801 },
    ]);
    expect(a.taxis![0].distanceM).toBeLessThan(a.taxis![1].distanceM);
    expect(a.nextBus).toEqual({ line: "M10", departsInMin: 7, source: "google", kind: "scheduled", at: NOW.toISOString() });
    // No landmark photo from Google any more (owner: the whole city only, from Commons).
    expect(calls.some((c) => c.url.includes("/media?"))).toBe(false);
    // Google stops and bus: neither Transitous nor OpenStreetMap is asked.
    expect(calls.some((c) => /transitous|overpass/.test(c.url))).toBe(false);

    // The key travels only in the header, never in a URL.
    const googleCalls = calls.filter((c) => c.url.includes("googleapis.com"));
    expect(googleCalls.length).toBeGreaterThan(0);
    for (const c of googleCalls) {
      expect(c.url).not.toContain("test-key");
      expect((c.init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-key");
    }
    const route = calls.find((c) => c.url.includes("computeRoutes") && body(c.init).travelMode === "DRIVE")!;
    expect(JSON.parse(String(route.init.body))).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" });
    expect((route.init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("routes.duration,routes.staticDuration");
    const nearby = body(calls.find((c) => c.url.includes("searchNearby") && !body(c.init).includedTypes.includes("taxi_stand"))!.init);
    expect(nearby).toMatchObject({ includedTypes: ["bus_stop", "bus_station", "transit_station"], rankPreference: "DISTANCE", maxResultCount: 5 });
    expect(nearby.locationRestriction.circle.radius).toBe(1000);
  });

  it("probes nearby roads when already in the centre", async () => {
    google({ duration: "600s", staticDuration: "580s" });
    const a = await getAmbient(await locate(new URLSearchParams("lat=52.52&lng=13.41"), new Headers()), "en", NOW);
    expect(a.traffic).toEqual({ level: "light", delayMin: 0, at: expect.any(String) });
    expect(a.nextBus).toBeNull();
  });

  it("falls back to Open-Meteo when Google weather fails", async () => {
    mockFetch([
      ["weather.googleapis.com", () => Response.json({ error: { status: "PERMISSION_DENIED" } }, { status: 403 })],
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["airquality.googleapis.com", air],
    ]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=1&lng=2"), new Headers()), "en", NOW);
    expect(a.sky.kind).toBe("snow");
    expect(a.traffic).toBeNull();
    expect(a.stops).toEqual([]);
  });

  it("uses the Erdenet live feed for stops and the next bus instead of Google", async () => {
    const calls = mockFetch([
      ["currentConditions:lookup?location", { ...current, timeZone: { id: "Asia/Ulaanbaatar" } }],
      ["forecast/days:lookup", forecast],
      ["airquality.googleapis.com", air],
      ["places:searchText", { places: [{ location: { latitude: 49.03, longitude: 104.08 }, addressComponents: [{ longText: "Erdenet", types: ["locality"] }] }] }],
      ["places:searchNearby", { places: [] }],
      ["computeRoutes", { routes: [{ duration: "300s", staticDuration: "300s" }] }],
      ...ERDENET,
    ]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=49.0301&lng=104.0801"), new Headers()), "en", NOW);
    expect(a.place).toBe("Erdenet");
    expect(a.stops[0]).toMatchObject({ name: "Төв", lat: 49.03, lng: 104.08, lines: [{ route: "Ч:1-Ч:2", minutes: 3 }] });
    expect(a.nextBus).toMatchObject({ line: "Ч:1-Ч:2", departsInMin: 3, source: "erdenet-live" });
    // No Google stop search and no Google transit routing in Erdenet.
    expect(calls.filter((c) => c.url.includes("searchNearby")).every((c) => (body(c.init).includedTypes as string[]).includes("taxi_stand"))).toBe(true);
    expect(calls.filter((c) => c.url.includes("computeRoutes")).every((c) => body(c.init).travelMode === "DRIVE")).toBe(true);
  });

  it("asks Google in English for Mongolian and uses our own Mongolian words", async () => {
    const calls = google({ duration: "600s", staticDuration: "600s" });
    const a = await getAmbient(await locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "mn", NOW);
    expect(a.weather?.text).toBe("Хүчтэй бороо");
    for (const c of calls.filter((x) => x.url.includes("weather.googleapis.com"))) expect(c.url).toContain("languageCode=en");
  });

  it("probes nearby roads instead of a city centre that is far away", async () => {
    mockFetch([
      ["currentConditions:lookup?location", current],
      ["forecast/days:lookup", forecast],
      ["airquality.googleapis.com", air],
      ["places:searchText", { places: [{ location: { latitude: 53.5, longitude: 10 }, addressComponents: [{ longText: "Hamburg", types: ["locality"] }] }] }],
      ["places:searchNearby", { places: [] }],
      ["computeRoutes", { routes: [{ duration: "500s", staticDuration: "400s" }] }],
    ]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "en", NOW);
    expect(a.place).toBeNull();
    expect(a.traffic).toEqual({ level: "moderate", delayMin: 2, at: expect.any(String) });
  });

  it("keeps stops, taxis, the centre and the photo for a day, and refreshes the weather after 10 minutes", async () => {
    const calls = google({ duration: "600s", staticDuration: "600s" });
    const t0 = Date.now();
    await getAmbient(await locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "en", NOW);
    const count = (part: string) => calls.filter((c) => c.url.includes(part)).length;
    expect([count("searchNearby"), count("searchText"), count("/media?"), count("currentConditions:lookup?location")]).toEqual([2, 2, 0, 1]);
    vi.spyOn(Date, "now").mockReturnValue(t0 + 11 * 60 * 1000);
    await getAmbient(await locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "en", NOW);
    expect([count("searchNearby"), count("searchText"), count("/media?"), count("currentConditions:lookup?location")]).toEqual([2, 2, 0, 2]);
  });
});

describe("Google quota", () => {
  it("background calls stop at 60% of the daily limit, leaving the rest for questions", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    vi.stubEnv("MAPS_DAILY_LIMIT", "5");
    mockFetch([["computeRoutes", { routes: [{ duration: "60s", staticDuration: "60s" }] }]]);
    const a = { lat: 1, lng: 1 };
    const b = { lat: 1, lng: 1.02 };
    for (let i = 0; i < 3; i++) expect(await drivingTraffic(a, b, { background: true })).not.toBeNull();
    await expect(drivingTraffic(a, b, { background: true })).rejects.toThrow("background limit");
    expect(await drivingTraffic(a, b)).not.toBeNull();
  });
});

describe("failed snapshots", () => {
  it("are retried after a minute instead of ten", async () => {
    const t0 = Date.now();
    mockFetch([]);
    const loc = await locate(new URLSearchParams("lat=10&lng=20"), new Headers());
    expect((await getAmbient(loc, "en", NOW)).weather).toBeNull();
    mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
    ]);
    vi.spyOn(Date, "now").mockReturnValue(t0 + 30 * 1000);
    expect((await getAmbient(loc, "en", NOW)).weather).toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(t0 + 61 * 1000);
    expect((await getAmbient(loc, "en", NOW)).weather?.tempC).toBe(-12);
  });
});

describe("place name", () => {
  it("adds the country in the person's language", async () => {
    expect(placeName("Erdenet", "MN", "en")).toBe("Erdenet, Mongolia");
    expect(placeName("Berlin", "DE", "de")).toBe("Berlin, Deutschland");
    expect(placeName("Berlin", null, "en")).toBe("Berlin");
    expect(placeName("Berlin", "<b>", "en")).toBe("Berlin");
    expect(placeName(null, "MN", "en")).toBeNull();
  });

  it("uses the network city and country for a network position", async () => {
    mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
    ]);
    const headers = new Headers({ "x-vercel-ip-latitude": "35.68", "x-vercel-ip-longitude": "139.69", "x-vercel-ip-city": "Tokyo", "x-vercel-ip-country": "JP" });
    const a = await getAmbient(await locate(new URLSearchParams(), headers), "en", NOW);
    // An IP-derived position never goes back to the browser.
    expect(a).toMatchObject({ place: "Tokyo, Japan", locatedBy: "network", coords: null });
  });
});

describe("/api/ambient", () => {
  let ip = 0;
  const req = (q = "", headers: Record<string, string> = {}) =>
    new Request(`http://localhost/api/ambient${q}`, { headers: { "x-real-ip": `10.9.0.${++ip}`, ...headers } });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/ambient", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "x-real-ip": `10.9.0.${++ip}`, ...headers } });

  it("takes the position from the POST body and keeps it out of the URL; GET ignores position params", async () => {
    mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
    ]);
    const res = await POST(post({ lang: "en", lat: 52.52, lng: 13.405 }));
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await res.json()).locatedBy).toBe("device");
    const viaGet = await GET(req("?lat=52.52&lng=13.405", { "x-vercel-ip-latitude": "47.92", "x-vercel-ip-longitude": "106.92" }));
    expect((await viaGet.json()).locatedBy).toBe("network");
    const junk = await POST(post({ lat: "52.52; drop", lng: 999 }, { "x-vercel-ip-latitude": "47.92", "x-vercel-ip-longitude": "106.92" }));
    expect((await junk.json()).locatedBy).toBe("network");
  });

  it("401 when signed out, without touching the network", async () => {
    user.current = null;
    const calls = mockFetch([]);
    const res = await POST(post({ lat: 49.03, lng: 104.08 }));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("200 with the snapshot and a private cache header", async () => {
    mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
    ]);
    const res = await GET(req("?lang=mn", { "x-vercel-ip-latitude": "47.92", "x-vercel-ip-longitude": "106.92", "x-vercel-ip-city": "Ulaanbaatar" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    const body = await res.json();
    expect(body).toMatchObject({ place: "Ulaanbaatar", locatedBy: "network", coords: null });
    expect(body.weather.text).toBe("Бага зэргийн цас");
  });

  it("sends a user who asks for many places in an hour to the network position", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    mockFetch([["places:searchText", { places: [{ location: { latitude: 48.1, longitude: 11.5 } }] }]]);
    user.current = { id: "user_many_places", email: null };
    const located: string[] = [];
    for (const city of ["Munich", "Berlin", "Hamburg", "Cologne", "Bonn", "Essen"]) {
      const res = await POST(post({ city }, { "x-vercel-ip-latitude": "47.92", "x-vercel-ip-longitude": "106.92" }));
      located.push((await res.json()).locatedBy);
    }
    expect(located).toEqual(["city", "city", "city", "city", "city", "network"]);
  });

  it("429 when rate limited", async () => {
    mockFetch([]);
    const headers = { "x-real-ip": "10.99.99.99" };
    let last: Response | null = null;
    for (let i = 0; i < 31; i++) last = await GET(new Request("http://localhost/api/ambient", { headers }));
    expect(last!.status).toBe(429);
  });
});

describe("Erdenet feed edge cases", () => {
  const weatherOnly: Array<[string, unknown]> = [
    ["api.open-meteo.com/v1/forecast", OPEN_METEO],
    ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
  ];

  it("keeps the real stops (without arrivals) when the vehicles feed is down", async () => {
    // Past the 60 s a stale vehicle list may be served; the static network is still fresh.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5 * 60_000);
    mockFetch([...weatherOnly, ERDENET[0]]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=49.0301&lng=104.0801"), new Headers()), "mn", NOW);
    expect(a.stops.map((s) => s.name)).toEqual(["Төв", "Зах", "Уурхай"]);
    expect(a.stops.every((s) => s.lines === undefined)).toBe(true);
    expect(a.nextBus).toBeNull();
  });

  it("gives no nearest stop or next bus for an approximate network position", async () => {
    const calls = mockFetch([...weatherOnly, ...ERDENET]);
    const headers = new Headers({ "x-vercel-ip-latitude": "49.03", "x-vercel-ip-longitude": "104.08", "x-vercel-ip-city": "Erdenet" });
    const a = await getAmbient(await locate(new URLSearchParams(), headers), "en", NOW);
    expect(a).toMatchObject({ locatedBy: "network", coords: null, stops: [], nextBus: null });
    expect(calls.some((c) => c.url.includes("dedtuv.erdenet.mn"))).toBe(false);
  });
});

describe("cityPhoto (whole-city Commons photo)", () => {
  const page = (title: string, index: number, w = 1920, h = 1080, desc = "", cats = "") => ({
    title, index,
    imageinfo: [{ thumburl: `https://thumb.wikimedia.org/t/${index}.jpg`, thumbwidth: w, thumbheight: h, descriptionurl: "https://commons.wikimedia.org/wiki/F",
      extmetadata: { Artist: { value: "<a>Ann</a>" }, LicenseShortName: { value: "CC BY-SA 4.0" }, ImageDescription: { value: desc }, Categories: { value: cats } } }],
  });
  const commons = (pages: Record<string, unknown>) => mockFetch([["commons.wikimedia.org/w/api.php", { query: { pages } }]]);
  const searches = (calls: Array<{ url: string }>) => calls.map((c) => new URL(c.url).searchParams.get("gsrsearch"));

  it("takes the wide photo whose title names the city as a whole word", async () => {
    commons({ a: page("File:Muruntau mine.jpg", 1), b: page("File:Murun portrait.jpg", 2, 1000, 1500), c: page("File:Murun city view 2019.jpg", 3) });
    expect(await cityPhoto("Murun, Mongolia")).toEqual({
      url: "https://thumb.wikimedia.org/t/3.jpg",
      attribution: { name: "Ann / CC BY-SA 4.0 (Wikimedia Commons)", uri: "https://commons.wikimedia.org/wiki/F" },
    });
  });

  it("returns null for an empty city", async () => {
    expect(await cityPhoto("")).toBeNull();
  });

  it("never shows a shot from a plane, one building, a map or a logo: no photo beats a wrong one", async () => {
    const wrong = {
      a: page("File:Erdenet from airplane window.jpg", 1),
      b: page("File:Erdenet town aerial view.jpg", 2, 1920, 1280, "Erdenet town and its area from the air onboard MIAT Boeing 787-9"),
      c: page("File:Erdenet Thermal Power Plant.jpg", 3),
      d: page("File:Map of Erdenet.jpg", 4),
      e: page("File:Erdenet logo.jpg", 5),
      f: page("File:Erdenet 04.jpg", 6, 1920, 1440, "City Erdenet in Mongolia", "Buildings in Erdenet"),
      g: page("File:Erdenet panorama.png", 7),
    };
    commons(wrong);
    expect(await cityPhoto("Erdenet", null, "Mongolia")).toBeNull();
    resetAmbientCache();
    commons({ ...wrong, h: page("File:Erdenet city in winter - panoramio.jpg", 40, 1920, 444, "Erdenet city in winter") });
    expect((await cityPhoto("Erdenet", null, "Mongolia"))?.url).toBe("https://thumb.wikimedia.org/t/40.jpg");
  });

  it("rejects 'from airplane window' style files and scores panoramas of the city highest", () => {
    const c = (title: string, text = "", w = 1920, h = 1080) => ({ title, text, cats: "", w, h });
    expect(photoScore(c("File:Erdenet from airplane window.jpg"), "Erdenet", null)).toBeNull();
    expect(photoScore(c("File:Erdenet from the plane.jpg"), "Erdenet", null)).toBeNull();
    expect(photoScore(c("File:Erdenet 2023.jpg", "View through the window during the flight to Frankfurt"), "Erdenet", null)).toBeNull();
    expect(photoScore(c("File:Erdenet, Mongolia - panoramio.jpg"), "Erdenet", null)).toBeNull();
    const pano = photoScore(c("File:Erdenet in summer - panoramio.jpg", "", 1920, 553), "Erdenet", null)!;
    const plain = photoScore(c("File:Erdenet 01.jpg", "Mongolian city Erdenet", 1920, 987), "Erdenet", null)!;
    expect(pano).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(0);
  });

  it("adds the country to every search, and only when they find nothing searches the name alone", async () => {
    const calls = commons({});
    await cityPhoto("Darkhan", ["winter"], "Mongolia");
    expect(searches(calls).sort()).toEqual([
      "Darkhan Mongolia filetype:bitmap",
      "Darkhan Mongolia panorama filetype:bitmap",
      "Darkhan Mongolia skyline filetype:bitmap",
      "Darkhan Mongolia winter filetype:bitmap",
      "Darkhan filetype:bitmap",
    ]);
  });

  it("the name-alone search can still find the city (the whole-word name check applies)", async () => {
    const calls = mockFetch([[
      "commons.wikimedia.org/w/api.php",
      (url: string) => ({ query: { pages: new URL(url).searchParams.get("gsrsearch") === "Zuunmod filetype:bitmap" ? { a: page("File:Zuunmodon view.jpg", 1), b: page("File:Zuunmod city view.jpg", 2) } : {} } }),
    ]]);
    expect((await cityPhoto("Zuunmod", null, "Mongolia"))?.url).toBe("https://thumb.wikimedia.org/t/2.jpg");
    expect(calls).toHaveLength(4);
    resetAmbientCache();
    const found = commons({ a: page("File:Zuunmod city view.jpg", 1) });
    await cityPhoto("Zuunmod", null, "Mongolia");
    expect(found).toHaveLength(3);
  });

  it("prefers the night or winter view the sky shows, and the plain view otherwise", async () => {
    commons({
      a: page("File:Erdenet in summer - panoramio.jpg", 1, 1920, 553),
      b: page("File:Erdenet Winter Palace.jpg", 2),
      c: page("File:Erdenet city in winter 2020.jpg", 3),
    });
    expect((await cityPhoto("Erdenet", ["winter"], "Mongolia"))?.url).toBe("https://thumb.wikimedia.org/t/3.jpg");
    expect((await cityPhoto("Erdenet", [], "Mongolia"))?.url).toBe("https://thumb.wikimedia.org/t/1.jpg");
  });

  it("keeps a miss or a failure an hour, so a refresh does not search again", async () => {
    const t0 = Date.now();
    let calls = mockFetch([]);
    expect(await cityPhoto("Erdenet", null, "Mongolia")).toBeNull();
    expect(calls).toHaveLength(4);
    calls = commons({});
    vi.spyOn(Date, "now").mockReturnValue(t0 + 30 * 60_000);
    expect(await cityPhoto("Erdenet", null, "Mongolia")).toBeNull();
    expect(calls).toHaveLength(0);
    vi.spyOn(Date, "now").mockReturnValue(t0 + 61 * 60_000);
    expect(await cityPhoto("Erdenet", null, "Mongolia")).toBeNull();
    expect(calls).toHaveLength(4);
    // Nothing found is kept an hour too.
    vi.spyOn(Date, "now").mockReturnValue(t0 + 90 * 60_000);
    expect(await cityPhoto("Erdenet", null, "Mongolia")).toBeNull();
    expect(calls).toHaveLength(4);
  });

  it("asks for night after dark, winter in snow or deep cold, both, or neither", () => {
    const sky = (kind: "clear" | "snow", isDay: boolean, known?: boolean) => ({ kind, intensity: 0, isDay, windKph: null, cloudCover: null, ...(known === false ? { known } : {}) });
    expect(photoVariants(sky("clear", false), 10)).toEqual(["night"]);
    expect(photoVariants(sky("snow", true), 0)).toEqual(["winter"]);
    expect(photoVariants(sky("clear", true), -12)).toEqual(["winter"]);
    expect(photoVariants(sky("snow", false), -12)).toEqual(["night", "winter"]);
    expect(photoVariants(sky("clear", true), 4)).toEqual([]);
    expect(photoVariants(sky("clear", false, false), -12)).toBeNull();
    expect(photoVariants(null, -12)).toBeNull();
  });
});

describe("weather-aware city photo in the snapshot", () => {
  const page = (title: string, n: number) => ({
    title, index: 1,
    imageinfo: [{ thumburl: `https://thumb.wikimedia.org/t/${n}.jpg`, thumbwidth: 1920, thumbheight: 1080, descriptionurl: "https://commons.wikimedia.org/wiki/F",
      extmetadata: { Artist: { value: "Ann" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }],
  });
  const commons = (u: string) => {
    const q = new URL(u).searchParams.get("gsrsearch") ?? "";
    return { query: { pages: { a: /winter|snow/.test(q) ? page("File:Darkhan city in winter.jpg", 2) : page("File:Darkhan skyline.jpg", 1) } } };
  };
  const darkhan = () => locate(new URLSearchParams("city=Darkhan"), new Headers());
  const routes = (weather: unknown) => mockFetch([
    ["geocoding-api.open-meteo.com", { results: [{ name: "Darkhan", country: "Mongolia", latitude: 49.4867, longitude: 105.9228 }] }],
    ["api.open-meteo.com/v1/forecast", weather],
    ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
    ["commons.wikimedia.org/w/api.php", (u: string) => commons(u)],
  ]);

  it("shows the winter photo when it is -12 C, and the skyline when the variant has none", async () => {
    routes(OPEN_METEO);
    expect((await getAmbient(await darkhan(), "en", NOW)).photo?.url).toBe("https://thumb.wikimedia.org/t/2.jpg");
  });
  it("falls back to the plain skyline when no variant photo exists", async () => {
    const calls = mockFetch([
      ["geocoding-api.open-meteo.com", { results: [{ name: "Darkhan", country: "Mongolia", latitude: 49.4867, longitude: 105.9228 }] }],
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
      ["commons.wikimedia.org/w/api.php", { query: { pages: { a: page("File:Darkhan skyline.jpg", 1) } } }],
    ]);
    expect((await getAmbient(await darkhan(), "en", NOW)).photo?.url).toBe("https://thumb.wikimedia.org/t/1.jpg");
    expect(calls.some((c) => c.url.includes("winter"))).toBe(true);
  });
  it("asks for no variant on a mild day", async () => {
    const calls = routes({ ...OPEN_METEO, current: { ...OPEN_METEO.current, temperature_2m: 12, weather_code: 1 } });
    expect((await getAmbient(await darkhan(), "en", NOW)).photo?.url).toBe("https://thumb.wikimedia.org/t/1.jpg");
    expect(calls.some((c) => /winter|night/.test(c.url))).toBe(false);
  });
  it("names a device position without a locality by reverse geocoding (English, city zoom, the ~1 km cell)", async () => {
    const calls = mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
      ["nominatim.openstreetmap.org/reverse", { address: { city: "Darkhan", country: "Mongolia" } }],
      ["commons.wikimedia.org/w/api.php", (u: string) => commons(u)],
    ]);
    const a = await getAmbient(await locate(new URLSearchParams("lat=49.4867&lng=105.9228"), new Headers()), "mn", NOW);
    expect(a.photo?.url).toBe("https://thumb.wikimedia.org/t/2.jpg");
    const rev = calls.filter((c) => c.url.includes("nominatim") && c.url.includes("zoom=10")).map((c) => new URL(c.url).searchParams);
    expect(rev).toHaveLength(1);
    expect([rev[0].get("lat"), rev[0].get("lon"), rev[0].get("accept-language")]).toEqual(["49.49", "105.92", "en"]);
    const q = calls.filter((c) => c.url.includes("commons")).map((c) => new URL(c.url).searchParams.get("gsrsearch"));
    expect(q.every((s) => s?.startsWith("Darkhan Mongolia"))).toBe(true);
  });
});

describe("air detail in the snapshot", () => {
  it("adds each pollutant, the dominant one and the next days' worst AQI", async () => {
    const hours = (day: string, v: number[]) => v.map((_, i) => `${day}T${String(i).padStart(2, "0")}:00`);
    mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", {
        current: { us_aqi: 118, pm2_5: 21.84, pm10: 23.3, ozone: 81, nitrogen_dioxide: 12.3, sulphur_dioxide: 23.9, carbon_monoxide: 856, us_aqi_pm2_5: 118, us_aqi_pm10: 40, us_aqi_ozone: 25 },
        hourly: { time: [...hours("2026-11-21", [1, 2]), ...hours("2026-11-22", [1, 2])], us_aqi: [90, 160, 40, 55] },
      }],
    ]);
    const a = await getAmbient({ coords: { lat: 47.92, lng: 106.92 }, locatedBy: "device", city: null, country: null, timeZone: null }, "en", NOW);
    expect(a.air).toMatchObject({
      aqi: 118, category: "sensitive", pm25: 21.8, source: "open-meteo",
      pollutants: { pm25: 21.8, pm10: 23.3, o3: 81, no2: 12.3, so2: 23.9, co: 856 },
      dominant: "pm25",
      forecast: [{ date: "2026-11-21", maxAqi: 160, category: "unhealthy" }, { date: "2026-11-22", maxAqi: 55, category: "moderate" }],
    });
  });
});
