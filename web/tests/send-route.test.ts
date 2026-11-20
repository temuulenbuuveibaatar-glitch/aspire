import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/send/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let ip = 0;
const send = (body: unknown, from = `10.0.0.${++ip}`) =>
  POST(
    new Request("http://localhost/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": from },
      body: JSON.stringify(body),
    }),
  );

const DISCORD = "https://discord.com/api/webhooks/123456/abc_DEF-9";
const SLACK = "https://hooks.slack.com/services/T000/B000/XXXXyyyy";

describe("POST /api/send", () => {
  it("rejects non-allow-listed webhook urls before any request", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    for (const webhookUrl of [
      "https://evil.test/hook",
      "http://hooks.slack.com/services/T000/B000/XXXX",
      "https://discord.com.evil.test/api/webhooks/1/x",
    ]) {
      expect((await send({ channel: "discord", text: "hi", target: { webhookUrl } })).status).toBe(400);
      expect((await send({ channel: "slack", text: "hi", target: { webhookUrl } })).status).toBe(400);
    }
    // a Slack url is not accepted for Discord
    expect((await send({ channel: "discord", text: "hi", target: { webhookUrl: SLACK } })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Discord without pinging everyone", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await send({ channel: "discord", text: "I'm 10 minutes late", target: { webhookUrl: DISCORD } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(DISCORD);
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toEqual({ content: "I'm 10 minutes late", allowed_mentions: { parse: [] } });
  });

  it("posts to Slack and reports upstream failures without leaking the text or url", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return new Response("no_service", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await send({ channel: "slack", text: "secret plans", target: { webhookUrl: SLACK } });
    expect(res.status).toBe(502);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ text: "secret plans" });
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).not.toContain("secret plans");
    expect(logged).not.toContain("hooks.slack.com");
  });

  it("validates channel and text", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await send({ channel: "email", text: "hi", target: {} })).status).toBe(400);
    expect((await send({ channel: "discord", text: "", target: { webhookUrl: DISCORD } })).status).toBe(400);
    expect((await send({ channel: "discord", text: "x".repeat(2001), target: { webhookUrl: DISCORD } })).status).toBe(400);
  });

  it("telegram is not ready yet", async () => {
    const res = await send({ channel: "telegram", text: "hi", target: { chatId: "42" } });
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: "telegram_not_ready" });
  });

  it("is rate limited to 10 per minute", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await send({ channel: "discord", text: "hi", target: { webhookUrl: DISCORD } }, "10.9.9.9")).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
