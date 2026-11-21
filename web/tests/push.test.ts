import { createDecipheriv, createECDH, createHmac, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { deliverPush, encryptPayload, parseSubscription, pushEndpoint, vapidAuthorization } from "@/lib/push";

const b = (s: string) => Buffer.from(s, "base64url");

describe("push encryption (RFC 8291)", () => {
  it("matches the RFC 8291 appendix A example byte for byte", () => {
    const as = createECDH("prime256v1");
    as.setPrivateKey(b("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"));
    const out = encryptPayload(
      Buffer.from("When I grow up, I want to be a watermelon"),
      b("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
      b("BTBZMqHH6r4Tts7J_aSIgg"),
      as,
      b("DGv6ra1nlYgDCS1FRnbzlw"),
    );
    expect(out.toString("base64url")).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("a receiver with its private key and auth secret decrypts a random-key message", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const authSecret = Buffer.alloc(16, 7);
    const body = encryptPayload(Buffer.from('{"body":"Reminder: pills"}'), ua.getPublicKey(), authSecret);
    const salt = body.subarray(0, 16);
    const asPublic = body.subarray(21, 21 + body[20]);
    const h = (k: Buffer, ...d: Buffer[]) => d.reduce((m, x) => m.update(x), createHmac("sha256", k)).digest();
    const ikm = h(h(authSecret, ua.computeSecret(asPublic)), Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic, Buffer.from([1]));
    const prk = h(salt, ikm);
    const d = createDecipheriv("aes-128-gcm", h(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16), h(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12));
    const sealed = body.subarray(21 + body[20]);
    d.setAuthTag(sealed.subarray(-16));
    const plain = Buffer.concat([d.update(sealed.subarray(0, -16)), d.final()]);
    expect(plain.toString()).toBe('{"body":"Reminder: pills"}\x02');
  });
});

describe("push trust boundaries", () => {
  const point = createECDH("prime256v1");
  point.generateKeys();
  const keys = { p256dh: point.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") };

  it("accepts only https endpoints on the browser push services (SSRF)", () => {
    for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x", "https://web.push.apple.com/QH"]) {
      expect(pushEndpoint(ok)).toBe(ok);
    }
    for (const bad of [
      "http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x",
      "https://evil.example/fcm.googleapis.com", "https://169.254.169.254/latest", "https://localhost/x", "https://a.b.push.services.mozilla.com/x", "javascript:alert(1)", 42, null,
      "https://fcm.googleapis.com/" + "a".repeat(1100),
    ]) expect(pushEndpoint(bad)).toBeNull();
  });

  it("checks key lengths and the uncompressed-point prefix", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    expect(parseSubscription({ endpoint, keys })).toEqual({ endpoint, ...keys });
    expect(parseSubscription({ endpoint, keys: { ...keys, auth: Buffer.alloc(15).toString("base64url") } })).toBeNull();
    expect(parseSubscription({ endpoint, keys: { ...keys, p256dh: Buffer.alloc(65, 1).toString("base64url") } })).toBeNull();
    // Right length and prefix, but not on the curve: every send would fail locally.
    expect(parseSubscription({ endpoint, keys: { ...keys, p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url") } })).toBeNull();
    expect(parseSubscription({ endpoint, keys: { ...keys, p256dh: "not base64!" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://evil.example/x", keys })).toBeNull();
  });
});

describe("VAPID and delivery", () => {
  const vapid = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = vapid.privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), b(jwk.x!), b(jwk.y!)]).toString("base64url");
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const sub = (n: number) => ({ user_id: "user_a", endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: ua.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 3).toString("base64url"), lang: "en", hide_text: false });
  let calls: { url: string; init: RequestInit }[] = [];

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", pub);
    vi.stubEnv("VAPID_PRIVATE_KEY", jwk.d!);
    vi.stubEnv("VAPID_SUBJECT", "mailto:ops@example.com");
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("signs an ES256 JWT for the push service origin that the public key verifies", () => {
    const h = vapidAuthorization("https://fcm.googleapis.com/fcm/send/1", Date.UTC(2026, 10, 21))!;
    const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(k).toBe(pub);
    const [head, claims, sig] = t.split(".");
    expect(JSON.parse(b(claims).toString())).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "mailto:ops@example.com" });
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" }, b(sig))).toBe(true);
  });

  it("sends to each device, drops 410/404 subscriptions, never follows redirects, and hides text when asked", async () => {
    const fake = createFakeSupabase({ push_subscriptions: [sub(1), sub(2), { ...sub(3), hide_text: true, lang: "de" }, { ...sub(4), user_id: "user_b" }] });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: url.endsWith("/2") ? 410 : 201 });
    }));
    const n = await deliverPush(fake.client as never, "user_a", { id: "r1", text: "Take the blue pill" });
    expect(n).toBe(2);
    expect(calls.map((c) => c.url)).toEqual([1, 2, 3].map((i) => `https://fcm.googleapis.com/fcm/send/${i}`));
    expect(calls.every((c) => c.init.redirect === "manual" && (c.init.headers as Record<string, string>)["Content-Encoding"] === "aes128gcm")).toBe(true);
    expect(fake.table("push_subscriptions").map((r) => r.endpoint)).not.toContain("https://fcm.googleapis.com/fcm/send/2");
    expect(fake.table("push_subscriptions")).toHaveLength(3); // user_b untouched
    // The ciphertext never carries the reminder in the clear.
    expect(calls.some((c) => Buffer.from(c.init.body as Uint8Array).includes("blue pill"))).toBe(false);
  });

  it("does nothing without VAPID keys", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const fake = createFakeSupabase({ push_subscriptions: [sub(1)] });
    vi.stubGlobal("fetch", vi.fn());
    expect(await deliverPush(fake.client as never, "user_a", { id: "r1", text: "x" })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
