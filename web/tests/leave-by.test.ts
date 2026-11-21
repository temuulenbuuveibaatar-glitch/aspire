import { describe, expect, it } from "vitest";
import { leaveBy, tripTime } from "@/lib/leave-by";

const NOW = new Date("2026-11-20T22:00:00+08:00"); // the night before, in Erdenet
const UB = "Asia/Ulaanbaatar";

describe("tripTime", () => {
  it("no time = depart now (today's behaviour)", () => {
    expect(tripTime("", "", "drive", NOW, UB)).toEqual({ departureTime: NOW.toISOString(), zone: UB, zoneUnknown: false });
  });

  it("depart_at is read as the person's local wall clock", () => {
    expect(tripTime("2026-11-21 07:00", "", "transit", NOW, UB)).toMatchObject({ departureTime: "2026-11-20T23:00:00.000Z" });
    expect(tripTime("2026-11-21T07:00", "", "drive", NOW, "Europe/Berlin")).toMatchObject({ departureTime: "2026-11-21T06:00:00.000Z" });
  });

  it("arrive_by: arrivalTime only for transit; drive and walk depart at the target and work back", () => {
    const transit = tripTime("", "2026-11-21 06:00", "transit", NOW, UB);
    expect(transit).toEqual({ arrivalTime: "2026-11-20T22:00:00.000Z", zone: UB, zoneUnknown: false });
    for (const mode of ["drive", "walk"] as const) {
      const r = tripTime("", "2026-11-21 06:00", mode, NOW, UB);
      expect(r).not.toHaveProperty("arrivalTime");
      expect(r).toMatchObject({ departureTime: "2026-11-20T22:00:00.000Z", arriveBy: new Date("2026-11-20T22:00:00.000Z") });
    }
  });

  it("rejects past, too far ahead, both times, and malformed or impossible dates", () => {
    const err = (d: unknown, a: unknown) => (tripTime(d, a, "transit", NOW, UB) as { error?: string }).error;
    expect(err("2026-11-20 21:00", "")).toMatch(/passed/);
    expect(err("2026-11-28 07:00", "")).toMatch(/7 days/);
    expect(err("2026-11-21 07:00", "2026-11-21 08:00")).toMatch(/not both/);
    for (const bad of ["tomorrow 7", "2026-02-30 07:00", "2026-11-21 25:00", "2026-11-21 07:00Z"]) expect(err(bad, "")).toMatch(/YYYY-MM-DD/);
  });

  it("a non-string time is ignored (depart now), like str() elsewhere", () => {
    expect(tripTime(42, null, "drive", NOW, UB)).toMatchObject({ departureTime: NOW.toISOString() });
  });

  it("an unknown zone is flagged (read as UTC)", () => {
    expect(tripTime("", "", "walk", NOW, undefined)).toMatchObject({ zone: "UTC", zoneUnknown: true });
  });
});

describe("leaveBy", () => {
  it("arrival minus the travel minutes, in local time", () => {
    const r = leaveBy(new Date("2026-11-20T22:00:00Z"), 35, NOW, UB);
    expect(r).toMatchObject({ leaveAt: "05:25", leaveDate: "2026-11-21" });
    expect(r).not.toHaveProperty("leaveNow");
  });

  it("too late already: leave now and say by how much", () => {
    expect(leaveBy(new Date(NOW.getTime() + 20 * 60_000), 30, NOW, UB)).toMatchObject({ leaveNow: true, lateByMinutes: 10 });
  });
});
