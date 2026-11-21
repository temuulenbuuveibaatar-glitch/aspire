// The opening page's weather (lib/landing-weather.ts): where the visitor's network puts them, else
// Erdenet; Open-Meteo only, told a cell of about 11 km; one request per cell per 10 minutes; never
// throws; the air quality that rides along and can only ever be missing; the cell it hands back;
// and the ?sky= / ?hour= preview switch, which must say it is a preview.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeKind } from "@/components/aspire/Sky";
import { SKY_KINDS } from "@/lib/ambient-types";
import { landingWeather, resetLandingWeather } from "@/lib/landing-weather";

// Next's io(): resolved at once in a real request, hanging while a page is prerendered. `gate.wait`
// stands in for the hanging one; null is a real request.
const gate = vi.hoisted(() => ({ wait: null as Promise<void> | null }));
vi.mock("next/cache", () => ({ io: () => gate.wait ?? Promise.resolve() }));

const NOW = new Date("2026-11-21T15:20:00Z");
const ERDENET_URL = "https://api.open-meteo.com/v1/forecast?latitude=49.0&longitude=104.1&current=temperature_2m,weather_code,is_day,cloud_cover,wind_speed_10m&timezone=auto";
const AIR_HOST = "air-quality-api.open-meteo.com";
const ERDENET_AIR_URL = `https://${AIR_HOST}/v1/air-quality?latitude=49.0&longitude=104.1&current=us_aqi`;

/** Light snow on an Erdenet evening. */
const SNOWY = { timezone: "Asia/Ulaanbaatar", current: { temperature_2m: -12.4, weather_code: 71, is_day: 0, cloud_cover: 90, wind_speed_10m: 14 } };
const reading = (current: Record<string, unknown>, timezone: unknown = "Asia/Ulaanbaatar") => ({ timezone, current: { ...SNOWY.current, ...current } });
/** Moderate air, in the shape the air quality API answers with. */
const AIR = { timezone: "GMT", current: { time: "2026-11-21T15:00", interval: 3600, us_aqi: 62 } };
const air = (us_aqi: unknown) => ({ current: { ...AIR.current, us_aqi } });

type Call = { url: string; init: RequestInit };
type Answer = (url: string, init: RequestInit) => unknown;
/** What the fake fetch in use was asked by the air quality side, kept apart so every weather count below stays exact. */
let airCalls: Call[] = [];
/**
 * Fake fetch: every call is recorded and answered (a JSON body, a Response, or a throw). `answer`
 * speaks for the weather host and its calls are returned; `airAnswer` for the air quality host.
 */
function mockFetch(answer: Answer = () => SNOWY, airAnswer: Answer = () => AIR): Call[] {
  const calls: Call[] = [];
  const toAir: Call[] = [];
  airCalls = toAir;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init: RequestInit) => {
      const url = String(u);
      const isAir = new URL(url).host === AIR_HOST;
      (isAir ? toAir : calls).push({ url, init });
      const body = await (isAir ? airAnswer : answer)(url, init);
      return body instanceof Response ? body : Response.json(body);
    }),
  );
  return calls;
}
/** An answer that never comes: it ends only when the caller's own time limit fires. */
const hangs: Answer = (_url, init) => new Promise((_ok, fail) => init.signal!.addEventListener("abort", () => fail(init.signal!.reason)));

const vercel = (lat: string, lng: string, city: string, timeZone = "Asia/Ulaanbaatar") =>
  new Headers({ "x-vercel-ip-latitude": lat, "x-vercel-ip-longitude": lng, "x-vercel-ip-city": city, "x-vercel-ip-timezone": timeZone });
const NONE = new Headers();
/** The coordinates Open-Meteo was told, as sent. */
const sent = (c: Call) => `${new URL(c.url).searchParams.get("latitude")},${new URL(c.url).searchParams.get("longitude")}`;

beforeEach(() => {
  resetLandingWeather();
  gate.wait = null;
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("where the visitor is (Vercel's network headers)", () => {
  it("names the decoded city, asks for its rounded cell only and reads the local hour", async () => {
    const calls = mockFetch(() => ({ timezone: "America/Sao_Paulo", current: { temperature_2m: 24.3, weather_code: 61, is_day: 1, cloud_cover: 80, wind_speed_10m: 12 } }));
    const w = await landingWeather(vercel("-23.5475", "-46.6361", "S%C3%A3o%20Paulo", "America/Sao_Paulo"));
    expect(w).toEqual({
      place: "São Paulo",
      local: true,
      preview: false,
      tempC: 24.3,
      sky: { kind: "rain", intensity: 0.35, isDay: true, windKph: 12, cloudCover: 80 },
      localHour: 12, // 15:20 UTC
      timeZone: "America/Sao_Paulo",
      at: NOW.toISOString(),
      source: "open-meteo",
      aqi: 62,
      coords: { lat: -23.5, lng: -46.6 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.open-meteo.com/v1/forecast?latitude=-23.5&longitude=-46.6&current=temperature_2m,weather_code,is_day,cloud_cover,wind_speed_10m&timezone=auto");
    // Nothing finer than the cell leaves the server, to either host, or comes back to the page.
    expect(calls[0].url).not.toMatch(/23\.54|46\.63/);
    expect(airCalls.map((c) => c.url)).toEqual([`https://${AIR_HOST}/v1/air-quality?latitude=-23.5&longitude=-46.6&current=us_aqi`]);
    expect(JSON.stringify(w)).not.toMatch(/23\.54|46\.63/);
    expect(calls[0].init.redirect).toBe("error");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(calls[0].init.headers).get("user-agent")).toMatch(/^Aspire\//);
  });

  it("falls back to Erdenet without headers (local dev, another host)", async () => {
    const calls = mockFetch();
    const w = await landingWeather(NONE);
    expect(w).toMatchObject({ place: "Erdenet", local: false, preview: false, tempC: -12.4, timeZone: "Asia/Ulaanbaatar", localHour: 23, source: "open-meteo", aqi: 62, coords: { lat: 49, lng: 104.1 } });
    expect(w?.sky).toEqual({ kind: "snow", intensity: 0.35, isDay: false, windKph: 14, cloudCover: 90 });
    expect(calls.map((c) => c.url)).toEqual([ERDENET_URL]);
    expect(airCalls.map((c) => c.url)).toEqual([ERDENET_AIR_URL]);
  });

  it("falls back to Erdenet when the coordinates are missing, out of range or not plain numbers", async () => {
    const calls = mockFetch();
    const bad: [string, string][] = [
      ["91", "104.08"], ["49.03", "181"], ["-90.01", "0"], ["NaN", "104.08"], ["Infinity", "0"], ["1e1", "104.08"], ["0x31", "104.08"],
      ["49,03", "104,08"], ["- 49", "104"], ["49.03&current=x", "104.08"], ["49.03 OR 1=1", "104.08"], ["49.03;104.08", "104.08"],
      ["", "104.08"], ["49.03", ""], ["4".repeat(30), "104.08"], ["../49", "104.08"], ["https://evil.example/", "1"],
    ];
    for (const [lat, lng] of bad) {
      const w = await landingWeather(vercel(lat, lng, "Springfield"));
      expect([lat, lng, w?.place, w?.local, w?.coords]).toEqual([lat, lng, "Erdenet", false, { lat: 49, lng: 104.1 }]);
    }
    // Only ever the fixed Erdenet cell: nothing a header says reaches the URL of either host.
    expect(new Set(calls.map((c) => c.url))).toEqual(new Set([ERDENET_URL]));
    expect(new Set(airCalls.map((c) => c.url))).toEqual(new Set([ERDENET_AIR_URL]));
    // A city with no usable position is not shown over Erdenet's weather either.
    expect((await landingWeather(new Headers({ "x-vercel-ip-city": "Springfield" })))?.place).toBe("Erdenet");
  });

  it("cleans a hostile city name, and treats an unusable one as unknown", async () => {
    const calls = mockFetch();
    const place = async (city: string) => (await landingWeather(vercel("49.0278", "104.0445", city)))?.place;
    // Angle brackets and control characters never come through.
    const script = await place("%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(script).not.toMatch(/[<>]/);
    expect(await place("%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E")).not.toMatch(/[<>]/);
    expect(await place("Erd%00en%0Aet%1B%7F")).toBe("Erdenet");
    expect(await place("%0D%0ASet-Cookie:%20a=b")).toBe("Set-Cookie: a=b");
    // Capped.
    expect((await place("x".repeat(5000)))!.length).toBeLessThanOrEqual(80);
    // Not a name: nothing left, no letter, or percent escapes that would not decode.
    for (const city of ["", "%20%20", "%00%1F", "12345", "...", "%E0%A4%A", "S%25C3%25A3o", "%"]) expect([city, await place(city)]).toEqual([city, "Erdenet"]);
    // Other scripts are names too.
    expect(await place("%D0%AD%D1%80%D0%B4%D1%8D%D0%BD%D1%8D%D1%82")).toBe("Эрдэнэт");
    expect(await place("Biel%2FBienne")).toBe("Biel/Bienne");
    // Whatever the city header says, the request is one of the two fixed-shape cells.
    expect(new Set(calls.map(sent))).toEqual(new Set(["49.0,104.0", "49.0,104.1"]));
    expect(new Set(airCalls.map(sent))).toEqual(new Set(["49.0,104.0", "49.0,104.1"]));
  });

  it("ignores a time zone header that is not a real zone", async () => {
    mockFetch(() => reading({}, null));
    for (const tz of ["Mars/Phobos", "../../etc/passwd", "<script>", "Z".repeat(200)]) {
      const w = await landingWeather(vercel("52.52", "13.405", "Berlin", tz));
      expect([tz, w?.place, w?.timeZone, w?.localHour]).toEqual([tz, "Berlin", null, null]);
    }
    // The header's zone is used when Open-Meteo names none; Open-Meteo's own wins otherwise.
    expect(await landingWeather(vercel("52.52", "13.405", "Berlin", "Europe/Berlin"))).toMatchObject({ timeZone: "Europe/Berlin", localHour: 16 });
    resetLandingWeather();
    mockFetch(() => reading({}, "Asia/Tokyo"));
    expect(await landingWeather(vercel("35.68", "139.69", "Tokyo", "Europe/Berlin"))).toMatchObject({ timeZone: "Asia/Tokyo", localHour: 0 });
  });

  it("takes day or night from the reading, else from the place's clock", async () => {
    mockFetch(() => reading({ is_day: 1 }));
    expect((await landingWeather(NONE))?.sky.isDay).toBe(true); // 23:20 in Erdenet, but the reading says day
    resetLandingWeather();
    mockFetch(() => reading({ is_day: undefined }));
    expect((await landingWeather(NONE))?.sky.isDay).toBe(false);
    resetLandingWeather();
    vi.setSystemTime(new Date("2026-11-21T04:00:00Z")); // noon in Erdenet
    expect((await landingWeather(NONE))?.sky.isDay).toBe(true);
  });
});

describe("one request per cell per 10 minutes", () => {
  it("rounds to one decimal before the call and shares the reading inside a cell", async () => {
    const calls = mockFetch();
    const a = await landingWeather(vercel("49.0278", "104.0445", "Erdenet"));
    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60_000));
    const b = await landingWeather(vercel("49.04", "103.96", "Bulgan"));
    expect(calls.map(sent)).toEqual(["49.0,104.0"]);
    expect(airCalls.map(sent)).toEqual(["49.0,104.0"]);
    // The reading is shared with its own time; the place name is each visitor's own, never cached.
    expect([a?.place, b?.place]).toEqual(["Erdenet", "Bulgan"]);
    expect(b?.at).toBe(NOW.toISOString());
    expect(b?.sky).toEqual(a?.sky);
    // Two visitors in one cell are handed the same cell, not their own finer positions.
    expect([a?.coords, b?.coords]).toEqual([{ lat: 49, lng: 104 }, { lat: 49, lng: 104 }]);
    // The next cell is its own request (104.06 rounds up).
    await landingWeather(vercel("49.0278", "104.06", "Erdenet"));
    await landingWeather(vercel("-0.04", "0.04", "Null Island"));
    expect(calls.map(sent)).toEqual(["49.0,104.0", "49.0,104.1", "0.0,0.0"]);
    // The air quality side is asked for exactly the same cells, once each.
    expect(airCalls.map(sent)).toEqual(calls.map(sent));
  });

  it("asks again after 10 minutes, not before", async () => {
    const calls = mockFetch();
    await landingWeather(NONE);
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000 - 1));
    await landingWeather(NONE);
    expect([calls.length, airCalls.length]).toEqual([1, 1]);
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    const w = await landingWeather(NONE);
    expect([calls.length, airCalls.length]).toEqual([2, 2]);
    expect(w?.at).toBe(new Date(NOW.getTime() + 10 * 60_000).toISOString());
  });

  it("sends one request for visitors who arrive together", async () => {
    let release: (body: unknown) => void = () => {};
    const calls = mockFetch(() => new Promise((ok) => (release = ok)));
    const three = Promise.all([landingWeather(NONE), landingWeather(NONE, { sky: "rain" }), landingWeather(vercel("49.03", "104.08", "Erdenet"))]);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    release(SNOWY);
    const [a, b, c] = await three;
    expect([calls.length, airCalls.length]).toEqual([1, 1]);
    expect([a?.sky.kind, b?.sky.kind, c?.place]).toEqual(["snow", "rain", "Erdenet"]);
    expect([a?.aqi, b?.aqi, c?.aqi]).toEqual([62, 62, 62]);
  });

  it("keeps at most 500 cells", async () => {
    const calls = mockFetch();
    const at = (i: number) => vercel("10.0", (i / 10).toFixed(1), "Somewhere");
    for (let i = 0; i <= 500; i++) await landingWeather(at(i));
    expect(calls).toHaveLength(501);
    // 501 cells asked for: the newest 500 are still held, only the oldest was dropped.
    await landingWeather(at(500));
    await landingWeather(at(1));
    expect(calls).toHaveLength(501);
    await landingWeather(at(0));
    expect(calls).toHaveLength(502);
    expect(airCalls).toHaveLength(502);
  });
});

describe("never throws: null on any failure", () => {
  const fails: [string, () => unknown][] = [
    ["HTTP 500", () => new Response("down", { status: 500 })],
    ["HTTP 429", () => Response.json({ error: true, reason: "Too many requests" }, { status: 429 })],
    ["an error status, whatever its body says", () => Response.json(SNOWY, { status: 503 })],
    ["a network error", () => { throw new TypeError("fetch failed"); }],
    ["a refused redirect", () => { throw new TypeError("unexpected redirect"); }],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
    ["null", () => null],
    ["no current block", () => ({ timezone: "Asia/Ulaanbaatar" })],
    ["no temperature", () => reading({ temperature_2m: undefined })],
    ["a temperature that is not a number", () => reading({ temperature_2m: "-12" })],
    ["a temperature no place on Earth has", () => reading({ temperature_2m: 999 })],
  ];
  for (const [name, answer] of fails) {
    it(`${name} gives null`, async () => {
      mockFetch(answer);
      await expect(landingWeather(NONE)).resolves.toBeNull();
      await expect(landingWeather(NONE, { sky: "snow", hour: "22" })).resolves.toBeNull();
    });
  }

  it("gives up after 2.5 seconds", async () => {
    // The real limit is recorded; the test waits 20 ms instead.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const limit = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(20));
    const calls = mockFetch(hangs);
    await expect(landingWeather(NONE)).resolves.toBeNull();
    expect(limit).toHaveBeenCalledWith(2500);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal!.aborted).toBe(true);
  });

  it("does not ask again for a minute after a failure, then recovers", async () => {
    let up = false;
    const calls = mockFetch(() => (up ? SNOWY : new Response("busy", { status: 429 })));
    expect(await landingWeather(NONE)).toBeNull();
    expect(await landingWeather(NONE)).toBeNull();
    expect(calls).toHaveLength(1);
    up = true;
    vi.setSystemTime(new Date(NOW.getTime() + 59_000));
    expect(await landingWeather(NONE)).toBeNull();
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(await landingWeather(NONE)).toMatchObject({ tempC: -12.4, aqi: 62 });
    expect(calls).toHaveLength(2);
    // Good air does not stand in for failed weather, and is not asked for more often than it.
    expect(airCalls).toHaveLength(2);
  });

  it("survives headers and overrides that throw", async () => {
    mockFetch();
    const broken = { get: () => { throw new Error("boom"); } } as unknown as Headers;
    await expect(landingWeather(broken)).resolves.toBeNull();
    const trap = { get sky(): unknown { throw new Error("boom"); } };
    await expect(landingWeather(NONE, trap)).resolves.toBeNull();
  });

  it("keeps odd but usable readings in range", async () => {
    mockFetch(() => reading({ weather_code: 12345, cloud_cover: 250, wind_speed_10m: -3, is_day: "yes" }, "Not/AZone"));
    const w = await landingWeather(NONE);
    // An unknown code falls back to the cloud cover; the default zone covers a bad one.
    expect(w?.sky).toEqual({ kind: "cloudy", intensity: 1, isDay: false, windKph: 0, cloudCover: 100 });
    expect(w?.timeZone).toBe("Asia/Ulaanbaatar");
  });
});

describe("air quality: the same cell, beside the weather", () => {
  const LONDON = () => vercel("51.5074", "-0.1278", "London", "Europe/London");

  it("asks Open-Meteo's air quality API for the cell and nothing else, while the weather is still on its way", async () => {
    let weatherIn: (body: unknown) => void = () => {};
    let airIn: (body: unknown) => void = () => {};
    const calls = mockFetch(() => new Promise((ok) => (weatherIn = ok)), () => new Promise((ok) => (airIn = ok)));
    const pending = landingWeather(LONDON());
    // Both are out before either has answered: the two waits overlap, they do not add up.
    await vi.waitFor(() => expect([calls.length, airCalls.length]).toEqual([1, 1]));
    expect(airCalls[0].url).toBe(`https://${AIR_HOST}/v1/air-quality?latitude=51.5&longitude=-0.1&current=us_aqi`);
    expect(sent(airCalls[0])).toBe(sent(calls[0]));
    expect(airCalls[0].url).not.toMatch(/51\.50|0\.12/);
    // A plain GET like the weather's: no key, no cookie, redirects refused.
    expect(airCalls[0].init.redirect).toBe("error");
    expect(airCalls[0].init.method ?? "GET").toBe("GET");
    expect([...new Headers(airCalls[0].init.headers)]).toEqual([["user-agent", expect.stringMatching(/^Aspire\//)]]);
    // A time limit of its own, not the weather's.
    expect(airCalls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(airCalls[0].init.signal).not.toBe(calls[0].init.signal);
    airIn(air(137));
    weatherIn(SNOWY);
    expect(await pending).toMatchObject({ place: "London", local: true, preview: false, tempC: -12.4, aqi: 137, coords: { lat: 51.5, lng: -0.1 }, source: "open-meteo" });
  });

  it("keeps the figure with the weather for the same 10 minutes", async () => {
    let now = 62;
    const calls = mockFetch(undefined, () => air(now));
    expect((await landingWeather(NONE))?.aqi).toBe(62);
    now = 180;
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000 - 1));
    // The cached figure, for any visitor in the same cell.
    expect((await landingWeather(vercel("49.03", "104.08", "Erdenet")))?.aqi).toBe(62);
    expect([calls.length, airCalls.length]).toEqual([1, 1]);
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    expect((await landingWeather(NONE))?.aqi).toBe(180);
    expect([calls.length, airCalls.length]).toEqual([2, 2]);
  });

  /** A body exactly as written: JSON can carry figures that Response.json() would tidy away. */
  const raw = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  const misses: [string, Answer][] = [
    ["HTTP 500", () => new Response("down", { status: 500 })],
    ["HTTP 429", () => Response.json({ error: true, reason: "Too many requests" }, { status: 429 })],
    ["an error status, whatever its body says", () => Response.json(AIR, { status: 503 })],
    ["a network error", () => { throw new TypeError("fetch failed"); }],
    ["a refused redirect", () => { throw new TypeError("unexpected redirect"); }],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
    ["an empty body", () => new Response("", { status: 200 })],
    ["null", () => null],
    ["a bare number", () => 62],
    ["a list", () => [AIR]],
    ["no current block", () => ({ timezone: "GMT" })],
    ["a current block that is not an object", () => ({ current: "us_aqi" })],
    ["the weather's answer", () => SNOWY],
    ["no figure", () => air(undefined)],
    ["null for a figure", () => air(null)],
    ["a figure written as text", () => air("62")],
    ["a figure inside a list", () => air([62])],
    ["true for a figure", () => air(true)],
    ["a figure below zero", () => air(-1)],
    ["a figure just below zero", () => air(-0.2)],
    ["a figure in four digits", () => air(1000)],
    ["a desert dust storm's four digits", () => air(1806)],
    ["a figure a hair past three digits", () => air(999.5)],
    ["a figure no air has", () => air(99_999)],
    ["a figure too large to be a number", () => raw('{"current":{"us_aqi":1e999}}')],
    ["a figure too far below zero to be a number", () => raw('{"current":{"us_aqi":-1e999}}')],
  ];
  for (const [name, airAnswer] of misses) {
    it(`${name} leaves aqi null and the weather whole`, async () => {
      const calls = mockFetch(undefined, airAnswer);
      const w = await landingWeather(NONE);
      expect(w).toMatchObject({ place: "Erdenet", local: false, preview: false, tempC: -12.4, localHour: 23, timeZone: "Asia/Ulaanbaatar", at: NOW.toISOString(), source: "open-meteo", aqi: null, coords: { lat: 49, lng: 104.1 } });
      expect(w?.sky).toEqual({ kind: "snow", intensity: 0.35, isDay: false, windKph: 14, cloudCover: 90 });
      // Null, never left out: "not known" is said, not implied.
      expect(Object.keys(w!)).toContain("aqi");
      // The miss stays with its reading: an air outage is not asked about on every visit, preview or not.
      expect(await landingWeather(NONE, { sky: "rain", hour: "9" })).toMatchObject({ preview: true, tempC: -12.4, aqi: null });
      expect([calls.length, airCalls.length]).toEqual([1, 1]);
    });
  }

  it("keeps a usable figure as a whole number, zero included", async () => {
    const cases: [unknown, number][] = [[0, 0], [0.4, 0], [0.5, 1], [61.4, 61], [61.5, 62], [62, 62], [500, 500], [620, 620], [999, 999], [999.4, 999]];
    for (const [given, shown] of cases) {
      resetLandingWeather();
      mockFetch(undefined, () => air(given));
      expect([given, (await landingWeather(NONE))?.aqi]).toEqual([given, shown]);
    }
    // Clean air is a reading, not a gap; and it is never "-0", which a number formatter would print with its sign.
    for (const body of ['{"current":{"us_aqi":0}}', '{"current":{"us_aqi":-0}}', '{"current":{"us_aqi":-0.0}}', '{"current":{"us_aqi":0.0e0}}']) {
      resetLandingWeather();
      mockFetch(undefined, () => raw(body));
      const w = await landingWeather(NONE);
      expect([body, Object.is(w?.aqi, 0)]).toEqual([body, true]);
    }
  });

  it("gives up on slow air after 2 seconds and hands over the weather without it", async () => {
    // The real limits are recorded; the test waits 20 ms instead.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const limit = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(20));
    const calls = mockFetch(undefined, hangs);
    const w = await landingWeather(NONE);
    expect(w).toMatchObject({ place: "Erdenet", tempC: -12.4, at: NOW.toISOString(), aqi: null, coords: { lat: 49, lng: 104.1 } });
    expect(w?.sky).toEqual({ kind: "snow", intensity: 0.35, isDay: false, windKph: 14, cloudCover: 90 });
    // One limit each, and the air's is the shorter: waiting for it never makes a reading later than the weather alone could be.
    expect(limit.mock.calls.map(([ms]) => ms).sort()).toEqual([2000, 2500]);
    expect([calls.length, airCalls.length]).toEqual([1, 1]);
    expect(airCalls[0].init.signal!.aborted).toBe(true);
  });

  it("does not wait for the air once the weather has failed", async () => {
    // Air that never answers and ignores every limit: only the weather's own failure can end this.
    const calls = mockFetch(() => new Response("down", { status: 500 }), () => new Promise(() => {}));
    const result = await Promise.race([landingWeather(NONE), new Promise((later) => setTimeout(() => later("still waiting"), 500))]);
    expect(result).toBeNull();
    expect([calls.length, airCalls.length]).toEqual([1, 1]);
  });

  it("comes back with the next reading once the air quality side recovers", async () => {
    let up = false;
    const calls = mockFetch(undefined, () => (up ? AIR : new Response("busy", { status: 429 })));
    expect((await landingWeather(NONE))?.aqi).toBeNull();
    up = true;
    // Unlike failed weather, weather without air is a good reading: it is kept its full 10 minutes.
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(await landingWeather(NONE)).toMatchObject({ tempC: -12.4, aqi: null });
    expect([calls.length, airCalls.length]).toEqual([1, 1]);
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    expect(await landingWeather(NONE)).toMatchObject({ tempC: -12.4, aqi: 62 });
    expect([calls.length, airCalls.length]).toEqual([2, 2]);
  });

  it("a preview keeps the real figure and the real cell", async () => {
    const calls = mockFetch(undefined, () => air(137));
    const real = await landingWeather(LONDON());
    expect(real).toMatchObject({ preview: false, aqi: 137, coords: { lat: 51.5, lng: -0.1 } });
    for (const override of [{ sky: "snow" }, { hour: "3" }, { sky: "storm", hour: "22" }]) {
      const w = await landingWeather(LONDON(), override);
      expect([override, w?.preview, w?.aqi, w?.coords]).toEqual([override, true, 137, { lat: 51.5, lng: -0.1 }]);
    }
    expect([calls.length, airCalls.length]).toEqual([1, 1]);
  });
});

describe("the cell it hands back (coords)", () => {
  it("is exactly what Open-Meteo was told: one decimal, the lookup's own rounding", async () => {
    const calls = mockFetch();
    const places: [string, string][] = [["-23.5475", "-46.6361"], ["49.0278", "104.06"], ["64.1466", "-21.9426"], ["35.6762", "139.6503"], ["-33.8688", "151.2093"], ["89.96", "179.96"], ["-89.96", "-179.96"], ["0.05", "0.15"], ["7", "3"]];
    for (const [lat, lng] of places) {
      const w = await landingWeather(vercel(lat, lng, "Somewhere"));
      const c = w?.coords;
      expect([lat, lng, w?.local, typeof c?.lat, typeof c?.lng]).toEqual([lat, lng, true, "number", "number"]);
      // The same two numbers, to the digit, that went out in both requests.
      expect([lat, lng, `${c!.lat.toFixed(1)},${c!.lng.toFixed(1)}`]).toEqual([lat, lng, sent(calls.at(-1)!)]);
      expect(sent(airCalls.at(-1)!)).toBe(sent(calls.at(-1)!));
      // Nothing finer than a tenth of a degree, and a real point on Earth.
      for (const v of [c!.lat, c!.lng]) expect([v, Math.round(v * 10) / 10]).toEqual([v, v]);
      expect(Math.abs(c!.lat) <= 90 && Math.abs(c!.lng) <= 180).toBe(true);
    }
    // Every place above is its own cell: none of the answers came from another's cache.
    expect(calls).toHaveLength(places.length);
    expect((await landingWeather(vercel("-23.5475", "-46.6361", "S%C3%A3o%20Paulo")))?.coords).toEqual({ lat: -23.5, lng: -46.6 });
  });

  it("is Erdenet's cell when the visitor's place is not known, and `local` says so", async () => {
    mockFetch();
    for (const headers of [NONE, vercel("999", "x", "Springfield"), new Headers({ "x-vercel-ip-city": "Springfield" }), vercel("52.52", "13.405", "12345")]) {
      const w = await landingWeather(headers);
      expect([w?.place, w?.local, w?.coords]).toEqual(["Erdenet", false, { lat: 49, lng: 104.1 }]);
      // The cell, not the finer point the default is kept at, and nothing of what the headers said.
      expect(JSON.stringify(w)).not.toMatch(/49\.03|104\.08|52\.5|13\.4/);
    }
  });

  it("never carries a negative zero", async () => {
    mockFetch();
    const w = await landingWeather(vercel("-0.04", "-0.04", "Null Island"));
    expect([w?.local, Object.is(w?.coords?.lat, 0), Object.is(w?.coords?.lng, 0)]).toEqual([true, true, true]);
    expect(JSON.stringify(w?.coords)).toBe('{"lat":0,"lng":0}');
  });
});

describe("the preview switch (?sky= and ?hour=)", () => {
  it("/?sky=snow&hour=22 shows a snowy night and says it is a preview", async () => {
    const calls = mockFetch(() => reading({ temperature_2m: 3.1, weather_code: 0, is_day: 1, cloud_cover: 5, wind_speed_10m: 9 }));
    const real = await landingWeather(NONE);
    expect(real).toMatchObject({ preview: false, localHour: 23, sky: { kind: "clear", intensity: 0.05, isDay: true, windKph: 9, cloudCover: 5 } });
    const w = await landingWeather(NONE, { sky: "snow", hour: "22" });
    expect(w).toEqual({ ...real, preview: true, localHour: 22, sky: { kind: "snow", intensity: 0.6, isDay: false, windKph: 9, cloudCover: null } });
    // The same cached reading, and a preview never changes what the next visitor gets.
    expect(await landingWeather(NONE)).toEqual(real);
    expect(calls).toHaveLength(1);
  });

  it("a previewed hour sets day or night; a previewed sky leaves them to the reading", async () => {
    mockFetch(); // night in Erdenet, light snow
    const day = await landingWeather(NONE, { hour: "7" });
    expect(day).toMatchObject({ preview: true, localHour: 7, sky: { kind: "snow", intensity: 0.35, isDay: true, cloudCover: 90 } });
    const storm = await landingWeather(NONE, { sky: "storm" });
    expect(storm).toMatchObject({ preview: true, localHour: 23, sky: { kind: "storm", intensity: 0.8, isDay: false, cloudCover: null } });
    const isDay = async (hour: unknown) => (await landingWeather(NONE, { hour }))?.sky.isDay;
    expect(await Promise.all([0, 5, 6, 12, 17, 18, 23].map(isDay))).toEqual([false, false, true, true, true, false, false]);
  });

  it("accepts exactly the sky kinds the app's safeKind knows", async () => {
    mockFetch();
    for (const kind of SKY_KINDS) {
      const w = await landingWeather(NONE, { sky: kind });
      expect([kind, w?.preview, w?.sky.kind, w?.sky.cloudCover]).toEqual([kind, true, safeKind(kind), null]);
      expect(w?.sky.kind).toBe(kind);
      // Whatever falls comes down hard enough to be seen.
      if (["drizzle", "rain", "storm", "snow", "sleet", "hail"].includes(kind)) expect(w!.sky.intensity).toBeGreaterThanOrEqual(0.4);
    }
    // Typed by hand: case and stray spaces do not matter.
    expect(await landingWeather(NONE, { sky: " Rain " })).toMatchObject({ preview: true, sky: { kind: "rain" } });
    expect(await landingWeather(NONE, { hour: " 9 " })).toMatchObject({ preview: true, localHour: 9 });
    // A repeated parameter: the first value counts.
    expect(await landingWeather(NONE, { sky: ["rain", "storm"], hour: ["5", "22"] })).toMatchObject({ preview: true, localHour: 5, sky: { kind: "rain" } });
  });

  it("ignores everything else: the real reading, not called a preview", async () => {
    mockFetch();
    const real = await landingWeather(NONE);
    const skies: unknown[] = ["banana", "", "sunny", "snowy", "<script>", "snow;rain", "snow\u0000", "s".repeat(10_000), "snow ".repeat(2000), 42, null, undefined, true, {}, [], ["nope", "snow"], { toString: () => "snow" }];
    for (const sky of skies) {
      // What safeKind would turn into its "clear" default is simply not an override here.
      expect(safeKind(sky) === sky).toBe(false);
      expect(await landingWeather(NONE, { sky })).toEqual(real);
    }
    const hours: unknown[] = ["24", "-1", "7.5", "7,5", "abc", "", " ", "1e1", "0x10", "+7", "007", "22h", "9".repeat(10_000), 24, -1, 7.5, NaN, Infinity, null, undefined, true, {}, [], ["99", "5"], { valueOf: () => 5 }];
    for (const hour of hours) expect([hour, await landingWeather(NONE, { hour })]).toEqual([hour, real]);
    expect(await landingWeather(NONE, {})).toEqual(real);
    // One valid half still previews.
    expect(await landingWeather(NONE, { sky: "banana", hour: "07" })).toMatchObject({ preview: true, localHour: 7, sky: { kind: "snow" } });
    expect(await landingWeather(NONE, { sky: "fog", hour: 23 })).toMatchObject({ preview: true, localHour: 23, sky: { kind: "fog" } });
  });
});

// Cache Components with Partial Prefetching: reading the clock while a page is prerendered (the
// static shell, or the per-session shell a link prefetch keeps) is an error in Next 16. io() is what
// keeps this request-time work out of every prerender.
describe("stays out of prerenders (Next's io)", () => {
  it("reads nothing and asks nothing until io() lets request-time work run", async () => {
    let open: () => void = () => {};
    gate.wait = new Promise<void>((ok) => (open = ok));
    const calls = mockFetch();
    const headers = vercel("49.0278", "104.0445", "Erdenet");
    const read = vi.spyOn(headers, "get");
    let settled = false;
    const pending = landingWeather(headers, { sky: "snow" }).finally(() => (settled = true));
    await new Promise((later) => setTimeout(later, 25));
    // A prerender ends here: the promise is still pending, so the page keeps its fallback.
    expect([calls.length, airCalls.length, read.mock.calls.length, settled]).toEqual([0, 0, 0, false]);
    open();
    expect(await pending).toMatchObject({ place: "Erdenet", local: true, preview: true, aqi: 62, coords: { lat: 49, lng: 104 } });
    expect([calls.length, airCalls.length]).toEqual([1, 1]);
  });

  it("gives null, not a throw, when the prerender ends while it waits", async () => {
    gate.wait = Promise.reject(new Error("During prerendering, `io()` rejects when the prerender is complete."));
    const calls = mockFetch();
    await expect(landingWeather(NONE)).resolves.toBeNull();
    expect([calls.length, airCalls.length]).toEqual([0, 0]);
  });

  it("the installed Next has io(), and outside Next it resolves at once", async () => {
    const real = await vi.importActual<typeof import("next/cache")>("next/cache");
    expect(typeof real.io).toBe("function");
    await expect(Promise.race([real.io().then(() => "now"), new Promise((later) => setTimeout(() => later("late"), 200))])).resolves.toBe("now");
  });
});

describe("the privacy policy says so", () => {
  it("in all five languages: network city, about 11 km, Open-Meteo for weather and air quality alike, 10 minutes, Erdenet otherwise", async () => {
    const { createElement } = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { default: Privacy } = await import("@/app/privacy/page");
    const html = renderToString(createElement(Privacy)).replace(/<!-- -->/g, "");
    const said: Record<string, RegExp> = {
      mn: /Нэвтрэхээс өмнөх нүүр хуудас<\/b> таны байгаа орчмын цаг агаар, агаарын чанарыг харуулна\..*Vercel.*11 км хүртэл бөөрөнхийлсөн байршлыг.*Open-Meteo руу илгээнэ, мөн тэр хүсэлтээр агаарын чанарын мэдээг авна\. Энэ байршлыг хадгалахгүй.*цаг агаар, агаарын чанарын мэдээ.*10 минут.*Эрдэнэт хотын цаг агаар, агаарын чанарыг/,
      en: /The opening page<\/b>.*before you sign in.*weather and the air quality for your approximate area\..*Vercel.*rounded to about 11 km, is sent to Open-Meteo to get the weather reading and, in the same lookup, the air quality reading\. The position is not stored.*the readings themselves.*10 minutes.*the weather and the air quality in Erdenet/,
      zh: /登录前看到的首页会显示您所在大致区域的天气和空气质量。.*Vercel.*只把约 11 公里精度的位置发送给 Open-Meteo 以获取天气数据，同一次查询也会获取空气质量数据。该位置不会保存.*天气和空气质量数据.*10 分钟。.*额尔登特的天气和空气质量/,
      ru: /Главная страница, которую вы видите до входа, показывает погоду и качество воздуха.*Vercel.*в Open-Meteo отправляется позиция, округлённая примерно до 11 км, чтобы получить данные о погоде, а заодно и о качестве воздуха\. Позиция не хранится.*данные о погоде и воздухе.*10 минут\..*погода и качество воздуха в Эрдэнэте/,
      de: /Die Startseite, die Sie vor der Anmeldung sehen, zeigt das Wetter und die Luftqualität.*Vercel.*Der auf etwa 11 km gerundete Standort geht an Open-Meteo, um die Wetterdaten und mit derselben Abfrage auch die Luftqualität abzurufen\. Der Standort wird nicht gespeichert.*die abgerufenen Daten selbst.*10 Minuten.*Wetter und Luftqualität in Erdenet/,
    };
    for (const [id, re] of Object.entries(said)) {
      const section = html.slice(html.indexOf(`id="${id}"`)).split("</section>")[0];
      const told = section.split(/<\/?(?:p|li)>/).find((part) => re.test(part));
      expect([id, told !== undefined]).toEqual([id, true]);
      // No dashes, arrows or emojis in what was added.
      expect(told).not.toMatch(/[\u2012-\u2015\u2190-\u21FF]|\p{Extended_Pictographic}/u);
    }
  });
});

describe("Open-Meteo only", () => {
  it("never calls a Google host, even with a Maps key configured: weather and air alike", async () => {
    const KEY = "test-key-not-a-real-one";
    vi.stubEnv("GOOGLE_MAPS_API_KEY", KEY);
    const calls = mockFetch();
    await landingWeather(NONE);
    await landingWeather(vercel("51.5074", "-0.1278", "London", "Europe/London"));
    await landingWeather(vercel("51.5074", "-0.1278", "London", "Europe/London"), { sky: "rain", hour: "3" });
    await landingWeather(vercel("999", "x", "%3Cb%3E"));
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // One air quality call beside each weather call, and it is held to the same rules.
    expect(airCalls).toHaveLength(calls.length);
    for (const c of [...calls, ...airCalls]) {
      const u = new URL(c.url);
      const isAir = airCalls.includes(c);
      expect(u.protocol).toBe("https:");
      expect(u.host).toBe(isAir ? AIR_HOST : "api.open-meteo.com");
      expect(u.pathname).toBe(isAir ? "/v1/air-quality" : "/v1/forecast");
      expect([...u.searchParams.keys()]).toEqual(isAir ? ["latitude", "longitude", "current"] : ["latitude", "longitude", "current", "timezone"]);
      // The air quality side is asked for the one figure only.
      if (isAir) expect(u.searchParams.get("current")).toBe("us_aqi");
      expect(u.searchParams.get("latitude")).toMatch(/^-?\d{1,2}\.\d$/);
      expect(u.searchParams.get("longitude")).toMatch(/^-?\d{1,3}\.\d$/);
      expect(c.url).not.toMatch(/google/i);
      expect(JSON.stringify([c.url, [...new Headers(c.init.headers)]])).not.toContain(KEY);
      // No key, no cookie, no credentials: a plain GET.
      expect(c.init.method ?? "GET").toBe("GET");
      expect([...new Headers(c.init.headers).keys()]).toEqual(["user-agent"]);
    }
  });
});
