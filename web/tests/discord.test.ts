import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pending: Promise<unknown>[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void pending.push(Promise.resolve().then(fn)) }));
const flush = async () => {
  while (pending.length) await pending.shift();
};

const handleBotMessage = vi.fn();
const redeemLinkCode = vi.fn();
vi.mock("@/lib/bots/core", () => ({
  handleBotMessage: (...a: unknown[]) => handleBotMessage(...a),
  redeemLinkCode: (...a: unknown[]) => redeemLinkCode(...a),
}));

const hex = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("hex");

let keys: CryptoKeyPair;
let publicKeyHex: string;
beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  publicKeyHex = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
});

let calls: Array<{ url: string; method: string; body: Record<string, unknown> }>;
beforeEach(() => {
  vi.stubEnv("DISCORD_PUBLIC_KEY", publicKeyHex);
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: String(init?.method), body: JSON.parse(String(init?.body)) });
      return Response.json({ id: "m1" });
    }),
  );
  handleBotMessage.mockReset().mockImplementation(async (m: { text: string }) => ({ text: `answer to ${m.text}`, lang: "en", linked: false }));
  redeemLinkCode.mockReset().mockResolvedValue(null);
  pending.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function signedRequest(body: object, opts: { tamper?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, new TextEncoder().encode(timestamp + raw));
  return new Request("https://aspire.test/api/bots/discord", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature-Ed25519": hex(sig), "X-Signature-Timestamp": timestamp },
    body: opts.tamper ? raw.replace("}", ',"x":1}') : raw,
  });
}

async function post(body: object, opts?: { tamper?: boolean }) {
  const { POST } = await import("@/app/api/bots/discord/route");
  const res = await POST(await signedRequest(body, opts));
  const json = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  return { res, json };
}

const command = (sub: string, option: string, value: string, extra: object = {}) => ({
  type: 2,
  token: "itoken",
  application_id: "app1",
  channel_id: "chan1",
  member: { user: { id: "user1" } },
  locale: "en-US",
  data: { name: "aspire", options: [{ name: sub, type: 1, options: [{ name: option, type: 3, value }] }] },
  ...extra,
});

describe("Discord interactions", () => {
  it("verifyDiscord accepts a valid signature and rejects others", async () => {
    const { verifyDiscord } = await import("@/lib/bots/discord");
    const sig = hex(await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, new TextEncoder().encode("123{}")));
    expect(await verifyDiscord(sig, "123", "{}", publicKeyHex)).toBe(true);
    expect(await verifyDiscord(sig, "124", "{}", publicKeyHex)).toBe(false);
    expect(await verifyDiscord("zz", "123", "{}", publicKeyHex)).toBe(false);
    expect(await verifyDiscord(sig, "123", "{}", "00".repeat(32))).toBe(false);
  });

  it("rejects bad signature", async () => {
    const { res } = await post({ type: 1 }, { tamper: true });
    expect(res.status).toBe(401);
    vi.stubEnv("DISCORD_PUBLIC_KEY", "");
    expect((await post({ type: 1 })).res.status).toBe(401);
  });

  it("answers PING", async () => {
    const { res, json } = await post({ type: 1 });
    expect(res.status).toBe(200);
    expect(json).toEqual({ type: 1 });
  });

  it("ask defers then posts answer", async () => {
    const { json } = await post(command("ask", "question", "what is the weather?"));
    expect(json).toEqual({ type: 5 });
    await flush();
    expect(handleBotMessage).toHaveBeenCalledWith({ platform: "discord", platformUserId: "user1", chatId: "chan1", text: "what is the weather?" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("https://discord.com/api/v10/webhooks/app1/itoken/messages/@original");
    expect(calls[0].body.content).toBe("answer to what is the weather?");
    expect(calls[0].body.allowed_mentions).toEqual({ parse: [] });
  });

  it("long answers are split into follow-up messages of at most 2000 characters", async () => {
    handleBotMessage.mockResolvedValue({ text: "word ".repeat(900), lang: "en", linked: false });
    await post(command("ask", "question", "tell me a long story"));
    await flush();
    expect(calls.map((c) => c.method)).toEqual(["PATCH", "POST", "POST"]);
    expect(calls[1].url).toBe("https://discord.com/api/v10/webhooks/app1/itoken");
    expect(calls.every((c) => String(c.body.content).length <= 2000)).toBe(true);
  });

  it("posts fallback when ask throws", async () => {
    handleBotMessage.mockRejectedValue(new Error("brain down"));
    const { json } = await post(command("ask", "question", "Привет, какая сегодня погода?"));
    expect(json).toEqual({ type: 5 });
    await flush();
    const { fallbackLine } = await import("@/lib/brain/shared");
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body.content).toBe(fallbackLine("ru"));
  });

  it("link replies ephemerally", async () => {
    const { json } = await post(command("link", "code", "123456", { locale: "de" }));
    expect(json).toEqual({ type: 5, data: { flags: 64 } });
    await flush();
    expect(redeemLinkCode).toHaveBeenCalledWith("123456", { platform: "discord", platformUserId: "user1", chatId: "chan1", chatTitle: "" });
    const { BOT_TEXT } = await import("@/lib/bots/text");
    expect(calls[0].body).toMatchObject({ content: BOT_TEXT.de.linkUnavailable, flags: 64 });

    redeemLinkCode.mockResolvedValue({ userId: "u-1" });
    calls.length = 0;
    await post(command("link", "code", "123456"));
    await flush();
    expect(calls[0].body).toMatchObject({ content: BOT_TEXT.en.linked, flags: 64 });
  });
});
