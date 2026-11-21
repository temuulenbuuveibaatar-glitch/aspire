// v6 dashboard components render on the server with real data, say where every figure comes from and
// how old it is, label estimates, say "unknown" instead of inventing, and carry no emojis or taxi readout.
import { describe, expect, it } from "vitest";
import { createElement, type ComponentProps, type FunctionComponent } from "react";
import { renderToString } from "react-dom/server";
import type { Ambient, AmbientSky, AmbientWeather } from "@/lib/ambient-types";
import type { CityData } from "@/lib/erdenet-city";
import { LANGS } from "@/lib/lang";
import { NewsStrip } from "@/components/aspire/NewsStrip";
import { AgentPanel } from "@/components/v6/AgentPanel";
import { AirCard, aqiPosition } from "@/components/v6/AirCard";
import { ageText, Card } from "@/components/v6/Card";
import { CityPanel, cityTabs } from "@/components/v6/CitySheet";
import { HeroCard, placeClock } from "@/components/v6/HeroCard";
import { SunCard, sunTimes } from "@/components/v6/SunCard";
import { TopNav } from "@/components/v6/TopNav";
import { TrafficCard, trafficProvenance } from "@/components/v6/TrafficCard";
import { departuresFromAmbient, minutesLeft, osmStops, TransitCard, type Departure } from "@/components/v6/TransitCard";
import { fill, V6 } from "@/components/v6/text";

const SYMBOLS = /[\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]|\p{Extended_Pictographic}/u;
const NOW = Date.parse("2026-11-21T04:00:00Z"); // 12:00 in Erdenet / Ulaanbaatar
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over many prop shapes
const html = <P,>(c: FunctionComponent<P>, props: P) => renderToString(createElement(c as FunctionComponent<any>, props as any));
const noop = () => {};

const sky: AmbientSky = { kind: "rain", intensity: 0.5, isDay: true, windKph: 10, cloudCover: 90 };
const weather: AmbientWeather = {
  tempC: 12.4,
  feelsC: 9.6,
  text: "Light rain",
  days: [
    { date: "2026-11-21", minC: 9, maxC: 14, text: "Rain", kind: "rain", precipChance: 80 },
    { date: "2026-11-22", minC: 7, maxC: 11, text: "Cloudy", kind: "cloudy", precipChance: 20 },
    { date: "2026-11-23", minC: -2, maxC: 3, text: "Snow", kind: "snow", precipChance: null },
  ],
};
const photo = { url: "https://upload.wikimedia.org/x.jpg", attribution: { name: "A. Bat", uri: "https://commons.wikimedia.org/wiki/File:X.jpg" } };

describe("strings", () => {
  it("every language has every key, non-empty, with no emojis or arrows", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [k] : keys(v).map((x) => `${k}.${x}`)));
    const vals = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : vals(v)));
    for (const l of LANGS) {
      expect(keys(V6[l]).sort()).toEqual(keys(V6.en).sort());
      expect(vals(V6[l]).filter((s) => !s.trim() || SYMBOLS.test(s))).toEqual([]);
    }
  });
  it("counts take the language's plural forms", () => {
    expect(fill(V6.en.liveBuses, { n: 1 }, "en")).toBe("1 bus live on the map");
    expect(fill(V6.en.liveBuses, { n: 3 }, "en")).toBe("3 buses live on the map");
    expect(fill(V6.ru.liveBuses, { n: 1 }, "ru")).toMatch(/^1 автобус /);
    expect(fill(V6.ru.liveBuses, { n: 3 }, "ru")).toMatch(/^3 автобуса /);
    expect(fill(V6.ru.liveBuses, { n: 5 }, "ru")).toMatch(/^5 автобусов /);
    expect(fill(V6.de.vehicles, { n: 1 }, "de")).toBe("1 Fahrzeug gezählt");
    expect(V6.mn.estimated).not.toBe(V6.mn.calculated);
  });
  it("ages read naturally in each language", () => {
    expect(ageText(30, "en")).toMatch(/30 sec/);
    expect(ageText(240, "de")).toMatch(/4 Min/);
    expect(ageText(7200, "mn")).toMatch(/2/);
  });
});

describe("HeroCard", () => {
  const base = { lang: "en" as const, place: "Erdenet, Mongolia", sky, weather, photo, timeZone: "Asia/Ulaanbaatar", now: NOW, onOpenMap: noop };

  it("shows the photo with its credit, the city, temperature, feels-like, high/low, local clock and the 3-day fallback", () => {
    const out = html(HeroCard, { ...base, prov: { source: "Open-Meteo", ageS: 240, kind: "live" } });
    expect(out).toContain('src="https://upload.wikimedia.org/x.jpg"');
    expect(out).toContain('href="https://commons.wikimedia.org/wiki/File:X.jpg"');
    expect(out).toContain(">Erdenet</h1>");
    expect(out).toContain(">12°<");
    expect(out).toMatch(/Feels like.*10°/);
    expect(out).toMatch(/H.*14°.*L.*9°/);
    expect(out).toContain(">12:00</time>");
    expect(out).toContain("Open city map");
    expect(out).toContain('data-mode="days"');
    expect(out).toContain("Next 3 days");
    expect(out).toContain("Open-Meteo");
    expect(out).not.toMatch(SYMBOLS);
  });

  it("uses hourly data when present, and draws no clock before the client knows the time", () => {
    const hourly = [0, 1, 2].map((i) => ({ time: new Date(NOW + i * 3600_000).toISOString(), tempC: 12 + i, kind: "rain" as const, precipChance: 80 - i * 10 }));
    const out = html(HeroCard, { ...base, weather: { ...weather, hourly }, now: null });
    expect(out).toContain('data-mode="hourly"');
    expect(out).toContain("80% rain");
    expect(out).not.toContain("<time");
  });

  it("drops hours that have ended and says Now only for the current hour", () => {
    const hourly = [-3, -1, 0, 1].map((i) => ({ time: new Date(NOW + i * 3600_000 - 600_000).toISOString(), tempC: 10, kind: "cloudy" as const, precipChance: null }));
    const out = html(HeroCard, { ...base, weather: { ...weather, hourly } });
    expect((out.match(/<li /g) ?? []).length).toBe(2);
    expect(out).toContain(">Now<");
    const later = html(HeroCard, { ...base, weather: { ...weather, hourly: hourly.slice(3) } });
    expect(later).not.toContain(">Now<");
  });

  it("refuses an unsafe photo URL and says when there is no weather", () => {
    const out = html(HeroCard, { ...base, weather: null, photo: { url: "javascript:alert(1)", attribution: { name: "X", uri: "http://x.test" } } });
    expect(out).not.toContain("<img");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("No weather data yet");
  });

  it("a provider's weather reads Forecast, never Estimated, also for the hourly strip from another provider", () => {
    const hourly = [0, 1].map((i) => ({ time: new Date(NOW + i * 3600_000).toISOString(), tempC: 10, kind: "snow" as const, precipChance: 40 }));
    const out = html(HeroCard, { ...base, weather: { ...weather, hourly, source: "google", hourlySource: "open-meteo" }, prov: { source: "Google", ageS: 240, kind: "estimated" } });
    expect(out).toContain('data-prov="forecast"');
    expect(out).not.toContain('data-prov="estimated"');
    expect(out).toMatch(/Forecast.*4 min\. ago.*Google/);
    expect(out).toContain("Hourly: Open-Meteo");
    expect(out).not.toContain("Estimated");
    for (const l of LANGS) expect(V6[l].forecast).not.toBe(V6[l].estimated);
  });

  it("formats the place's clock and zone", () => {
    expect(placeClock(NOW, "Europe/London", "en").time).toBe("04:00");
    expect(placeClock(NOW, "Not/AZone", "en").time).toMatch(/^\d\d:\d\d$/);
  });
});

const cams = [
  { id: "1", name: "Оюутны гудамж", lat: 49.03, lng: 104.08, vehicles: 42, load: "high" as const, detectedAt: ago(20) },
  { id: "2", name: "Төв талбай", lat: 49.03, lng: 104.09, vehicles: 18, load: "medium" as const, detectedAt: ago(40) },
  { id: "3", name: "Хуучин", lat: 49.04, lng: 104.09, vehicles: 99, load: "high" as const, detectedAt: ago(4000) },
];
const erdenet: CityData = {
  traffic: { cameras: cams, summary: { level: "high", busiest: ["Оюутны гудамж", "Төв талбай"], updatedAt: ago(20) } },
  parking: {
    lots: [
      { id: "p1", name: "Зах", lat: 49, lng: 104, total: 100, free: 30, distanceM: 350 },
      { id: "p2", name: "Эмнэлэг", lat: 49, lng: 104, total: 50, free: null, distanceM: 1240 },
    ],
    updatedAt: ago(30),
  },
  fuel: {
    stations: [
      {
        id: "f1", name: "Петровис", org: "Petrovis", lat: 49, lng: 104, distanceM: 800,
        fuels: [
          { type: "AI92", status: "selling", updatedAt: ago(600) },
          { type: "DIESEL", status: "unknown", updatedAt: null },
        ],
      },
    ],
  },
  cameras: { kind: "embed", url: "https://dedtuv.erdenet.mn/live", credit: "Орхон ТКХДТ" },
  credit: "Орхон ТКХДТ",
};
const ub: CityData = { traffic: null, parking: null, fuel: null, cameras: { kind: "link", url: "https://ubtraffic.mn", credit: "ЗХУТ" }, credit: "ЗХУТ" };

describe("TrafficCard (replaces the taxi readout)", () => {
  it("Erdenet: camera load, fresh vehicle count, busiest roads with their ages, live with credit", () => {
    const out = html(TrafficCard, { lang: "en", now: NOW, city: "Erdenet", traffic: erdenet.traffic, credit: erdenet.credit, onCameras: noop });
    expect(out).toContain("Heavy");
    expect(out).toContain("60 vehicles counted"); // the 4000 s old camera is left out
    expect(out).toContain("Оюутны гудамж");
    expect(out).toContain("20 sec. ago");
    expect(out).toContain('data-prov="live"');
    expect(out).toContain("Орхон ТКХДТ");
    expect(out).toContain("Live cameras");
    expect(out).not.toMatch(/taxi/i);
  });

  it("busiest roads: long names wrap (never cut) and the figures sit in aligned columns", () => {
    const long = "Оюутны гудамж ба Төв талбайн уулзвараас хойшхи хэсэг";
    const traffic = { cameras: [{ ...cams[0], name: long }, cams[1]], summary: { level: "high" as const, busiest: [long, "Төв талбай"], updatedAt: ago(20) } };
    const out = html(TrafficCard, { lang: "en", now: NOW, city: "Erdenet", traffic, credit: "Орхон ТКХДТ" });
    // Phones: name, load, count (the age is on the source line); from sm: the age column too.
    expect(out).toMatch(/data-rows="busiest" class="grid grid-cols-\[minmax\(0,1fr\)_auto_auto\] [^"]*sm:grid-cols-\[minmax\(0,1fr\)_auto_auto_auto\]/);
    expect(out).toMatch(/<span class="[^"]*hidden[^"]*sm:block[^"]*">20 sec\. ago/);
    expect((out.match(/grid-cols-subgrid/g) ?? []).length).toBe(2);
    // Low vision (WCAG 1.4.4 / 1.4.10): the whole name stays readable at large text, no hover needed.
    expect(out).toContain(`[overflow-wrap:anywhere]">${long}</span>`);
    expect(out).not.toContain(`title="${long}"`);
    expect(out.slice(out.indexOf('data-rows="busiest"'), out.indexOf("</ul>"))).not.toMatch(/\btruncate\b/);
    // Every row has all four cells, so the columns never shift; the digit is read as "42 vehicles counted".
    expect(out).toMatch(/Heavy<\/span><span[^>]*><data aria-hidden="true" value="42">42<\/data><span class="sr-only">42 vehicles counted<\/span><\/span><span[^>]*>20 sec\. ago/);
  });

  it("elsewhere: Google level labelled Estimated with its delay; the cameras button only with a place", () => {
    const out = html(TrafficCard, { lang: "en", now: NOW, city: "London", google: { level: "moderate", delayMin: 6.4 }, googleAt: ago(120), onCameras: noop });
    expect(out).toContain('data-prov="estimated"');
    expect(out).toContain("Google");
    expect(out).toContain("+6 min vs free flow");
    expect(out).toContain("Live cameras");
    expect(out).not.toContain("v6-live-dot");
    expect(html(TrafficCard, { lang: "en", now: NOW, city: "London", google: { level: "light", delayMin: 0 }, googleAt: ago(60) })).not.toContain("Live cameras");
  });

  it("a stale snapshot does not claim a level; Google steps in when the cameras have gone quiet", () => {
    const stale = { cameras: cams.map((c) => ({ ...c, detectedAt: ago(4000) })), summary: { level: "high" as const, busiest: ["Оюутны гудамж"], updatedAt: ago(4000) } };
    // Fresh counts with no load are still live data (never "No data" under a vehicle count).
    const counts = { cameras: cams.map((c) => ({ ...c, load: null, detectedAt: ago(30) })), summary: { level: null, busiest: [], updatedAt: ago(30) } };
    const counted = html(TrafficCard, { lang: "en", now: NOW, city: "Erdenet", traffic: counts, credit: "Орхон ТКХДТ" });
    expect(counted).toContain('data-prov="live"');
    expect(counted).toMatch(/vehicles? counted/);
    expect(trafficProvenance(counts, null, null, "Орхон ТКХДТ", NOW)).toMatchObject({ kind: "live", source: "Орхон ТКХДТ" });
    expect(trafficProvenance(stale, { level: "light", delayMin: 0 }, ago(60), "Орхон ТКХДТ", NOW)).toMatchObject({ kind: "estimated", source: "Google" });
    const out = html(TrafficCard, { lang: "en", now: NOW, city: "Erdenet", traffic: stale, credit: "Орхон ТКХДТ" });
    expect(out).not.toContain("Heavy");
    expect(out).toContain('data-prov="none"');
    expect(out).toContain("No live traffic data for Erdenet yet.");
    const g = html(TrafficCard, { lang: "en", now: NOW, city: "Erdenet", traffic: stale, google: { level: "light", delayMin: 0 }, googleAt: ago(60) });
    expect(g).toContain('data-prov="estimated"');
    expect(g).toContain("Light");
    const down = html(TrafficCard, { lang: "en", now: NOW, city: "Erdenet", down: true, google: { level: "heavy", delayMin: 9 }, googleAt: ago(60) });
    expect(down).toContain("not answering");
    expect(down).toContain("Heavy");
  });

  it("no data is said by name; a feed that is down is not shown as empty", () => {
    expect(html(TrafficCard, { lang: "en", now: NOW, city: "Tsetserleg" })).toContain("No live traffic data for Tsetserleg yet.");
    expect(html(TrafficCard, { lang: "en", now: NOW })).not.toContain(" for  yet");
    expect(html(TrafficCard, { lang: "en", now: NOW, city: "Erdenet", down: true })).toContain("not answering");
  });
});

describe("TransitCard", () => {
  const dep = (route: string, minutes: number, kind: Departure["kind"]): Departure => ({ route, minutes, kind, at: ago(0), source: "Transitous", headsign: "Center" });

  it("leave-in from the walk; live rows pulse and say Live, scheduled ones do not", () => {
    const out = html(TransitCard, { lang: "en", now: NOW, coverage: "live", stopName: "Westminster", walkMin: 2, departures: [dep("24", 5, "live"), dep("159", 8, "scheduled")], onViewRoutes: noop });
    expect(out).toContain("Leave in 3 min");
    expect(out).toContain("2 min walk");
    expect((out.match(/v6-live-dot/g) ?? []).length).toBe(1);
    expect(out).toContain('data-kind="scheduled"');
    expect(out).toContain("Scheduled");
    expect(out).toContain("View all routes");
  });

  it("OpenStreetMap stops are listed with 'No timetable data', never minutes", () => {
    const osm = osmStops({ stops: [{ name: "Peace Ave", distanceM: 120, source: "osm", kind: "stop" }, { name: "Google stop", distanceM: 50 }] as Ambient["stops"] });
    expect(osm.map((s) => s.name)).toEqual(["Peace Ave"]);
    const out = html(TransitCard, { lang: "en", now: NOW, coverage: "static", city: "Ulaanbaatar", departures: [dep("1", 5, "scheduled")], stops: osm, prov: { source: "OpenStreetMap contributors", ageS: null, kind: "static" }, onViewRoutes: noop });
    expect(out).toContain("Peace Ave");
    expect(out).toContain("120 m");
    expect(out).toContain("No timetable data");
    expect(out).toContain("OpenStreetMap contributors");
    expect(out).not.toContain("5 min");
    expect(out).not.toContain("Stops only in");
  });

  it("stops-only and none never show minutes, and departures that have gone are dropped", () => {
    const stops = html(TransitCard, { lang: "en", now: NOW, coverage: "static", city: "Tsetserleg", departures: [dep("1", 5, "scheduled")], onViewRoutes: noop });
    expect(stops).toContain("Stops only in Tsetserleg");
    expect(stops).not.toContain("5 min");
    expect(stops).toContain("View all routes");
    expect(minutesLeft({ ...dep("1", 2, "live"), at: ago(300) }, NOW)).toBeNull();
  });

  it("a feed with nothing due is not called 'no data'; an old live-bus count is not called live", () => {
    const out = html(TransitCard, { lang: "en", now: NOW, coverage: "live", city: "Erdenet", departures: [], liveBuses: { count: 7, at: ago(900) }, onViewRoutes: noop });
    expect(out).toContain("No upcoming departures right now.");
    expect(out).not.toContain("7 buses");
    expect(html(TransitCard, { lang: "en", now: NOW, coverage: "live", departures: [], liveBuses: { count: 7, at: ago(10) }, onViewRoutes: noop })).toContain("7 buses live on the map");
    expect(html(TransitCard, { lang: "en", now: NOW, coverage: "none", departures: [], onViewRoutes: noop })).toContain("No data yet");
  });

  it("maps the ambient snapshot: Erdenet minutes are estimates, Google ones scheduled", () => {
    const a = { stopsSource: "erdenet-live", stops: [{ name: "S", distanceM: 100, lines: [{ route: "3", minutes: 4 }] }], nextBus: null } as Pick<Ambient, "stops" | "nextBus" | "stopsSource">;
    expect(departuresFromAmbient(a, ago(0))[0]).toMatchObject({ route: "3", kind: "estimated", source: "Орхон ТКХДТ" });
    // Stop lines with no named source are credited to no one.
    expect(departuresFromAmbient({ ...a, stopsSource: undefined }, ago(0))).toEqual([]);
    const g = { stops: [], nextBus: { line: "7", departsInMin: 6, source: "google", at: ago(0) } } as Pick<Ambient, "stops" | "nextBus">;
    expect(departuresFromAmbient(g, ago(0))[0]).toMatchObject({ kind: "scheduled", source: "Google" });
    // Transitous says per departure whether it is real-time; never credited to Google or Erdenet.
    const tr = { stopsSource: "transitous", nextBus: null, stops: [{ name: "Gare", distanceM: 120, lines: [{ route: "91", minutes: 4, live: false }, { route: "24", minutes: 9, live: true }] }] } as Pick<Ambient, "stops" | "nextBus" | "stopsSource">;
    expect(departuresFromAmbient(tr, ago(0)).map((d) => [d.route, d.kind, d.source])).toEqual([["91", "scheduled", "Transitous"], ["24", "live", "Transitous"]]);
    const tb = { stops: [], nextBus: { line: "29", departsInMin: 2, source: "transitous", kind: "live", at: ago(0) } } as Pick<Ambient, "stops" | "nextBus">;
    expect(departuresFromAmbient(tb, ago(0))[0]).toMatchObject({ kind: "live", source: "Transitous" });
  });
});

describe("AirCard", () => {
  it("number, category word, advice, scale marker and source", () => {
    const out = html(AirCard, { lang: "en", air: { aqi: 24, category: "good" }, pm25: 5, prov: { source: "Open-Meteo", ageS: 600, kind: "live" } });
    expect(out).toContain(">24<");
    expect(out).toContain("Good");
    expect(out).toContain("A good day to breathe easy.");
    expect(out).toContain("PM2.5");
    expect(out).toContain("Open-Meteo");
    expect(aqiPosition(0)).toBe(0);
    expect(aqiPosition(50)).toBeCloseTo(1 / 6);
    expect(aqiPosition(900)).toBe(1);
  });
  it("no data is said", () => {
    expect(html(AirCard, { lang: "de", air: null })).toContain("noch keine Daten zur Luftqualität");
  });
});

describe("SunCard", () => {
  it("calculates tomorrow's sunrise in the place's zone and the change in day length", () => {
    const s = sunTimes(NOW, 49.03, 104.08, "Asia/Ulaanbaatar");
    const local = (ms: number) => placeClock(ms, "Asia/Ulaanbaatar", "en").time;
    expect(local(s.rise!)).toMatch(/^0[78]:\d\d$/);
    expect(local(s.set!)).toMatch(/^1[67]:\d\d$/);
    expect(s.deltaMin).toBeLessThan(0); // November: days get shorter
    const out = html(SunCard, { lang: "en", now: NOW, coords: { lat: 49.03, lng: 104.08 }, timeZone: "Asia/Ulaanbaatar", autoScene: true, onAutoScene: noop });
    expect(out).toContain("Tomorrow&#x27;s sunrise");
    expect(out).toMatch(/shorter than today/);
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-checked="true"');
    expect(out).toContain("Calculated");
  });
  it("polar night is said, not drawn as a time", () => {
    const winter = Date.parse("2026-12-15T12:00:00Z");
    expect(sunTimes(winter, 78.2, 15.6, "Arctic/Longyearbyen").rise).toBeNull();
    expect(html(SunCard, { lang: "en", now: winter, coords: { lat: 78.2, lng: 15.6 }, timeZone: "Arctic/Longyearbyen", autoScene: false, onAutoScene: noop })).toContain("does not rise or set");
  });
});

describe("CityPanel", () => {
  it("parking and fuel only: cameras have their own sheet", () => {
    const out = html(CityPanel, { lang: "en", city: erdenet, cityName: "Erdenet", now: NOW });
    expect(out).toContain('role="tablist"');
    expect(out).not.toContain("<iframe");
    expect(cityTabs(erdenet)).toEqual(["parking", "fuel"]);
  });

  it("parking totals only known lots, marks them approx., and says unknown for the rest", () => {
    const out = html(CityPanel, { lang: "en", city: erdenet, now: NOW, tab: "parking" });
    expect(out).toMatch(/30 free.*of 100.*approx\./);
    expect(out).toContain("No data");
    expect(out).toContain("350 m");
  });

  it("fuel per type with its age; unknown when the station says nothing", () => {
    const out = html(CityPanel, { lang: "en", city: erdenet, now: NOW, tab: "fuel" });
    // Station reports are not live: the newest report's age, never the pulsing dot.
    expect(out).toContain('data-prov="estimated"');
    expect(out).not.toContain("v6-live-dot");
    expect(out).toContain("AI-92");
    expect(out).toContain("selling");
    expect(out).toContain("10 min. ago");
    expect(out).toMatch(/Diesel.*status unknown/);
  });

  it("a down feed says so; a city with no parking or fuel says there is nothing yet", () => {
    expect(html(CityPanel, { lang: "en", city: ub, cityName: "Ulaanbaatar", now: NOW })).toContain("No live city data for Ulaanbaatar yet.");
    const down = html(CityPanel, { lang: "en", city: { ...erdenet, fuel: null, down: ["fuel"] }, now: NOW, tab: "fuel" });
    expect(down).toContain("not answering");
    expect(html(CityPanel, { lang: "en", city: null, cityName: "Murun", now: NOW })).toContain("No live city data for Murun yet.");
  });
});

describe("TopNav, AgentPanel, Card states", () => {
  it("nav marks the current view and shows the shortcut", () => {
    const out = html(TopNav, { lang: "en", view: "map", onView: noop, onSearch: noop, onSettings: noop });
    expect(out).toMatch(/aria-current="page"[^>]*>City map/);
    expect(out).toContain("Ctrl K");
    expect(out).toContain('aria-label="Settings"');
    expect(out).not.toContain("Back to my location");
    expect(html(TopNav, { lang: "en", view: "overview", onView: noop, onSearch: noop, onSettings: noop, onMyLocation: noop })).toContain("Back to my location");
  });

  it("agent panel frames the given orb, thread and composer with source chips", () => {
    const props: ComponentProps<typeof AgentPanel> = {
      lang: "en",
      name: "Hermes",
      orb: createElement("div", { id: "orb" }),
      messages: createElement("div", { id: "thread" }),
      composer: createElement("div", { id: "composer" }),
      opener: "A local instinct.",
      sources: [
        { label: "Weather", source: "Google", ageS: 120, kind: "estimated" },
        { label: "Traffic", source: "Google", ageS: 60, kind: "estimated" },
      ],
      model: "Aspire agent",
      onExpand: noop,
    };
    const out = html(AgentPanel, props);
    expect(out).toContain('<aside aria-label="Hermes, Your city agent"');
    for (const id of ["orb", "thread", "composer"]) expect(out).toContain(`id="${id}"`);
    expect(out).toContain("2 min. ago");
    // Two Google chips stay apart by topic.
    expect(out).toMatch(/Weather<\/span><span[^>]*>Google/);
    expect(out).toMatch(/Traffic<\/span><span[^>]*>Google/);
    expect(out).toContain("Expand");
    // The thread scrolls in its own region, padded and faded at the top so no half-cut line shows there.
    expect(out).toMatch(/data-thread-scroll="true" class="[^"]*overflow-y-auto[^"]*pt-4[^"]*mask-image/);
    expect(out.indexOf('id="orb"')).toBeLessThan(out.indexOf("data-thread-scroll"));
  });

  it("news uses the v6 card shell, not the old HUD panel", () => {
    for (const lang of LANGS) {
      const out = html(NewsStrip, { lang, country: "mn" });
      expect(out).toContain("v6-card");
      expect(out).not.toMatch(/class="hud|text-hud|text-body|text-label/);
      expect(out).toContain("data-skeleton");
      expect(out).not.toMatch(SYMBOLS);
    }
  });

  it("loading, error with Retry, and offline with the data's age", () => {
    const loading = html(Card, { title: "X", icon: null, lang: "en", state: "loading" });
    expect(loading).toContain("data-skeleton");
    expect(loading).toContain('aria-busy="true"');
    const error = html(Card, { title: "X", icon: null, lang: "ru", state: "error", onRetry: noop });
    expect(error).toContain("Повторить");
    const offline = html(Card, { title: "X", icon: null, lang: "en", state: "offline", prov: { source: "S", ageS: 3600, kind: "live" }, children: "kept" });
    expect(offline).toMatch(/Offline\. Showing data from 1 hr\. ago/);
    expect(offline).toContain("kept");
    expect(html(Card, { title: "X", icon: null, lang: "en", state: "offline", children: "kept" })).toContain("Showing the last data received");
    const bad = html(Card, { title: "X", icon: null, lang: "en", prov: { source: "S", ageS: 1, kind: "live", href: "javascript:alert(1)" } });
    expect(bad).not.toContain("javascript:");
  });

  it("renders in all five languages with no emojis", () => {
    for (const lang of LANGS) {
      const out = [
        html(TrafficCard, { lang, now: NOW, city: "Erdenet", traffic: erdenet.traffic, credit: erdenet.credit }),
        html(CityPanel, { lang, city: erdenet, now: NOW, tab: "fuel" }),
        html(HeroCard, { lang, place: "Erdenet", sky, weather, photo, timeZone: "Asia/Ulaanbaatar", now: NOW, onOpenMap: noop }),
      ].join("");
      expect(out).not.toMatch(SYMBOLS);
      expect(out).toContain(V6[lang].openMap);
    }
  });
});
