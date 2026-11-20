import { describe, expect, it } from "vitest";
import { findStop, localMinutes, nextArrivals, type NextBusResult } from "@/lib/transit";

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

describe("findStop", () => {
  it("matches names in every language", () => {
    expect(findStop("Төв талбай")?.id).toBe("center");
    expect(findStop("central square")?.id).toBe("center");
    expect(findStop("Больница")?.id).toBe("hospital");
    expect(findStop("火车站")?.id).toBe("railway");
    expect(findStop("Bahnhof")?.id).toBe("railway");
    expect(findStop("market")?.id).toBe("market");
  });
  it("returns undefined for unknown stops", () => {
    expect(findStop("Paris")).toBeUndefined();
  });
});

describe("nextArrivals", () => {
  it("computes minutes until the next buses, soonest first", () => {
    // Route 1 departs 06:30 every 15 min; Central Square is +9 -> 06:39, 06:54...
    // Route 12 departs 06:45 every 12 min; Central Square is +8 -> 06:53, 07:05...
    // Route 5 departs 07:00 every 20 min; Central Square is +14 -> 07:14...
    const r = nextArrivals("center", at("06:40")) as NextBusResult;
    expect(r.arrivals[0]).toMatchObject({ route: "12", minutes: 13, time: "06:53" });
    expect(r.arrivals[1]).toMatchObject({ route: "1", minutes: 14, time: "06:54" });
    expect(r.arrivals.map((a) => a.minutes)).toEqual([...r.arrivals.map((a) => a.minutes)].sort((a, b) => a - b));
  });

  it("a bus arriving right now counts as 0 minutes", () => {
    const r = nextArrivals("center", at("06:39"), { route: "1" }) as NextBusResult;
    expect(r.arrivals[0]).toMatchObject({ minutes: 0, time: "06:39" });
  });

  it("filters by route", () => {
    const r = nextArrivals("center", at("12:00"), { route: "5" }) as NextBusResult;
    expect(r.arrivals.every((a) => a.route === "5")).toBe(true);
  });

  it("after the last bus, reports the first bus tomorrow", () => {
    const r = nextArrivals("hospital", at("23:30")) as NextBusResult;
    expect(r.arrivals).toHaveLength(0);
    expect(r.tomorrow).toContainEqual({ route: "5", time: "07:22" });
    expect(r.tomorrow).toContainEqual({ route: "12", time: "06:45" });
  });

  it("unknown stop returns the list of known stops", () => {
    const r = nextArrivals("Paris", at("12:00"));
    expect("error" in r && r.knownStops.length).toBeGreaterThan(0);
  });
});

describe("localMinutes", () => {
  it("uses Ulaanbaatar time (UTC+8)", () => {
    expect(localMinutes(new Date("2026-11-20T00:30:00Z"))).toBe(at("08:30"));
  });
});
