import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceContext } from "@/lib/tools";

const seen: { device?: DeviceContext } = {};
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => ({ id: "user-1", email: null }),
}));
vi.mock("@/lib/google-token", () => ({ googleAccessToken: async () => null }));
vi.mock("@/lib/brain", () => ({
  NoBrainConfigured: class extends Error {},
  ask: async (_text: string, _lang: string, _history: unknown, device: DeviceContext) => {
    seen.device = device;
    return { reply: "ok", brain: "test", actions: [], steps: [], sources: [] };
  },
}));

const { POST } = await import("@/app/api/ask/route");

afterEach(() => {
  seen.device = undefined;
});

let ip = 0;
const ask = (device: unknown) =>
  POST(
    new Request("http://localhost/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": `10.1.0.${++ip}` },
      body: JSON.stringify({ text: "where is the nearest pharmacy?", lang: "en", device }),
    }),
  );

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
