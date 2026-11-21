// Pen test of /api/push: forged hosts (SSRF), another user's id in the body, unsubscribe replay,
// the per-user cap, and signed-out calls.
import { createECDH, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

let fake = createFakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fake.client }));
const user = vi.hoisted(() => ({ current: { id: "user_a", email: null } as { id: string; email: null } | null }));
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), requireUser: async () => user.current }));

const vapid = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
const ua = createECDH("prime256v1");
ua.generateKeys();
const keys = { p256dh: ua.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") };
const ep = (n: number | string) => `https://fcm.googleapis.com/fcm/send/${n}`;
let ip = 0;

const call = async (method: "POST" | "DELETE", body: unknown) => {
  const { POST, DELETE } = await import("@/app/api/push/route");
  const req = new Request("http://localhost/api/push", { method, headers: { "content-type": "application/json", "x-real-ip": `10.0.0.${++ip}` }, body: JSON.stringify(body) });
  return (method === "POST" ? POST : DELETE)(req);
};

beforeEach(() => {
  vi.resetModules(); // a fresh per-user rate limit for each test
  fake = createFakeSupabase();
  user.current = { id: "user_a", email: null };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", Buffer.concat([Buffer.from([4]), Buffer.from(vapid.x!, "base64url"), Buffer.from(vapid.y!, "base64url")]).toString("base64url"));
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.d!);
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/push", () => {
  it("stores the subscription under the session user, ignoring a body user_id", async () => {
    const res = await call("POST", { subscription: { endpoint: ep(1), keys }, user_id: "user_victim", userId: "user_victim", lang: "mn", hideText: true });
    expect(res.status).toBe(200);
    expect(fake.table("push_subscriptions")).toEqual([expect.objectContaining({ endpoint: ep(1), user_id: "user_a", lang: "mn", hide_text: true })]);
  });

  it("rejects forged endpoint hosts and bad keys", async () => {
    for (const endpoint of ["https://169.254.169.254/latest/meta-data", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x", "https://localhost:3000/api/ask"]) {
      expect((await call("POST", { subscription: { endpoint, keys } })).status).toBe(400);
    }
    expect((await call("POST", { subscription: { endpoint: ep(1), keys: { ...keys, auth: "x" } } })).status).toBe(400);
    expect(fake.table("push_subscriptions")).toHaveLength(0);
  });

  it("keeps at most 5 devices per person, newest first", async () => {
    for (let i = 1; i <= 7; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 21, 10, i)));
      expect((await call("POST", { subscription: { endpoint: ep(i), keys } })).status).toBe(200);
    }
    vi.useRealTimers();
    expect(fake.table("push_subscriptions").map((r) => r.endpoint).sort()).toEqual([3, 4, 5, 6, 7].map(ep).sort());
  });

  it("unsubscribe removes only the caller's row; a replay or another user's endpoint is a no-op", async () => {
    fake.table("push_subscriptions").push({ endpoint: ep("b"), user_id: "user_b", ...keys, lang: "en", hide_text: false, created_at: "2026-11-21T00:00:00Z" });
    await call("POST", { subscription: { endpoint: ep(1), keys } });
    expect((await call("DELETE", { endpoint: ep("b") })).status).toBe(200);
    expect((await call("DELETE", { endpoint: ep(1) })).status).toBe(200);
    expect((await call("DELETE", { endpoint: ep(1) })).status).toBe(200);
    expect(fake.table("push_subscriptions").map((r) => r.endpoint)).toEqual([ep("b")]);
  });

  it("refuses signed-out calls and answers 503 without VAPID keys", async () => {
    user.current = null;
    expect((await call("POST", { subscription: { endpoint: ep(1), keys } })).status).toBe(401);
    user.current = { id: "user_a", email: null };
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect((await call("POST", { subscription: { endpoint: ep(1), keys } })).status).toBe(503);
  });
});
