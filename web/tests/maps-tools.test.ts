import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCard } from "@/components/aspire/ActionCard";
import { resetMapsUsage } from "@/lib/maps";
import { runTool, type ToolStep } from "@/lib/tools";
import type { DeviceContext, ToolContext } from "@/lib/tools/types";
import staticRaw from "./fixtures/erdenet-static.json";
import vehiclesRaw from "./fixtures/erdenet-vehicles.json";

// 2026-11-20 10:00 in Mongolia
const NOW = new Date("2026-11-20T10:00:00+08:00");
const ctx = (device: Partial<DeviceContext> = {}, where: Partial<ToolContext> = {}): ToolContext => ({
  now: NOW,
  lang: "en",
  timeZone: "Asia/Ulaanbaatar",
  device: { memory: {}, reminders: [], ...device },
  actions: [],
  ...where,
});
// Somewhere that is not Erdenet: the network says Lagos.
const lagos = (device: Partial<DeviceContext> = {}) =>
  ctx(device, { timeZone: "Africa/Lagos", city: "Lagos", country: "NG", approxLocation: { lat: 6.45, lng: 3.39 } });
const run = async (name: string, input: unknown, c = ctx()) => {
  const steps: ToolStep[] = [];
  return { out: JSON.parse(await runTool(name, input, c, steps)), c, steps };
};

type Handler = (url: string, body: Record<string, unknown> | null) => Response;
function route(handler: Handler) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      return handler(String(url), init?.body ? JSON.parse(String(init.body)) : null);
    }),
  );
  return urls;
}
const google = (u: string) => /googleapis\.com/.test(u);

const transitRoutes = {
  routes: [
    {
      duration: "1500s",
      distanceMeters: 5000,
      legs: [
        {
          steps: [
            {
              travelMode: "TRANSIT",
              transitDetails: {
                stopDetails: { departureStop: { name: "Railway Station" }, arrivalStop: { name: "Hospital" }, departureTime: "2026-11-20T02:07:00Z", arrivalTime: "2026-11-20T02:29:00Z" },
                localizedValues: { departureTime: { timeZone: "Asia/Ulaanbaatar" }, arrivalTime: { timeZone: "Asia/Ulaanbaatar" } },
                headsign: "Hospital",
                stopCount: 5,
                transitLine: { name: "Route 5", nameShort: "5", vehicle: { type: "BUS" } },
              },
            },
          ],
        },
      ],
    },
  ],
};
const openMeteoWeather = {
  current: { temperature_2m: -20, apparent_temperature: -27, weather_code: 3, wind_speed_10m: 5, relative_humidity_2m: 60 },
  daily: { time: ["2026-11-20"], temperature_2m_max: [-12], temperature_2m_min: [-25], weather_code: [3], precipitation_probability_max: [0] },
};

beforeEach(() => {
  resetMapsUsage();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("get_directions / find_places", () => {
  it("without a key: friendly error, no crash, no request", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const urls = route(() => Response.json({}));
    expect((await run("get_directions", { origin: "A", destination: "B", mode: "walk" })).out.error).toBe("Maps is not set up");
    const places = await run("find_places", { query: "pharmacy", open_now: false });
    expect(places.out.error).toBe("Maps is not set up");
    expect(places.steps[0].ok).toBe(false);
    expect(urls).toHaveLength(0);
  });

  it("empty origin uses the shared location and shows a map card", async () => {
    let sent: Record<string, unknown> | null = null;
    route((_u, body) => {
      sent = body;
      return Response.json({ routes: [{ duration: "600s", distanceMeters: 900, legs: [{ steps: [] }] }] });
    });
    const { out, c } = await run("get_directions", { origin: "", destination: "Erdenet Hospital", mode: "walk" }, ctx({ location: { lat: 49.03, lng: 104.081 } }));
    expect(out).toMatchObject({ durationMin: 10, distanceKm: 0.9, mode: "walk" });
    expect(sent!.origin).toEqual({ location: { latLng: { latitude: 49.03, longitude: 104.081 } } });
    expect(c.actions).toHaveLength(1);
    expect(c.actions[0]).toMatchObject({ type: "map", title: "Erdenet Hospital" });
    expect(isCard(c.actions[0])).toBe(true);
  });

  it("empty origin without a location asks", async () => {
    const urls = route(() => Response.json({}));
    expect((await run("get_directions", { origin: "", destination: "B", mode: "transit" })).out.error).toMatch(/starting point/);
    expect(urls).toHaveLength(0);
  });

  it("find_places shows up to 3 cards", async () => {
    const place = (n: number) => ({ displayName: { text: `P${n}` }, formattedAddress: "x", googleMapsUri: `https://maps.google.com/?cid=${n}` });
    route(() => Response.json({ places: [1, 2, 3, 4].map(place) }));
    const { out, c } = await run("find_places", { query: "pharmacy in Erdenet", open_now: true });
    expect(out.places).toHaveLength(4);
    expect(c.actions.map((a) => a.type === "map" && a.title)).toEqual(["P1", "P2", "P3"]);
  });

  it("map cards render only for Google Maps links", () => {
    expect(isCard({ type: "map", title: "x", url: "https://www.google.com/maps/dir/?api=1&destination=x" })).toBe(true);
    expect(isCard({ type: "map", title: "x", url: "https://maps.google.com/?cid=1" })).toBe(true);
    expect(isCard({ type: "map", title: "x", url: "https://evil.test/maps" })).toBe(false);
    expect(isCard({ type: "map", title: "x", url: "javascript:alert(1)" })).toBe(false);
  });
});

describe("weather and air quality via Google, with Open-Meteo fallback", () => {
  it("uses Google Weather when it answers", async () => {
    const urls = route((u) =>
      u.includes("currentConditions")
        ? Response.json({ temperature: { degrees: -18 }, feelsLikeTemperature: { degrees: -25 }, weatherCondition: { description: { text: "Cloudy" } }, wind: { speed: { value: 9 } }, relativeHumidity: 55 })
        : Response.json({ forecastDays: [] }),
    );
    const { out } = await run("get_weather", { place: "" }, lagos());
    expect(out).toMatchObject({ place: "Lagos", source: "google", now: { temperatureC: -18, feelsLikeC: -25, conditions: "cloudy", windKmh: 9, humidityPct: 55 } });
    expect(urls.every(google)).toBe(true);
    // the network position is used directly: no geocoding call
    expect(urls.some((u) => u.includes("places:searchText"))).toBe(false);
    expect(urls[0]).toContain("location.latitude=6.45");
  });

  it("falls back to Open-Meteo when Google fails", async () => {
    route((u) => (google(u) ? Response.json({ error: { status: "INVALID_ARGUMENT" } }, { status: 400 }) : Response.json(openMeteoWeather)));
    const { out } = await run("get_weather", { place: "" }, lagos());
    expect(out).toMatchObject({ source: "open-meteo", now: { temperatureC: -20, conditions: "overcast" } });
  });

  it("falls back to Open-Meteo without a key", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const urls = route(() => Response.json(openMeteoWeather));
    expect((await run("get_weather", { place: "" }, lagos())).out.source).toBe("open-meteo");
    expect(urls.some(google)).toBe(false);
  });

  it("geocodes other places with Places before Google Weather", async () => {
    const urls = route((u) => {
      if (u.includes("places:searchText")) return Response.json({ places: [{ formattedAddress: "Ulaanbaatar, Mongolia", location: { latitude: 47.92, longitude: 106.92 } }] });
      if (u.includes("currentConditions")) return Response.json({ temperature: { degrees: -10 }, feelsLikeTemperature: { degrees: -15 }, weatherCondition: { description: { text: "Sunny" } }, wind: { speed: { value: 3 } }, relativeHumidity: 40 });
      return Response.json({ forecastDays: [] });
    });
    const { out } = await run("get_weather", { place: "Ulaanbaatar" });
    expect(out).toMatchObject({ place: "Ulaanbaatar, Mongolia", source: "google" });
    expect(urls[1]).toContain("location.latitude=47.92");
  });

  it("the shared device location wins over the network position", async () => {
    const urls = route((u) =>
      u.includes("currentConditions")
        ? Response.json({ temperature: { degrees: 21 }, feelsLikeTemperature: { degrees: 21 }, weatherCondition: { description: { text: "Rain" } }, wind: { speed: { value: 4 } }, relativeHumidity: 90 })
        : Response.json({ forecastDays: [] }),
    );
    await run("get_weather", { place: "" }, lagos({ location: { lat: 52.52, lng: 13.405 } }));
    expect(urls[0]).toContain("location.latitude=52.52");
  });

  it("geocodes the network city when there is no position", async () => {
    const urls = route((u) => {
      if (u.includes("places:searchText")) return Response.json({ places: [{ formattedAddress: "Oslo, Norway", location: { latitude: 59.91, longitude: 10.75 } }] });
      if (u.includes("currentConditions")) return Response.json({ temperature: { degrees: -3 }, feelsLikeTemperature: { degrees: -8 }, weatherCondition: { description: { text: "Snow" } }, wind: { speed: { value: 10 } }, relativeHumidity: 80 });
      return Response.json({ forecastDays: [] });
    });
    const { out } = await run("get_weather", { place: "" }, ctx({}, { city: "Oslo" }));
    expect(out).toMatchObject({ place: "Oslo, Norway", source: "google", now: { conditions: "snow" } });
    expect(urls[0]).toContain("places:searchText");
  });

  it("with no place and no idea where the person is, it asks (no Erdenet default)", async () => {
    const urls = route(() => Response.json(openMeteoWeather));
    const w = await run("get_weather", { place: "" });
    expect(w.out.error).toMatch(/Location unknown/);
    expect((await run("get_air_quality", { place: "" })).out.error).toMatch(/Location unknown/);
    expect(urls).toHaveLength(0);
  });

  it("air quality: Google first, Open-Meteo on error", async () => {
    route(() => Response.json({ indexes: [{ code: "uaqi", aqi: 30 }, { code: "usa_epa", aqi: 172 }], pollutants: [{ code: "pm25", concentration: { value: 95 } }] }));
    expect((await run("get_air_quality", { place: "" }, lagos())).out).toMatchObject({ place: "Lagos", usAqi: 172, level: "unhealthy", universalAqi: 30, pm2_5: 95, source: "google" });

    route((u) => (google(u) ? new Response("down", { status: 503 }) : Response.json({ current: { pm2_5: 12, pm10: 20, us_aqi: 55 } })));
    expect((await run("get_air_quality", { place: "" }, lagos())).out).toMatchObject({ usAqi: 55, level: "moderate", source: "open-meteo" });
  });
});

describe("buses: Erdenet's live feed in Erdenet, Google transit elsewhere", () => {
  // Serves the trimmed real Erdenet feed for dedtuv.erdenet.mn, and `g` for Google.
  const withFeed = (g: Handler): Handler => (u, body) =>
    u.includes("dedtuv.erdenet.mn") ? Response.json(u.endsWith("/static") ? staticRaw : vehiclesRaw) : g(u, body);
  const inErdenet = () => ctx({ location: { lat: 49.0072, lng: 104.0381 } });

  it("with only a Mongolian clock, Google departures come first", async () => {
    let sent: Record<string, unknown> | null = null;
    const urls = route(
      withFeed((_u, body) => {
        sent = body;
        return Response.json(transitRoutes);
      }),
    );
    const { out } = await run("get_next_bus", { stop: "Railway Station", route: "", to: "Hospital" });
    expect(out).toMatchObject({ source: "google", stop: "Railway Station", now: "10:00", arrivals: [{ route: "5", minutes: 7, time: "10:07", towards: "Hospital" }] });
    expect(sent!).toMatchObject({ origin: { address: "Railway Station" }, destination: { address: "Hospital" }, travelMode: "TRANSIT" });
    expect(urls.some((u) => u.includes("erdenet"))).toBe(false);
  });

  it("with only a Mongolian clock and no Google transit, Erdenet's live feed answers", async () => {
    route(withFeed(() => Response.json({})));
    const { out } = await run("get_next_bus", { stop: "Хунт", route: "", to: "market" });
    expect(out).toMatchObject({ source: "erdenet-live", stop: "Хунт", estimate: true, credit: "Орхон ТКХДТ" });
  });

  it("a device location in Erdenet uses the live feed first, without calling Google", async () => {
    const urls = route(withFeed(() => Response.json(transitRoutes)));
    const r = await run("get_next_bus", { stop: "", route: "", to: "" }, inErdenet());
    expect(r.out).toMatchObject({ source: "erdenet-live", note: "Nearest stop to the person" });
    expect(urls.some(google)).toBe(false);
  });

  it("outside Erdenet the city feed is never called; Google transit answers or the error points to get_directions", async () => {
    const urls = route(withFeed(() => Response.json({})));
    const none = await run("get_next_bus", { stop: "Central Square", route: "", to: "" }, lagos());
    expect(none.out.error).toMatch(/get_directions/);
    expect((await run("plan_trip", { from: "Central Square", to: "Market" }, lagos())).out.error).toMatch(/get_directions/);
    expect(urls.some((u) => u.includes("erdenet"))).toBe(false);

    let sent: Record<string, unknown> | null = null;
    route((_u, body) => {
      sent = body;
      return Response.json(transitRoutes);
    });
    const live = await run("get_next_bus", { stop: "Central Square", route: "", to: "Market" }, lagos());
    expect(live.out).toMatchObject({ source: "google", now: "03:00" }); // 10:00 in Mongolia = 03:00 in Lagos
    expect(sent!).toMatchObject({ origin: { address: "Central Square, Lagos" }, destination: { address: "Market, Lagos" } });
  });

  it("plan_trip outside Erdenet: Google options plus a map card", async () => {
    route(() => Response.json(transitRoutes));
    const g = await run("plan_trip", { from: "Central Square", to: "Market" }, lagos());
    expect(g.out).toMatchObject({ source: "google", options: [{ route: "5", departs: "10:07", arrives: "10:29", waitMinutes: 7, rideMinutes: 22 }] });
    expect(g.c.actions[0]).toMatchObject({ type: "map", title: "Market" });
  });

  it("with nothing known about the place, it asks for the city; naming Erdenet works from anywhere", async () => {
    route(withFeed(() => Response.json({})));
    const unknownBerlin = ctx({}, { timeZone: "Europe/Berlin" });
    const berlin = await run("get_next_bus", { stop: "Хунт", route: "", to: "" }, unknownBerlin);
    expect(berlin.out.source).toBeUndefined();
    expect(berlin.out.error).toMatch(/Location unknown/);
    expect((await run("get_next_bus", { stop: "Хунт", route: "", to: "" }, ctx({}, { timeZone: undefined }))).out.error).toMatch(/Location unknown/);
    expect((await run("get_next_bus", { stop: "Хунт", route: "", to: "Erdenet market" }, unknownBerlin)).out.source).toBe("erdenet-live");
  });

  it("Google calls count against MAPS_DAILY_LIMIT, then the Erdenet feed answers on a Mongolian clock", async () => {
    vi.stubEnv("MAPS_DAILY_LIMIT", "1");
    const urls = route(withFeed(() => Response.json(transitRoutes)));
    expect((await run("get_next_bus", { stop: "Хунт", route: "", to: "Hospital" })).out.source).toBe("google");
    expect((await run("get_next_bus", { stop: "Хунт", route: "", to: "Hospital" })).out.source).toBe("erdenet-live");
    expect(urls.filter(google)).toHaveLength(1);
  });
});

describe("air quality without an index", () => {
  it("is an error from Open-Meteo, never 'good'", async () => {
    route((u) => (google(u) ? new Response("down", { status: 503 }) : Response.json({ current: { pm2_5: null, pm10: null, us_aqi: null } })));
    const r = await run("get_air_quality", { place: "" }, lagos());
    expect(r.out.error).toMatch(/No air quality data/);
    expect(r.out.level).toBeUndefined();
    route((u) => (google(u) ? new Response("down", { status: 503 }) : Response.json({ current: { pm2_5: 400, pm10: 500, us_aqi: 420 } })));
    expect((await run("get_air_quality", { place: "" }, lagos())).out.level).toBe("hazardous");
  });
});
