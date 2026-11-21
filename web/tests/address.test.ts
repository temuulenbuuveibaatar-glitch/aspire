import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAddressCache, streetAddress } from "@/lib/address";

function mockFetch(routes: Array<[string, unknown]>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    calls.push(String(u));
    const hit = routes.find(([part]) => String(u).includes(part));
    if (!hit) throw new TypeError("network down");
    return Response.json(hit[1]);
  }));
  return calls;
}

beforeEach(() => { resetAddressCache(); vi.stubEnv("GOOGLE_MAPS_API_KEY", "k"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("streetAddress", () => {
  it("uses Google's street address when it has one", async () => {
    mockFetch([["geocode.googleapis.com", { results: [{ formattedAddress: "Unter den Linden 1, Berlin" }] }]]);
    expect(await streetAddress({ lat: 52.517, lng: 13.389 }, "de")).toBe("Unter den Linden 1, Berlin");
  });

  it("falls back to OpenStreetMap when Google only knows a plus code", async () => {
    const calls = mockFetch([
      ["geocode.googleapis.com", { results: [{ formattedAddress: "22GV+RX4, Эрдэнэт, Орхон" }] }],
      ["nominatim.openstreetmap.org", { address: { road: "Кувейтийн гудамж", house_number: "6-1", suburb: "Баян-Өндөр", city: "Эрдэнэт" } }],
    ]);
    expect(await streetAddress({ lat: 49.027, lng: 104.045 }, "mn")).toBe("Кувейтийн гудамж 6-1, Баян-Өндөр");
    // Cached per ~11 m: no second lookup.
    await streetAddress({ lat: 49.02701, lng: 104.04501 }, "mn");
    expect(calls.length).toBe(2);
  });

  it("returns null when both are down", async () => {
    mockFetch([]);
    expect(await streetAddress({ lat: 1, lng: 1 }, "en")).toBeNull();
  });
});
