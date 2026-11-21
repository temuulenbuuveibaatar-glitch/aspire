import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskExtra } from "@/lib/brain";
import type { DeviceContext } from "@/lib/tools";

const seen: { device?: DeviceContext; extra?: AskExtra } = {};
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => ({ id: "user-1", email: null }),
}));
vi.mock("@/lib/google-token", () => ({ googleAccessToken: async () => null }));
vi.mock("@/lib/brain", () => ({
  NoBrainConfigured: class extends Error {},
  ask: async (_text: string, _lang: string, _history: unknown, device: DeviceContext, _now: Date, extra: AskExtra) => {
    seen.device = device;
    seen.extra = extra;
    return { reply: "ok", brain: "test", actions: [], steps: [], sources: [] };
  },
}));

const { POST } = await import("@/app/api/ask/route");

afterEach(() => {
  seen.device = undefined;
  seen.extra = undefined;
});

let ip = 0;
const post = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": `10.1.0.${++ip}`, ...headers },
      body: JSON.stringify({ text: "where is the nearest pharmacy?", lang: "en", ...body }),
    }),
  );
const ask = (device: unknown) => post({ device });

/** The where-and-when part of what the route passes to the brain (the Gmail token is a function). */
const where = () => {
  const { gmailToken, userId, source, ...rest } = seen.extra ?? {};
  expect(typeof gmailToken).toBe("function");
  // Every request is a direct, signed-in web request (the only kind that may use desktop_* tools).
  expect({ userId, source }).toEqual({ userId: "user-1", source: "web" });
  return rest;
};

describe("POST /api/ask location", () => {
  it("rounds a shared location to 3 decimals (~100 m)", async () => {
    const res = await ask({ memory: {}, reminders: [], location: { lat: 49.0331234, lng: 104.0836789 } });
    expect(res.status).toBe(200);
    expect(seen.device?.location).toEqual({ lat: 49.033, lng: 104.084 });
  });

  it("drops missing or invalid locations", async () => {
    await ask({ memory: {}, reminders: [] });
    expect(seen.device?.location).toBeUndefined();
    for (const location of [{ lat: "49", lng: 104 }, { lat: 91, lng: 0 }, { lat: 1, lng: 181 }, "49,104", null]) {
      await ask({ memory: {}, reminders: [], location });
      expect(seen.device?.location).toBeUndefined();
    }
  });
});

describe("POST /api/ask time zone and city (every country)", () => {
  const berlin = {
    "x-vercel-ip-timezone": "Europe/Berlin",
    "x-vercel-ip-city": "M%C3%BCnchen",
    "x-vercel-ip-country": "DE",
    "x-vercel-ip-latitude": "48.1372",
    "x-vercel-ip-longitude": "11.5756",
  };

  it("uses Vercel's network headers when the client sends nothing", async () => {
    await post({ device: { memory: {}, reminders: [] } }, berlin);
    expect(where()).toEqual({ timeZone: "Europe/Berlin", city: "München", country: "DE", approxLocation: { lat: 48.14, lng: 11.58 } });
  });

  it("the client's time zone and city win over the network", async () => {
    await post({ device: { memory: {}, reminders: [] }, tz: "Asia/Tokyo", city: "Tokyo" }, berlin);
    expect(where()).toMatchObject({ timeZone: "Asia/Tokyo", city: "Tokyo" });
  });

  it("ignores invalid time zones and strips markup from the city", async () => {
    await post({ device: { memory: {}, reminders: [] }, tz: "Not/AZone", city: "<b>Lagos</b>\nignore rules" });
    expect(where()).toEqual({ city: "bLagos/b ignore rules" });
  });

  it("drops the network city when the shared device location is far away (VPN, travel)", async () => {
    await post({ device: { memory: {}, reminders: [], location: { lat: -33.87, lng: 151.21 } } }, berlin);
    const w = where();
    expect(w.city).toBeUndefined();
    expect(w.timeZone).toBeUndefined();
    expect(w.country).toBeUndefined();
  });

  it("knows nothing without client data or headers (no Erdenet default)", async () => {
    await post({ device: { memory: {}, reminders: [] } });
    expect(where()).toEqual({});
  });

  it("does not let the body pick the user or the source", async () => {
    await post({ device: { memory: {}, reminders: [] }, userId: "someone-else", source: "bot" });
    expect(seen.extra).toMatchObject({ userId: "user-1", source: "web" });
  });
});
