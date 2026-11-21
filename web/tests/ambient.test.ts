import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/ambient/route";
import { cityParam, getAmbient, googleSky, locate, placeName, resetAmbientCache, skyText, trafficLevel, wikiPhoto, wmoSky, cityPhoto } from "@/lib/ambient";
import { drivingTraffic, haversineKm, resetMapsUsage } from "@/lib/maps";

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
      expect(loc).toEqual({ coords: { lat: 49.0278, lng: 104.0444 }, locatedBy: "city", city: "Erdenet", country: null, timeZone: null });
    }
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ textQuery: "Erdenet" });
    expect(calls[0].url).not.toContain("test-key");
  });

  it("geocodes a typed city with Open-Meteo when there is no Maps key", async () => {
    const calls = mockFetch([["geocoding-api.open-meteo.com", { results: [{ name: "Darkhan", country: "Mongolia", latitude: 49.4867, longitude: 105.9228 }] }]]);
    expect(await locate(new URLSearchParams("city=Darkhan"), vercel)).toMatchObject({ locatedBy: "city", city: "Darkhan", coords: { lat: 49.4867, lng: 105.9228 } });
    expect(calls[0].url).toContain("name=Darkhan");
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
    expect(a.air).toEqual({ aqi: 112, category: "sensitive" });
    expect(a.traffic).toBeNull();
    // Erdenet's own feed works without a Maps key: real stop positions, live estimates.
    expect(a.coords).toEqual({ lat: 49.0301, lng: 104.0801 });
    expect(a.stops.map((s) => s.name)).toEqual(["Төв", "Зах", "Уурхай"]);
    expect(a.stops[0]).toMatchObject({ lat: 49.03, lng: 104.08, lines: [{ route: "Ч:1-Ч:2", minutes: 3 }] });
    expect(a.stops[0].distanceM).toBeLessThan(20);
    expect(a.stops[1].lines).toEqual([{ route: "Ч:1-Ч:2", minutes: 6 }]);
    expect(a.stops[2].lines).toBeUndefined();
    expect(a.nextBus).toEqual({ line: "Ч:1-Ч:2", departsInMin: 3, source: "erdenet-live", at: NOW.toISOString() });
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
    ]);
    const first = await getAmbient(await locate(new URLSearchParams("lat=47.9211&lng=106.9211"), new Headers()), "en", NOW);
    const n = calls.length;
    const second = await getAmbient(await locate(new URLSearchParams("lat=47.9189&lng=106.9189"), new Headers()), "en", NOW);
    expect(calls.length).toBe(n);
    expect(second.weather).toEqual(first.weather);
    expect(second.coords).toEqual({ lat: 47.9189, lng: 106.9189 });
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
    expect(a.air).toEqual({ aqi: 44, category: "good" });
    expect(a.traffic).toEqual({ level: "heavy", delayMin: 8 });
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
    expect(a.nextBus).toEqual({ line: "M10", departsInMin: 7, source: "google", at: NOW.toISOString() });
    // The landscape photo, with its author credit; the photo URL never carries our key.
    expect(a.photo).toEqual({ url: PHOTO_URI, attribution: { name: "A. Bat", uri: "https://maps.google.com/maps/contrib/1" } });
    const photoSearch = calls.find((c) => c.url.includes("searchText") && mask(c.init).includes("photos"))!;
    expect(body(photoSearch.init)).toMatchObject({ textQuery: "Berlin landmark" });
    expect(calls.some((c) => c.url.endsWith("/v1/places/p1/photos/wide/media?maxWidthPx=1600&skipHttpRedirect=true"))).toBe(true);

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
    expect(a.traffic).toEqual({ level: "light", delayMin: 0 });
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
    expect(a.traffic).toEqual({ level: "moderate", delayMin: 2 });
  });

  it("keeps stops, taxis, the centre and the photo for a day, and refreshes the weather after 10 minutes", async () => {
    const calls = google({ duration: "600s", staticDuration: "600s" });
    const t0 = Date.now();
    await getAmbient(await locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "en", NOW);
    const count = (part: string) => calls.filter((c) => c.url.includes(part)).length;
    expect([count("searchNearby"), count("searchText"), count("/media?"), count("currentConditions:lookup?location")]).toEqual([2, 3, 1, 1]);
    vi.spyOn(Date, "now").mockReturnValue(t0 + 11 * 60 * 1000);
    await getAmbient(await locate(new URLSearchParams("lat=52.55&lng=13.40"), new Headers()), "en", NOW);
    expect([count("searchNearby"), count("searchText"), count("/media?"), count("currentConditions:lookup?location")]).toEqual([2, 3, 1, 2]);
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

describe("wikiPhoto (free fallback)", () => {
  const img = (w: number, h: number, ext = "jpg", path = "commons") => ({ source: `https://upload.wikimedia.org/wikipedia/${path}/thumb/a/ab/${w}.${ext}/${w}px-${w}.${ext}`, width: w, height: h });
  const commons = (artist: string, licence: string) => ({
    query: { pages: { "-1": { imageinfo: [{ descriptionurl: "https://commons.wikimedia.org/wiki/File:View.jpg", extmetadata: { Artist: { value: artist }, LicenseShortName: { value: licence } } }] } } },
  });

  it("picks a 1600 px landscape Commons JPEG thumbnail and credits its author and licence", async () => {
    const calls = mockFetch([
      ["en.wikipedia.org/w/api.php", { query: { pages: {
        a: { pageimage: "Tall.jpg", thumbnail: img(1200, 2000) },
        b: { pageimage: "Small.jpg", thumbnail: img(800, 500) },
        c: { pageimage: "View.jpg", thumbnail: img(1600, 1067) },
        d: { pageimage: "Map.png", thumbnail: img(1600, 900, "png") },
        e: { pageimage: "Local.jpg", thumbnail: img(1600, 1000, "jpg", "en") },
        f: { pageimage: "Pano.jpg", thumbnail: img(1600, 400) },
      } } }],
      ["commons.wikimedia.org/w/api.php", commons('<a href="//commons.wikimedia.org/wiki/User:Bat">B. Bat</a>', "CC BY-SA 4.0")],
    ]);
    expect(await wikiPhoto({ lat: 49.03, lng: 104.08 })).toEqual({
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/1600.jpg/1600px-1600.jpg",
      attribution: { name: "B. Bat / CC BY-SA 4.0 (Wikimedia Commons)", uri: "https://commons.wikimedia.org/wiki/File:View.jpg" },
    });
    expect(calls[0].url).toContain("pithumbsize=1600");
    expect(calls[0].url).not.toContain("original");
    expect(calls[1].url).toContain("titles=File%3AView.jpg");
  });

  it("gives no photo when its author or licence is unknown, and throws (not null) when a request fails", async () => {
    mockFetch([
      ["en.wikipedia.org/w/api.php", { query: { pages: { c: { pageimage: "View.jpg", thumbnail: img(1600, 1067) } } } }],
      ["commons.wikimedia.org/w/api.php", commons("", "CC BY 4.0")],
    ]);
    expect(await wikiPhoto({ lat: 49.03, lng: 104.08 })).toBeNull();
    mockFetch([]);
    await expect(wikiPhoto({ lat: 49.03, lng: 104.08 })).rejects.toThrow();
  });

  it("returns null when nothing suitable is nearby", async () => {
    mockFetch([["en.wikipedia.org/w/api.php", { query: { pages: {} } }]]);
    expect(await wikiPhoto({ lat: 0, lng: 0 })).toBeNull();
  });
});

describe("cityPhoto (whole-city Commons photo)", () => {
  const page = (title: string, index: number, w = 1920, h = 1080) => ({
    title, index,
    imageinfo: [{ thumburl: `https://thumb.wikimedia.org/t/${index}.jpg`, thumbwidth: w, thumbheight: h, descriptionurl: "https://commons.wikimedia.org/wiki/F",
      extmetadata: { Artist: { value: "<a>Ann</a>" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }],
  });
  it("takes the first wide photo whose title names the city as a whole word", async () => {
    mockFetch([["commons.wikimedia.org/w/api.php", { query: { pages: {
      a: page("File:Muruntau mine.jpg", 1),
      b: page("File:Murun portrait.jpg", 2, 1000, 1500),
      c: page("File:Murun city view 2019.jpg", 3),
    } } }]]);
    expect(await cityPhoto("Murun, Mongolia")).toEqual({
      url: "https://thumb.wikimedia.org/t/3.jpg",
      attribution: { name: "Ann / CC BY-SA 4.0 (Wikimedia Commons)", uri: "https://commons.wikimedia.org/wiki/F" },
    });
  });
  it("returns null for an empty city", async () => {
    expect(await cityPhoto("")).toBeNull();
  });
});
