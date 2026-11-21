import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  airQualityAt,
  computeRoute,
  currentWeather,
  googleHourly,
  haversineKm,
  openMeteoHourly,
  resetMapsUsage,
  searchPlaces,
  transitOptions,
} from "@/lib/maps";

beforeEach(() => {
  resetMapsUsage();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
  vi.stubEnv("MAPS_DAILY_LIMIT", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type Call = { url: string; init: RequestInit };
function mockFetch(body: unknown, status = 200) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json(body, { status });
    }),
  );
  return calls;
}
const headers = (c: Call) => c.init.headers as Record<string, string>;

const walk = (m: number, s: number) => ({ travelMode: "WALK", distanceMeters: m, staticDuration: `${s}s`, navigationInstruction: { instructions: "Head north" } });
const bus = (line: string, from: string, to: string, dep: string, arr: string, stops: number) => ({
  travelMode: "TRANSIT",
  distanceMeters: 3000,
  staticDuration: "900s",
  navigationInstruction: { instructions: `Bus towards ${to}` },
  transitDetails: {
    stopDetails: { departureStop: { name: from }, arrivalStop: { name: to }, departureTime: dep, arrivalTime: arr },
    localizedValues: {
      departureTime: { time: { text: "10:05" }, timeZone: "Asia/Ulaanbaatar" },
      arrivalTime: { time: { text: "10:20" }, timeZone: "Asia/Ulaanbaatar" },
    },
    headsign: to,
    stopCount: stops,
    transitLine: { name: `Line ${line}`, nameShort: line, vehicle: { type: "BUS", name: { text: "Bus" } } },
  },
});

describe("computeRoute", () => {
  it("maps transit steps, merges walks, and builds the maps link", async () => {
    const calls = mockFetch({
      routes: [
        {
          duration: "1500s",
          distanceMeters: 4250,
          legs: [{ steps: [walk(100, 60), walk(150, 120), bus("5", "Railway", "Hospital", "2026-11-20T02:05:00Z", "2026-11-20T02:20:00Z", 6), walk(80, 60)] }],
        },
      ],
    });
    const r = await computeRoute({ origin: "49.03,104.08", destination: "Эрдэнэт, Нэгдсэн эмнэлэг", mode: "transit", lang: "mn" });
    expect(r).toMatchObject({ durationMin: 25, distanceKm: 4.3, departure: "10:05", arrival: "10:20" });
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0]).toMatchObject({ kind: "walk" });
    expect(r.steps[0].text).toContain("250 m");
    expect(r.steps[1]).toMatchObject({ kind: "transit", line: "5", from: "Railway", to: "Hospital", departs: "10:05", arrives: "10:20", stops: 6 });
    expect(r.mapsUrl).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=49.03%2C104.08&destination=%D0%AD%D1%80%D0%B4%D1%8D%D0%BD%D1%8D%D1%82%2C%20%D0%9D%D1%8D%D0%B3%D0%B4%D1%81%D1%8D%D0%BD%20%D1%8D%D0%BC%D0%BD%D1%8D%D0%BB%D1%8D%D0%B3&travelmode=transit",
    );

    const req = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(req.origin).toEqual({ location: { latLng: { latitude: 49.03, longitude: 104.08 } } });
    expect(req.destination).toEqual({ address: "Эрдэнэт, Нэгдсэн эмнэлэг" });
    expect(req).toMatchObject({ travelMode: "TRANSIT", languageCode: "mn" });
    expect(headers(calls[0])["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers(calls[0])["X-Goog-FieldMask"]).toContain("routes.legs.steps.transitDetails.stopDetails");
    expect(calls[0].url).not.toContain("test-key");
  });

  it("keeps at most 8 steps and uses walking/driving travel modes", async () => {
    const steps = Array.from({ length: 12 }, () => ({ travelMode: "DRIVE", distanceMeters: 500, staticDuration: "60s", navigationInstruction: { instructions: "Turn left" } }));
    const calls = mockFetch({ routes: [{ duration: "720s", distanceMeters: 6000, legs: [{ steps }] }] });
    const r = await computeRoute({ origin: "A", destination: "B", mode: "drive", lang: "zh" });
    expect(r.steps).toHaveLength(8);
    expect(r.steps[0]).toEqual({ kind: "drive", text: "Turn left" });
    expect(r.mapsUrl).toContain("travelmode=driving");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ travelMode: "DRIVE", languageCode: "zh-CN" });
  });

  it("no route -> clean error", async () => {
    mockFetch({});
    await expect(computeRoute({ origin: "A", destination: "B", mode: "walk", lang: "en" })).rejects.toThrow("No route found");
  });

  it("HTTP errors become clean messages without the key", async () => {
    mockFetch({ error: { status: "PERMISSION_DENIED", message: "API key test-key not valid" } }, 403);
    const err = await computeRoute({ origin: "A", destination: "B", mode: "walk", lang: "en" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Google Maps error 403 (PERMISSION_DENIED)");
    expect((err as Error).message).not.toContain("test-key");
  });
});

describe("guards", () => {
  it("missing key -> friendly error, no request", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const calls = mockFetch({});
    await expect(searchPlaces({ query: "pharmacy", lang: "en" })).rejects.toThrow("Maps is not set up");
    expect(calls).toHaveLength(0);
  });

  it("daily cap stops calls", async () => {
    vi.stubEnv("MAPS_DAILY_LIMIT", "2");
    const calls = mockFetch({ places: [] });
    await searchPlaces({ query: "a", lang: "en" });
    await searchPlaces({ query: "b", lang: "en" });
    await expect(searchPlaces({ query: "c", lang: "en" })).rejects.toThrow("Maps daily limit reached");
    expect(calls).toHaveLength(2);
  });
});

describe("searchPlaces", () => {
  it("maps places with distance and biases to the person's location", async () => {
    const calls = mockFetch({
      places: [
        {
          displayName: { text: "Erdenet Pharmacy" },
          formattedAddress: "Main St 1, Erdenet",
          rating: 4.5,
          currentOpeningHours: { openNow: true },
          location: { latitude: 49.04, longitude: 104.08 },
          googleMapsUri: "https://maps.google.com/?cid=1",
        },
        { displayName: { text: "Other" }, formattedAddress: "Elsewhere", googleMapsUri: "https://maps.google.com/?cid=2" },
      ],
    });
    const out = await searchPlaces({ query: "pharmacy", near: { lat: 49.03, lng: 104.08 }, openNow: true, lang: "ru", max: 9 });
    expect(out[0]).toEqual({ name: "Erdenet Pharmacy", address: "Main St 1, Erdenet", rating: 4.5, openNow: true, distanceKm: 1.1, mapsUrl: "https://maps.google.com/?cid=1" });
    expect(out[1]).toEqual({ name: "Other", address: "Elsewhere", mapsUrl: "https://maps.google.com/?cid=2" });
    const req = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(req).toEqual({
      textQuery: "pharmacy",
      languageCode: "ru",
      pageSize: 5,
      openNow: true,
      locationBias: { circle: { center: { latitude: 49.03, longitude: 104.08 }, radius: 5000 } },
    });
    expect(headers(calls[0])["X-Goog-FieldMask"]).toBe(
      "places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.rating,places.currentOpeningHours.openNow",
    );
  });

  it("haversine", () => {
    expect(haversineKm({ lat: 49.03, lng: 104.08 }, { lat: 49.04, lng: 104.08 })).toBeCloseTo(1.11, 2);
  });
});

describe("transitOptions", () => {
  it("returns departures from transit routes", async () => {
    mockFetch({
      routes: [
        { duration: "1200s", distanceMeters: 4000, legs: [{ steps: [walk(100, 60), bus("5", "Railway", "Hospital", "2026-11-20T02:12:00Z", "2026-11-20T02:34:00Z", 6)] }] },
      ],
    });
    const out = await transitOptions({ from: "Railway Station, Erdenet", to: "Hospital, Erdenet", now: new Date("2026-11-20T02:00:00Z"), lang: "en" });
    expect(out).toEqual([
      { line: "5", lineName: "Line 5", vehicle: "BUS", headsign: "Hospital", stop: "Railway", departs: "10:12", arrives: "10:34", waitMinutes: 12, rideMinutes: 22, stops: 6 },
    ]);
  });

  it("walking-only or empty responses mean no transit", async () => {
    mockFetch({ routes: [{ duration: "600s", distanceMeters: 800, legs: [{ steps: [walk(800, 600)] }] }] });
    expect(await transitOptions({ from: "a", to: "b", now: new Date(), lang: "en" })).toEqual([]);
    mockFetch({});
    expect(await transitOptions({ from: "a", to: "b", now: new Date(), lang: "en" })).toEqual([]);
  });
});

describe("weather and air quality", () => {
  it("maps Google Weather current + daily to the tool shape", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("currentConditions")) {
          return Response.json({
            temperature: { degrees: -24.2, unit: "CELSIUS" },
            feelsLikeTemperature: { degrees: -31, unit: "CELSIUS" },
            weatherCondition: { description: { text: "Light snow" }, type: "LIGHT_SNOW" },
            wind: { speed: { value: 12, unit: "KILOMETERS_PER_HOUR" } },
            relativeHumidity: 70,
          });
        }
        return Response.json({
          forecastDays: [
            {
              displayDate: { year: 2026, month: 11, day: 20 },
              maxTemperature: { degrees: -15 },
              minTemperature: { degrees: -28 },
              daytimeForecast: { weatherCondition: { description: { text: "Cloudy" } }, precipitation: { probability: { percent: 10 } } },
            },
          ],
        });
      }),
    );
    const w = await currentWeather(49.0333, 104.0833);
    expect(w).toEqual({
      now: { temperatureC: -24.2, feelsLikeC: -31, conditions: "light snow", windKmh: 12, humidityPct: 70 },
      days: [{ date: "2026-11-20", minC: -28, maxC: -15, conditions: "cloudy", precipitationChancePct: 10 }],
    });
    expect(calls[0]).toContain("https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=49.0333&location.longitude=104.0833");
    expect(calls[1]).toContain("https://weather.googleapis.com/v1/forecast/days:lookup?");
    expect(calls[1]).toContain("days=3");
  });

  it("air quality uses the US EPA index when Google gives it, else PM2.5", async () => {
    const calls = mockFetch({
      indexes: [
        { code: "uaqi", aqi: 40, category: "Low air quality" },
        { code: "usa_epa", aqi: 168, category: "Unhealthy" },
      ],
      pollutants: [
        { code: "pm25", concentration: { value: 88.4, units: "MICROGRAMS_PER_CUBIC_METER" } },
        { code: "pm10", concentration: { value: 120, units: "MICROGRAMS_PER_CUBIC_METER" } },
      ],
    });
    expect(await airQualityAt(49.0333, 104.0833)).toEqual({ usAqi: 168, universalAqi: 40, pm2_5: 88.4, pm10: 120 });
    const req = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://airquality.googleapis.com/v1/currentConditions:lookup");
    expect(req).toMatchObject({ location: { latitude: 49.0333, longitude: 104.0833 }, universalAqi: true });

    mockFetch({ indexes: [{ code: "uaqi", aqi: 60 }], pollutants: [{ code: "pm25", concentration: { value: 35.4 } }] });
    expect((await airQualityAt(1, 2)).usAqi).toBe(100);
  });
});

describe("hourly forecast", () => {
  const NOW = Date.parse("2026-11-21T10:20:00Z");
  const hour = (h: number) => new Date(NOW - 20 * 60_000 + h * 3_600_000).toISOString();
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("Google forecast/hours: 12 upcoming hours, ISO UTC, bad rows dropped", async () => {
    const forecastHours = [
      { interval: { startTime: hour(-2) }, temperature: { degrees: -20 } }, // already over
      { interval: { startTime: "2026-11-21T18:00:00+08:00" }, weatherCondition: { type: "LIGHT_SNOW" }, temperature: { degrees: -18.5 }, precipitation: { probability: { percent: 40 } } },
      { interval: { startTime: "next tuesday" }, temperature: { degrees: 1 } },
      { interval: { startTime: hour(1) }, weatherCondition: { type: "bad type!" }, temperature: {}, precipitation: { probability: { percent: 10 } } },
      { interval: { startTime: hour(2) }, weatherCondition: { type: "CLEAR" }, temperature: { degrees: -17 }, precipitation: { probability: { percent: 140 } } },
      ...Array.from({ length: 14 }, (_, i) => ({ interval: { startTime: hour(i + 3) }, temperature: { degrees: -16 + i } })),
    ];
    const calls = mockFetch({ forecastHours });
    const hours = await googleHourly(49.03, 104.08, { background: true });
    expect(hours).toHaveLength(12);
    expect(hours[0]).toEqual({ time: "2026-11-21T10:00:00.000Z", tempC: -18.5, type: "LIGHT_SNOW", precipChance: 40 });
    expect(hours[1]).toEqual({ time: hour(2), tempC: -17, type: "CLEAR", precipChance: null });
    expect(hours[2]).toEqual({ time: hour(3), tempC: -16, type: null, precipChance: null });
    expect(calls[0].url).toContain("https://weather.googleapis.com/v1/forecast/hours:lookup?location.latitude=49.03&location.longitude=104.08");
    expect(calls[0].url).toContain("hours=12");
    expect(calls[0].url).not.toContain("test-key");
    expect(headers(calls[0])["X-Goog-Api-Key"]).toBe("test-key");
  });

  it("Open-Meteo hourly: unix times to ISO, WMO code and chance validated, no key sent", async () => {
    const t = (h: number) => Date.parse(hour(h)) / 1000;
    const calls = mockFetch({
      hourly: {
        time: [t(0), t(1), "x", t(2)],
        temperature_2m: [-21.3, null, 5, -19],
        weather_code: [71, 3, 0, 250],
        precipitation_probability: [55, 0, 0, -1],
      },
    });
    expect(await openMeteoHourly(49.03, 104.08)).toEqual([
      { time: "2026-11-21T10:00:00.000Z", tempC: -21.3, code: 71, precipChance: 55 },
      { time: hour(2), tempC: -19, code: null, precipChance: null },
    ]);
    expect(calls[0].url).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=49\.03&longitude=104\.08&hourly=/);
    expect(calls[0].url).toContain("timeformat=unixtime");
    expect(headers(calls[0])["X-Goog-Api-Key"]).toBeUndefined();
    expect(headers(calls[0])["User-Agent"]).toMatch(/^Aspire\//);
  });

  it("works without a Google key, rejects bad positions, and reports HTTP errors", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    mockFetch({ hourly: {} });
    expect(await openMeteoHourly(0, 0)).toEqual([]);
    await expect(googleHourly(49, 104)).rejects.toThrow("Maps is not set up");
    await expect(openMeteoHourly(91, 0)).rejects.toThrow("Invalid position");
    await expect(openMeteoHourly(Number.NaN, 0)).rejects.toThrow("Invalid position");
    mockFetch({}, 503);
    await expect(openMeteoHourly(1, 2)).rejects.toThrow("Open-Meteo error 503");
  });

  it("survives odd payloads and sends only a coarse position", async () => {
    const calls = mockFetch({ hourly: { time: [1e20, Date.parse(hour(1)) / 1000], temperature_2m: { 0: 1 }, weather_code: "71" } });
    expect(await openMeteoHourly(49.034567, 104.0876543)).toEqual([]);
    expect(calls[0].url).toContain("latitude=49.03&longitude=104.09&");
    mockFetch(null);
    expect(await openMeteoHourly(0.0000001, 0)).toEqual([]);
    const g = mockFetch({ forecastHours: [null, { interval: { startTime: hour(1) }, temperature: { degrees: "5" } }] });
    expect(await googleHourly(-33.86882, 151.20929)).toEqual([]);
    expect(g[0].url).toContain("location.latitude=-33.87&location.longitude=151.21&");
    mockFetch({ forecastHours: { a: 1 } });
    expect(await googleHourly(1, 2)).toEqual([]);
  });
});
