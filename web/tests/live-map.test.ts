// LiveMap (MapLibre + OpenFreeMap): reading GET /api/transit, server render in every language, and the
// BusSheet that tells only what the feed says (plate, matched route, speed, heading, data age, stale).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { LiveMap, osmUrl, parseTransit } from "@/components/aspire/LiveMap";
import { age, BusSheet, compass, isStale } from "@/components/aspire/BusSheet";
import { LANGS } from "@/lib/lang";

// Shape returned by app/api/transit/route.ts (already parsed by lib/erdenet-transit).
const API = {
  vehicles: [{ id: "86715075", name: "0216 ОРХ", lat: 49.01636, lng: 104.0043283, speedKph: 22, heading: 161, updatedAt: "2026-11-21T00:55:54.000Z", routeId: "64" }],
  stations: [{ id: "s1", name: "Бүрэн бүст дэлгүүр", lat: 48.9853864192734, lng: 104.031658904291, routeIds: ["64"] }],
  paths: [{ name: "Баян Тал Эх", routeIds: ["64"], color: "#53DBD0", coords: [[49.03054, 104.05529], [49.031, 104.056]] }],
  routes: [{ id: "64", name: "Ч:3 БАЯН ТАЛ", short: "Ч:3", color: "#53DBD0" }],
  updatedAt: "2026-11-21T00:55:54.000Z",
  credit: "Орхон ТКХДТ",
};
const SYMBOLS = /[\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]|\p{Extended_Pictographic}/u;

describe("parseTransit", () => {
  it("keeps the route's lists and timestamp", () => {
    const f = parseTransit(API);
    expect(f.stations[0]).toMatchObject({ id: "s1", lat: 48.9853864192734, lng: 104.031658904291 });
    expect(f.paths[0].coords[0]).toEqual([49.03054, 104.05529]);
    expect(f.vehicles[0]).toMatchObject({ routeId: "64", speedKph: 22, updatedAt: API.vehicles[0].updatedAt });
    expect(f.updatedAt).toBe(API.updatedAt);
  });

  it("rebases a bus's time on this device's clock when the server sends its age", () => {
    const now = Date.parse("2030-01-01T00:00:00Z");
    const f = parseTransit({ vehicles: [{ ...API.vehicles[0], ageS: 75 }] }, now);
    expect(f.vehicles[0].updatedAt).toBe("2029-12-31T23:58:45.000Z");
    expect(isStale(f.vehicles[0], now)).toBe(true);
  });

  it("turns junk into empty lists", () => {
    expect(parseTransit("<html>")).toEqual({ stations: [], paths: [], routes: [], vehicles: [], updatedAt: null });
    expect(parseTransit({ error: "unavailable" }).vehicles).toEqual([]);
  });
});

describe("LiveMap", () => {
  it("renders on the server with labelled controls in every language and no emojis", () => {
    for (const lang of LANGS) {
      const html = renderToString(createElement(LiveMap, { center: { lat: 49.03, lng: 104.04 }, lang, onClose: () => {} }));
      expect(html.match(/aria-label="[^"]+"/g)?.length).toBeGreaterThanOrEqual(5); // map, close, zoom in/out, locate
      expect(html).not.toMatch(SYMBOLS);
    }
    const mn = renderToString(createElement(LiveMap, { center: null, lang: "mn", erdenet: true, onClose: () => {} }));
    expect(mn).toContain('aria-label="Томруулах"');
    expect(mn).toContain('aria-label="Газрын зургийг хаах"');
    expect(mn).not.toContain("Замын хөдөлгөөн"); // no traffic toggle: OpenStreetMap has no live traffic
  });

  it("uses no Google Maps JS or browser key, and loads maplibre only when mounted", () => {
    const src = readFileSync(fileURLToPath(new URL("../components/aspire/LiveMap.tsx", import.meta.url)), "utf8");
    expect(src).not.toMatch(/maps\.googleapis|GOOGLE_MAPS_BROWSER_KEY|google-maps-loader/);
    expect(src).toContain('import("maplibre-gl")');
    expect(src).not.toMatch(/^import (?!type )[^"]*from "maplibre-gl"/m); // only `import type` statically
    expect(src).toContain("tiles.openfreemap.org/styles/dark");
    expect(src).toContain("OpenStreetMap</a>");
  });

  it("links the fallback to OpenStreetMap at the person's position", () => {
    expect(osmUrl({ lat: 49.03, lng: 104.04 })).toBe("https://www.openstreetmap.org/?mlat=49.03000&mlon=104.04000#map=16/49.03000/104.04000");
    expect(osmUrl(null)).toBe("https://www.openstreetmap.org/");
  });
});

describe("BusSheet", () => {
  const bus = API.vehicles[0];
  const route = API.routes[0];

  it("turns a heading into a compass word in every language", () => {
    expect(compass(0, "en")).toBe("north");
    expect(compass(161, "en")).toBe("south");
    expect(compass(359, "en")).toBe("north");
    expect(compass(225, "ru")).toBe("на юго-запад");
    for (const lang of LANGS) expect(compass(90, lang)).toBeTruthy();
  });

  it("says how old a position is and marks it stale after 60 s", () => {
    const t = Date.parse(bus.updatedAt);
    expect(age(bus.updatedAt, t + 12_000, "en")).toBe("12 s ago");
    expect(age(bus.updatedAt, t + 185_000, "en")).toBe("3 min ago");
    expect(age(bus.updatedAt, t + 3 * 3600_000, "en")).toBe("3 h ago");
    expect(isStale(bus, t + 59_000)).toBe(false);
    expect(isStale(bus, t + 61_000)).toBe(true);
    expect(isStale({ updatedAt: "garbage" }, t)).toBe(true);
    expect(age("garbage", t, "en")).toBe("unknown");
  });

  it("shows plate, matched route, speed, heading, the stale warning and the credit, and nothing invented", () => {
    for (const lang of LANGS) {
      const html = renderToString(createElement(BusSheet, { bus: { ...bus, updatedAt: "2020-01-01T00:00:00.000Z" }, route, lang })).replace(/<!-- -->/g, "");
      expect(html).toContain("0216 ОРХ");
      expect(html).toMatch(/>Ч:3<\/span><span>БАЯН ТАЛ</); // short code once, then the destination

      expect(html).toMatch(/22 (km\/h|км\/ц|公里\/小时|км\/ч)/);
      expect(html).toContain("161°");
      expect(html).toContain("Орхон ТКХДТ");
      expect(html).toContain('role="status"'); // years old: stale warning
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(/\bETA\b|arriv/i);
    }
    const unknown = renderToString(createElement(BusSheet, { bus: { ...bus, routeId: null }, route: null, lang: "en" }));
    expect(unknown).toContain("Not identified");
    // Missing speed: "unknown", not 0; a stopped bus shows no direction of travel.
    const blank = renderToString(createElement(BusSheet, { bus: { ...bus, speedKph: null, heading: null }, route, lang: "en" })).replace(/<!-- -->/g, "");
    expect(blank).toContain(">unknown<");
    expect(blank).not.toContain("0 km/h");
    expect(blank).not.toContain("Heading");
    const parked = renderToString(createElement(BusSheet, { bus: { ...bus, speedKph: 0 }, route, lang: "en" })).replace(/<!-- -->/g, "");
    expect(parked).toContain("0 km/h");
    expect(parked).not.toContain("161°");
    const down = renderToString(createElement(BusSheet, { bus: { ...bus, updatedAt: new Date().toISOString() }, route, lang: "en", feedDown: true }));
    expect(down).toContain("live feed is not answering");
  });
});
