// The main screen renders on the server (empty state) in the v6 layout, with no emojis or arrow glyphs.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ userId: "u1", isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never) }));

describe("transit from a snapshot", () => {
  const NOW = Date.parse("2026-11-21T10:00:00Z");
  it("credits Transitous when Google's stops have no lines and the bus is Transitous's", async () => {
    const { transitFrom } = await import("@/components/Assistant");
    const { TRANSITOUS_SOURCES } = await import("@/components/v6/TransitCard");
    const a = {
      locatedBy: "device",
      stopsSource: "google",
      stops: [{ name: "Gare", distanceM: 240 }],
      nextBus: { line: "29", departsInMin: 6, source: "transitous", kind: "scheduled", at: new Date(NOW).toISOString() },
    } as never;
    const t = transitFrom(a, NOW, NOW);
    expect(t.prov).toMatchObject({ source: "Transitous", href: TRANSITOUS_SOURCES });
    // The walk is to the stop the departures are from: none here.
    expect(t.walkMin).toBeNull();
  });
  it("gives no walk or leave time for a typed city (its centre is not the person)", async () => {
    const { transitFrom } = await import("@/components/Assistant");
    const stops = [{ name: "Gare", distanceM: 400, lines: [{ route: "24", minutes: 9, live: true }] }];
    const city = transitFrom({ locatedBy: "city", stopsSource: "transitous", stops, nextBus: null } as never, NOW, NOW);
    expect(city.walkMin).toBeNull();
    const device = transitFrom({ locatedBy: "device", stopsSource: "transitous", stops, nextBus: null } as never, NOW, NOW);
    expect(device.walkMin).toBe(5);
  });
  it("Google stops with no departure from anyone are stops only, never 'scheduled'", async () => {
    const { transitFrom } = await import("@/components/Assistant");
    const t = transitFrom({ locatedBy: "city", stopsSource: "google", stops: [{ name: "X", distanceM: 300 }], nextBus: null } as never, NOW, NOW);
    expect(t.coverage).toBe("static");
    expect(t.departures).toEqual([]);
    // Listed with "No timetable data"; no distance from a typed city's centre.
    expect(t.stops).toHaveLength(1);
    expect(t.stops[0].name).toBe("X");
    expect(Number.isFinite(t.stops[0].distanceM)).toBe(false);
    expect(t.prov).toMatchObject({ source: "Google", kind: "static", ageS: null });
    const near = transitFrom({ locatedBy: "device", stopsSource: "google", stops: [{ name: "X", distanceM: 300 }], nextBus: null } as never, NOW, NOW);
    expect(near.stops[0].distanceM).toBe(300);
  });
  it("names the stop a departure leaves from, never another source's nearest stop", async () => {
    const { transitFrom } = await import("@/components/Assistant");
    const at = new Date(NOW).toISOString();
    // Erdenet: the nearest station has no arrivals, the second one does.
    const erd = transitFrom({
      locatedBy: "device", stopsSource: "erdenet-live",
      stops: [{ name: "Төв", distanceM: 50 }, { name: "Зах", distanceM: 400, lines: [{ route: "1", minutes: 4 }] }],
      nextBus: { line: "1", departsInMin: 4, source: "erdenet-live", kind: "estimate", at, stop: "Зах" },
    } as never, NOW, NOW);
    expect(erd.stopName).toBe("Зах");
    // OpenStreetMap stops with a Google bus (from a stop Google does not name): no stop name.
    const g = transitFrom({
      locatedBy: "device", stops: [{ name: "OSM stop", distanceM: 80, kind: "stop", source: "osm" }],
      nextBus: { line: "M10", departsInMin: 7, source: "google", kind: "scheduled", at },
    } as never, NOW, NOW);
    expect(g.coverage).toBe("scheduled");
    expect(g.stopName).toBeNull();
  });
});

describe("departures from stop lines", () => {
  it("only Erdenet's minutes are estimates; another source's lines are its timetable", async () => {
    const { departuresFromAmbient } = await import("@/components/v6/TransitCard");
    const stops = [{ name: "S", distanceM: 1, lines: [{ route: "7", minutes: 3 }] }];
    expect(departuresFromAmbient({ stops, stopsSource: "erdenet-live", nextBus: null }, "2026-11-21T10:00:00Z")[0].kind).toBe("estimated");
    expect(departuresFromAmbient({ stops, stopsSource: "google", nextBus: null }, "2026-11-21T10:00:00Z")[0].kind).toBe("scheduled");
    expect(departuresFromAmbient({ stops: [{ ...stops[0], lines: [{ route: "7", minutes: 3, live: true }] }], stopsSource: "transitous", nextBus: null }, "2026-11-21T10:00:00Z")[0].kind).toBe("live");
  });
});

describe("Assistant (server render)", () => {
  it("renders the empty state without crashing and without emojis", async () => {
    const { default: Assistant } = await import("@/components/Assistant");
    const html = renderToString(createElement(Assistant));
    expect(html).toContain(">aspire<");
    expect(html).toContain("aspire-core");
    expect(html).toContain("Skip to conversation");
    // The v6 layout: hero, the four cards and the agent panel; no taxi readout anywhere.
    for (const part of ["Open city map", "Nearby transit", "Live traffic", "Air quality", "Tomorrow&#x27;s sunrise", "Your city agent"]) expect(html).toContain(part);
    expect(html).not.toMatch(/taxi/i);
    expect(html).not.toMatch(/[\p{Extended_Pictographic}\u{2190}-\u{21FF}\u{2600}-\u{27BF}]/u);
  });
});
