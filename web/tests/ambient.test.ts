import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/ambient/route";
import { getAmbient, googleSky, locate, placeName, resetAmbientCache, skyText, trafficLevel, wmoSky } from "@/lib/ambient";
import { drivingTraffic, resetMapsUsage } from "@/lib/maps";

const user = vi.hoisted(() => ({ current: { id: "user_2abc", email: null } as { id: string; email: null } | null }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => user.current,
}));

const NOW = new Date("2026-11-21T10:00:00Z");

beforeEach(() => {
  user.current = { id: "user_2abc", email: null };
  resetAmbientCache();
  resetMapsUsage();
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

describe("condition mapping", () => {
  it("maps Google weather types to sky kinds and intensity", () => {
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

  it("reads compound Google types by what happens now", () => {
    expect(googleSky("RAIN_LATER_BECOMING_CLEAR").kind).toBe("rain");
    expect(googleSky("CLEAR_BUT_LATER_TURNING_CLOUDY").kind).toBe("clear");
    expect(googleSky("SNOW_ACCOMPANIED_BY_LIGHTNING").kind).toBe("storm");
    expect(googleSky("RAINSNOW_MIX_RAIN_AS_MAIN").kind).toBe("sleet");
    expect(googleSky("CLOUDY_WITH_BRIEF_SNOW")).toEqual({ kind: "snow", intensity: 0.35 });
    expect(googleSky("WINDY", 10).kind).toBe("clear");
    expect(googleSky(null, 85).kind).toBe("cloudy");
  });

  it("maps Open-Meteo WMO codes", () => {
    expect(wmoSky(0).kind).toBe("clear");
    expect(wmoSky(45).kind).toBe("fog");
    expect(wmoSky(53).kind).toBe("drizzle");
    expect(wmoSky(65)).toEqual({ kind: "rain", intensity: 0.9 });
    expect(wmoSky(71)).toEqual({ kind: "snow", intensity: 0.35 });
    expect(wmoSky(67).kind).toBe("sleet");
    expect(wmoSky(95).kind).toBe("storm");
    expect(wmoSky(99).kind).toBe("hail");
  });

  it("has condition words in every language and no emojis", () => {
    for (const lang of ["mn", "zh", "en", "ru", "de"] as const) {
      const text = skyText({ kind: "snow", intensity: 0.3 }, lang);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(skyText({ kind: "snow", intensity: 0.3 }, "en")).toBe("Light snow");
  });
});

describe("traffic levels", () => {
  it("light below 1.15, moderate below 1.4, heavy above", () => {
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

  it("valid query coordinates win and are rounded to 2 decimals", () => {
    const loc = locate(new URLSearchParams("lat=49.03456&lng=104.08321"), vercel);
    expect(loc).toEqual({ coords: { lat: 49.03, lng: 104.08 }, locatedBy: "device", city: "Эрдэнэт", country: "MN", timeZone: "Asia/Ulaanbaatar" });
  });

  it("does not borrow the network city for a far away device position", () => {
    const loc = locate(new URLSearchParams("lat=52.52&lng=13.405"), vercel);
    expect(loc.locatedBy).toBe("device");
    expect(loc.city).toBeNull();
    expect(loc.timeZone).toBeNull();
  });

  it("falls back to the network headers when the query is missing or invalid", () => {
    for (const q of ["", "lat=91&lng=10", "lat=abc&lng=1", "lat=10"]) {
      const loc = locate(new URLSearchParams(q), vercel);
      expect(loc).toEqual({ coords: { lat: 49.03, lng: 104.04 }, locatedBy: "network", city: "Эрдэнэт", country: "MN", timeZone: "Asia/Ulaanbaatar" });
    }
  });

  it("gives nothing without query or headers, and a clear sky with no data", async () => {
    const calls = mockFetch([]);
    const loc = locate(new URLSearchParams(), new Headers());
    expect(loc).toEqual({ coords: null, locatedBy: null, city: null, country: null, timeZone: null });
    const a = await getAmbient(loc, "en", NOW);
    expect(a).toMatchObject({ place: null, coords: null, locatedBy: null, weather: null, air: null, traffic: null, stops: [], localHour: null });
    expect(a.sky.kind).toBe("clear");
    expect(typeof a.sky.isDay).toBe("boolean");
    expect(calls).toHaveLength(0);
  });

  it("ignores a bad time zone header", () => {
    const loc = locate(new URLSearchParams(), new Headers({ "x-vercel-ip-timezone": "Not/A Zone<script>" }));
    expect(loc.timeZone).toBeNull();
  });
});

describe("snapshot without a Google key", () => {
  it("uses Open-Meteo for weather and air; no traffic; Erdenet sample timetable stops", async () => {
    const calls = mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
    ]);
    const a = await getAmbient(locate(new URLSearchParams("lat=49.03&lng=104.08"), new Headers()), "ru", NOW);
    expect(a.source).toEqual({ weather: "open-meteo", air: "open-meteo" });
    expect(a.sky).toEqual({ kind: "snow", intensity: 0.35, isDay: true, windKph: 14, cloudCover: 90, windDirDeg: 300 });
    expect(a.weather).toMatchObject({ tempC: -12, feelsC: -18, text: "Небольшой снег", humidity: 70 });
    expect(a.weather?.days[0]).toMatchObject({ date: "2026-11-21", minC: -20, maxC: -8, kind: "snow", precipChance: 60 });
    expect(a.air).toEqual({ aqi: 112, category: "sensitive", pm25: 40.2, pm10: 80, dominant: null, scale: "US_AQI" });
    expect(a.traffic).toBeNull();
    // The demo city keeps its sample bus times even without a Maps key.
    expect(a.stops.length).toBeGreaterThan(0);
    expect(a.stops[0]).toMatchObject({ distanceM: 0, walkMin: 1 });
    expect(a.stops[0].lines?.length).toBeGreaterThan(0);
    expect(a.timeZone).toBe("Asia/Ulaanbaatar");
    expect(a.localHour).toBe(18);
    expect(calls.every((c) => !c.url.includes("googleapis"))).toBe(true);
  });

  it("serves the second request for the same rounded position from the cache", async () => {
    const calls = mockFetch([
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["air-quality-api.open-meteo.com", OPEN_METEO_AIR],
    ]);
    const first = await getAmbient(locate(new URLSearchParams("lat=49.031&lng=104.081"), new Headers()), "en", NOW);
    const n = calls.length;
    const second = await getAmbient(locate(new URLSearchParams("lat=49.029&lng=104.079"), new Headers()), "en", NOW);
    expect(calls.length).toBe(n);
    expect(second.weather).toEqual(first.weather);
    expect(second.updatedAt).toBe(first.updatedAt);
  });

  it("still answers when every source fails", async () => {
    mockFetch([]);
    const a = await getAmbient(locate(new URLSearchParams("lat=10&lng=20"), new Headers()), "en", NOW);
    expect(a).toMatchObject({ coords: { lat: 10, lng: 20 }, weather: null, air: null, traffic: null, stops: [], source: { weather: null, air: null } });
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

  function google(routes: { duration: string; staticDuration: string }) {
    return mockFetch([
      ["currentConditions:lookup?location", current],
      ["forecast/days:lookup", forecast],
      ["airquality.googleapis.com", air],
      ["places:searchText", centre],
      ["places:searchNearby", stops],
      ["computeRoutes", { routes: [routes] }],
    ]);
  }

  it("maps weather, air, traffic to the centre and nearby stops", async () => {
    const calls = google({ duration: "1500s", staticDuration: "1000s" });
    const a = await getAmbient(locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "de", NOW);
    expect(a.place).toBe("Berlin");
    expect(a.source).toEqual({ weather: "google", air: "google" });
    expect(a.sky).toEqual({ kind: "rain", intensity: 0.9, isDay: false, windKph: 22, cloudCover: 100, windDirDeg: 250 });
    expect(a.weather).toMatchObject({ tempC: 6.5, feelsC: 3, text: "Starker Regen", humidity: 92 });
    expect(a.weather?.days).toEqual([{ date: "2026-11-21", minC: 2, maxC: 8, text: "Regen", kind: "rain", precipChance: 80 }]);
    // No US index from Google here: the number comes from PM2.5, so PM2.5 is the main pollutant.
    expect(a.air).toEqual({ aqi: 44, category: "good", pm25: 8, pm10: null, dominant: "pm25", scale: "US_AQI" });
    expect(a.traffic).toEqual({ level: "heavy", delayMin: 8, ratio: 1.5, towards: "ins Stadtzentrum", dest: { lat: 52.52, lng: 13.405 } });
    expect(a.timeZone).toBe("Europe/Berlin");
    expect(a.localHour).toBe(11);
    expect(a.stops.map((s) => s.name)).toEqual(["Rosenthaler Platz", "Alexanderplatz"]);
    expect(a.stops[0].mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=52.5297,13.4015&query_place_id=def");
    expect(a.stops[1]).toMatchObject({ mapsUrl: "https://maps.google.com/?cid=1" });
    for (const s of a.stops) expect(s.walkMin).toBe(Math.max(1, Math.ceil(s.distanceM / 80)));

    // The key travels only in the header, never in a URL.
    const googleCalls = calls.filter((c) => c.url.includes("googleapis.com"));
    expect(googleCalls.length).toBeGreaterThan(0);
    for (const c of googleCalls) {
      expect(c.url).not.toContain("test-key");
      expect((c.init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-key");
    }
    const route = calls.find((c) => c.url.includes("computeRoutes"))!;
    expect(JSON.parse(String(route.init.body))).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" });
    expect((route.init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("routes.duration,routes.staticDuration");
    const nearby = JSON.parse(String(calls.find((c) => c.url.includes("searchNearby"))!.init.body));
    expect(nearby).toMatchObject({ includedTypes: ["bus_stop", "bus_station", "transit_station"], rankPreference: "DISTANCE", maxResultCount: 5 });
    expect(nearby.locationRestriction.circle.radius).toBe(1000);
  });

  it("probes nearby roads when already in the centre", async () => {
    google({ duration: "600s", staticDuration: "580s" });
    const a = await getAmbient(locate(new URLSearchParams("lat=52.52&lng=13.41"), new Headers()), "en", NOW);
    expect(a.traffic).toMatchObject({ level: "light", delayMin: 0, ratio: 1.03, towards: "on nearby roads" });
    expect(a.traffic?.dest?.lat).toBe(52.52);
  });

  it("falls back to Open-Meteo when Google weather fails", async () => {
    mockFetch([
      ["weather.googleapis.com", () => Response.json({ error: { status: "PERMISSION_DENIED" } }, { status: 403 })],
      ["api.open-meteo.com/v1/forecast", OPEN_METEO],
      ["airquality.googleapis.com", air],
    ]);
    const a = await getAmbient(locate(new URLSearchParams("lat=1&lng=2"), new Headers()), "en", NOW);
    expect(a.source).toEqual({ weather: "open-meteo", air: "google" });
    expect(a.sky.kind).toBe("snow");
    expect(a.traffic).toBeNull();
    expect(a.stops).toEqual([]);
  });

  it("attaches sample timetable arrivals to matching stops in Erdenet", async () => {
    mockFetch([
      ["currentConditions:lookup?location", { ...current, timeZone: { id: "Asia/Ulaanbaatar" } }],
      ["forecast/days:lookup", forecast],
      ["airquality.googleapis.com", air],
      ["places:searchText", { places: [{ location: { latitude: 49.03, longitude: 104.08 }, addressComponents: [{ longText: "Erdenet", types: ["locality"] }] }] }],
      ["places:searchNearby", { places: [{ id: "m1", displayName: { text: "Central Market" }, location: { latitude: 49.031, longitude: 104.081 } }] }],
      ["computeRoutes", { routes: [{ duration: "300s", staticDuration: "300s" }] }],
    ]);
    const a = await getAmbient(locate(new URLSearchParams("lat=49.03&lng=104.08"), new Headers()), "en", new Date("2026-11-21T02:00:00Z"));
    expect(a.place).toBe("Erdenet");
    expect(a.stops[0].lines?.length).toBeGreaterThan(0);
    expect(a.stops[0].lines?.[0]).toEqual({ route: expect.any(String), minutes: expect.any(Number) });
  });

  it("asks Google in English for Mongolian and uses our own Mongolian words", async () => {
    const calls = google({ duration: "600s", staticDuration: "600s" });
    const a = await getAmbient(locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "mn", NOW);
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
    const a = await getAmbient(locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "en", NOW);
    expect(a.place).toBeNull();
    expect(a.traffic).toMatchObject({ level: "moderate", ratio: 1.25, towards: "on nearby roads" });
  });

  it("keeps stops and the centre for a day, and refreshes the weather after 10 minutes", async () => {
    const calls = google({ duration: "600s", staticDuration: "600s" });
    const t0 = Date.now();
    await getAmbient(locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "en", NOW);
    const count = (part: string) => calls.filter((c) => c.url.includes(part)).length;
    expect([count("searchNearby"), count("searchText"), count("currentConditions:lookup?location")]).toEqual([1, 1, 1]);
    vi.spyOn(Date, "now").mockReturnValue(t0 + 11 * 60 * 1000);
    await getAmbient(locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "en", NOW);
    expect([count("searchNearby"), count("searchText"), count("currentConditions:lookup?location")]).toEqual([1, 1, 2]);
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
    const loc = locate(new URLSearchParams("lat=10&lng=20"), new Headers());
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
  it("adds the country in the person's language", () => {
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
    const a = await getAmbient(locate(new URLSearchParams(), headers), "en", NOW);
    // An IP-derived position never goes back to the browser.
    expect(a).toMatchObject({ place: "Tokyo, Japan", locatedBy: "network", coords: null });
  });
});

describe("GET /api/ambient", () => {
  let ip = 0;
  const req = (q = "", headers: Record<string, string> = {}) =>
    new Request(`http://localhost/api/ambient${q}`, { headers: { "x-real-ip": `10.9.0.${++ip}`, ...headers } });

  it("401 when signed out, without touching the network", async () => {
    user.current = null;
    const calls = mockFetch([]);
    const res = await GET(req("?lat=49.03&lng=104.08"));
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

  it("429 when rate limited", async () => {
    mockFetch([]);
    const headers = { "x-real-ip": "10.99.99.99" };
    let last: Response | null = null;
    for (let i = 0; i < 31; i++) last = await GET(new Request("http://localhost/api/ambient", { headers }));
    expect(last!.status).toBe(429);
  });
});
