// LiveMap: reading GET /api/transit, server render in every language, and the loader without a key.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { LiveMap, parseTransit } from "@/components/aspire/LiveMap";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { LANGS } from "@/lib/lang";

// Shape returned by app/api/transit/route.ts (already parsed by lib/erdenet-transit).
const API = {
  vehicles: [{ id: "86715075", name: "7316 ОРО", lat: 49.01636, lng: 104.0043283, speedKph: 22, heading: 161, updatedAt: "2026-11-21T00:55:54.000Z", routeId: "64" }],
  stations: [{ id: "s1", name: "Бүрэн бүст дэлгүүр", lat: 48.9853864192734, lng: 104.031658904291, routeIds: ["64"] }],
  paths: [{ name: "Баян Тал Эх", routeIds: ["64"], color: "#53DBD0", coords: [[49.03054, 104.05529], [49.031, 104.056]] }],
  routes: [{ id: "64", name: "Ч:3 БАЯН ТАЛ", short: "Ч:3", color: "#53DBD0" }],
  updatedAt: "2026-11-21T00:55:54.000Z",
  credit: "Орхон ТКХДТ",
};

describe("parseTransit", () => {
  it("keeps the route's lists and timestamp", () => {
    const f = parseTransit(API);
    expect(f.stations[0]).toMatchObject({ id: "s1", lat: 48.9853864192734, lng: 104.031658904291 });
    expect(f.paths[0].coords[0]).toEqual([49.03054, 104.05529]);
    expect(f.vehicles[0]).toMatchObject({ routeId: "64", speedKph: 22 });
    expect(f.updatedAt).toBe(API.updatedAt);
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
      expect(html.match(/aria-label="[^"]+"/g)?.length).toBeGreaterThanOrEqual(6);
      expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    const mn = renderToString(createElement(LiveMap, { center: null, lang: "mn", erdenet: true, onClose: () => {} }));
    expect(mn).toContain('aria-label="Томруулах"');
    expect(mn).toContain('aria-label="Газрын зургийг хаах"');
    expect(mn).not.toContain("Нийтийн тээвэр"); // no Google transit layer toggle in Erdenet
  });

  it("loader resolves to null without a browser key", async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    await expect(loadGoogleMaps()).resolves.toBeNull();
  });
});
