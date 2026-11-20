import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const SIGNING = "slack-signing-test";
const BOT_TOKEN = "xoxb-test-token";

let calls: Array<{ url: string; headers: Record<string, string>; body: unknown }>;
let respond: (url: string) => Response;
beforeEach(() => {
  vi.stubEnv("SLACK_SIGNING_SECRET", SIGNING);
  vi.stubEnv("SLACK_BOT_TOKEN", BOT_TOKEN);
  calls = [];
  respond = () => Response.json({ ok: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const raw = init?.body;
      const body = raw instanceof URLSearchParams ? Object.fromEntries(raw) : raw ? JSON.parse(String(raw)) : null;
      calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, body });
      return respond(String(url));
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

const sign = (raw: string, ts = String(Math.floor(Date.now() / 1000)), secret = SIGNING) => ({
  ts,
  sig: `v0=${createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex")}`,
});

function slackRequest(path: string, raw: string, opts: { headers?: Record<string, string>; secret?: string; contentType?: string } = {}) {
  const { ts, sig } = sign(raw, undefined, opts.secret);
  return new Request(`https://aspire.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": opts.contentType ?? "application/json",
      "X-Slack-Request-Timestamp": ts,
      "X-Slack-Signature": sig,
      ...opts.headers,
    },
    body: raw,
  });
}

async function postEvent(body: object, opts?: { headers?: Record<string, string>; secret?: string }) {
  const { POST } = await import("@/app/api/bots/slack/events/route");
  const res = await POST(slackRequest("/api/bots/slack/events", JSON.stringify(body), opts));
  await flush();
  return res;
}

const mention = (text: string, extra: object = {}) => ({
  type: "event_callback",
  team_id: "T1",
  authorizations: [{ user_id: "UBOT" }],
  event: { type: "app_mention", user: "U1", text, channel: "C1", ts: "1700000000.000100", ...extra },
});

const posts = () => calls.filter((c) => c.url === "https://slack.com/api/chat.postMessage");

describe("Slack signature", () => {
  it("verifySlack accepts valid and rejects stale or forged", async () => {
    const { verifySlack } = await import("@/lib/bots/slack");
    const now = new Date("2026-11-20T12:00:00Z");
    const ts = String(now.getTime() / 1000);
    const body = '{"type":"event_callback"}';
    const { sig } = sign(body, ts);
    expect(verifySlack(SIGNING, ts, body, sig, now)).toBe(true);
    expect(verifySlack(SIGNING, ts, body, sig, new Date(now.getTime() + 301_000))).toBe(false); // stale
    expect(verifySlack(SIGNING, ts, body, sig, new Date(now.getTime() - 301_000))).toBe(false); // from the future
    expect(verifySlack(SIGNING, ts, body + " ", sig, now)).toBe(false); // body changed
    expect(verifySlack("other-secret", ts, body, sig, now)).toBe(false); // forged
    expect(verifySlack(SIGNING, "abc", body, sig, now)).toBe(false);
    expect(verifySlack("", ts, body, sig, now)).toBe(false);
  });
});

describe("Slack events", () => {
  it("rejects requests without a valid signature", async () => {
    const res = await postEvent({ type: "url_verification", challenge: "x" }, { secret: "wrong" });
    expect(res.status).toBe(401);
  });

  it("url_verification echoes challenge", async () => {
    const res = await postEvent({ type: "url_verification", challenge: "abc123" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "abc123" });
  });

  it("retries are ignored", async () => {
    const res = await postEvent(mention("<@UBOT> hello"), { headers: { "X-Slack-Retry-Num": "1", "X-Slack-Retry-Reason": "http_timeout" } });
    expect(res.status).toBe(200);
    expect(handleBotMessage).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("mention posts answer in thread", async () => {
    const res = await postEvent(mention("<@UBOT> what&amp;s the weather &lt;today&gt;?"));
    expect(res.status).toBe(200);
    expect(handleBotMessage).toHaveBeenCalledWith({ platform: "slack", platformUserId: "U1", chatId: "C1", text: "what&s the weather <today>?" });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].headers.Authorization).toBe(`Bearer ${BOT_TOKEN}`);
    expect(posts()[0].body).toMatchObject({ channel: "C1", thread_ts: "1700000000.000100", text: "answer to what&s the weather <today>?" });
  });

  it("a mention inside a thread answers in that thread; DMs are answered too", async () => {
    await postEvent(mention("<@UBOT> and tomorrow?", { thread_ts: "1699999999.000001" }));
    expect(posts()[0].body).toMatchObject({ thread_ts: "1699999999.000001" });
    await postEvent({
      type: "event_callback",
      team_id: "T1",
      event: { type: "message", channel_type: "im", user: "U1", text: "hi", channel: "D1", ts: "1.2" },
    });
    expect(posts()[1].body).toMatchObject({ channel: "D1", text: "answer to hi", thread_ts: "1.2" });
  });

  it("bot messages and channel chatter are ignored", async () => {
    await postEvent(mention("<@UBOT> hello", { bot_id: "B1" }));
    await postEvent({ type: "event_callback", team_id: "T1", event: { type: "message", channel_type: "channel", user: "U1", text: "hi", channel: "C1", ts: "1" } });
    await postEvent({ type: "event_callback", team_id: "T1", event: { type: "message", channel_type: "im", subtype: "message_changed", channel: "D1", ts: "1" } });
    expect(handleBotMessage).not.toHaveBeenCalled();
  });

  it("posts fallback when ask throws", async () => {
    handleBotMessage.mockRejectedValue(new Error("brain down"));
    const res = await postEvent(mention("<@UBOT> Сайн байна уу, өнөөдөр цаг агаар ямар байна?"));
    expect(res.status).toBe(200);
    const { fallbackLine } = await import("@/lib/brain/shared");
    expect(posts()[0].body).toMatchObject({ channel: "C1", text: fallbackLine("mn") });
  });

  it("'link 123456' in a DM redeems the code", async () => {
    await postEvent({
      type: "event_callback",
      team_id: "T1",
      event: { type: "message", channel_type: "im", user: "U1", text: "link 123456", channel: "D1", ts: "1.2" },
    });
    expect(redeemLinkCode).toHaveBeenCalledWith("123456", { platform: "slack", platformUserId: "U1", chatId: "D1", chatTitle: "" });
    expect(handleBotMessage).not.toHaveBeenCalled();
    const { BOT_TEXT } = await import("@/lib/bots/text");
    expect(posts()[0].body).toMatchObject({ text: BOT_TEXT.en.linkUnavailable });
  });

  it("uninstall deletes installation", async () => {
    const store = { get: vi.fn(), put: vi.fn(), delete: vi.fn(async () => undefined) };
    const { setSlackInstallStore } = await import("@/lib/bots/slack");
    setSlackInstallStore(store);
    await postEvent({ type: "event_callback", team_id: "T9", event: { type: "app_uninstalled" } });
    expect(store.delete).toHaveBeenCalledWith("T9");
    await postEvent({ type: "event_callback", team_id: "T8", event: { type: "tokens_revoked", tokens: { bot: ["UBOT"] } } });
    expect(store.delete).toHaveBeenCalledWith("T8");
    await postEvent({ type: "event_callback", team_id: "T7", event: { type: "tokens_revoked", tokens: { oauth: ["U1"] } } });
    expect(store.delete).toHaveBeenCalledTimes(2); // user tokens only: the bot stays installed
  });

  it("uses the installed workspace token from the store", async () => {
    const store = { get: vi.fn(async (team: string) => (team === "T1" ? "xoxb-team-1" : null)), put: vi.fn(), delete: vi.fn() };
    const { setSlackInstallStore } = await import("@/lib/bots/slack");
    setSlackInstallStore(store);
    await postEvent(mention("<@UBOT> hi"));
    expect(store.get).toHaveBeenCalledWith("T1");
    expect(posts()[0].headers.Authorization).toBe("Bearer xoxb-team-1");
  });
});

describe("Slack /aspire command", () => {
  const form = (text: string) =>
    new URLSearchParams({
      command: "/aspire",
      text,
      user_id: "U1",
      channel_id: "C1",
      channel_name: "general",
      team_id: "T1",
      response_url: "https://hooks.slack.com/commands/T1/1/abc",
    }).toString();

  async function command(text: string) {
    const { POST } = await import("@/app/api/bots/slack/commands/route");
    const res = await POST(slackRequest("/api/bots/slack/commands", form(text), { contentType: "application/x-www-form-urlencoded" }));
    const json = await res.json();
    await flush();
    return { res, json };
  }

  it("rejects a forged command", async () => {
    const { POST } = await import("@/app/api/bots/slack/commands/route");
    const res = await POST(slackRequest("/api/bots/slack/commands", form("hi"), { secret: "nope" }));
    expect(res.status).toBe(401);
  });

  it("link <code> replies ephemerally", async () => {
    const { json } = await command("link 123456");
    expect(redeemLinkCode).toHaveBeenCalledWith("123456", { platform: "slack", platformUserId: "U1", chatId: "C1", chatTitle: "general" });
    const { BOT_TEXT } = await import("@/lib/bots/text");
    expect(json).toEqual({ response_type: "ephemeral", text: BOT_TEXT.en.linkUnavailable });
  });

  it("a question is acked with Thinking… and answered via response_url", async () => {
    const { json } = await command("what is the capital of Mongolia?");
    expect(json).toEqual({ response_type: "in_channel", text: "Thinking…" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://hooks.slack.com/commands/T1/1/abc");
    expect(calls[0].body).toMatchObject({ response_type: "in_channel", text: "answer to what is the capital of Mongolia?" });
  });

  it("posts fallback when ask throws", async () => {
    handleBotMessage.mockRejectedValue(new Error("brain down"));
    await command("Wie ist das Wetter heute?");
    const { fallbackLine } = await import("@/lib/brain/shared");
    expect(calls[0].body).toMatchObject({ text: fallbackLine("de") });
  });
});

describe("Slack install (OAuth)", () => {
  beforeEach(() => {
    vi.stubEnv("SLACK_CLIENT_ID", "cid");
    vi.stubEnv("SLACK_CLIENT_SECRET", "csecret");
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://aspire-mn.vercel.app");
  });

  async function install() {
    const { GET } = await import("@/app/api/bots/slack/install/route");
    const res = await GET(new Request("https://aspire-mn.vercel.app/api/bots/slack/install"));
    const location = new URL(res.headers.get("location")!);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    return { res, location, cookie };
  }

  it("install redirects to Slack with scopes, redirect_uri and a state cookie", async () => {
    const { res, location, cookie } = await install();
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(location.searchParams.get("client_id")).toBe("cid");
    expect(location.searchParams.get("scope")).toBe("app_mentions:read,chat:write,im:history,im:read,im:write,commands");
    expect(location.searchParams.get("redirect_uri")).toBe("https://aspire-mn.vercel.app/api/bots/slack/oauth");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(cookie.startsWith("aspire_slack_state=")).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("oauth stores the token via the install store and rejects bad state", async () => {
    const store = { get: vi.fn(), put: vi.fn(async () => undefined), delete: vi.fn() };
    const { setSlackInstallStore } = await import("@/lib/bots/slack");
    setSlackInstallStore(store);
    const { location, cookie } = await install();
    const state = location.searchParams.get("state")!;
    const { GET } = await import("@/app/api/bots/slack/oauth/route");

    // Bad state: wrong nonce, missing cookie, or a cookie signed with another key -> 400 and no Slack call.
    const bad = [
      new Request(`https://aspire-mn.vercel.app/api/bots/slack/oauth?code=c1&state=forged`, { headers: { cookie } }),
      new Request(`https://aspire-mn.vercel.app/api/bots/slack/oauth?code=c1&state=${state}`),
      new Request(`https://aspire-mn.vercel.app/api/bots/slack/oauth?code=c1&state=${state}`, {
        headers: { cookie: cookie.replace(/\.[^.]+$/, ".AAAA") },
      }),
    ];
    for (const req of bad) expect((await GET(req)).status).toBe(400);
    expect(calls).toEqual([]);
    expect(store.put).not.toHaveBeenCalled();

    respond = () => Response.json({ ok: true, access_token: "xoxb-new-team", bot_user_id: "UBOT2", team: { id: "T2" } });
    const res = await GET(new Request(`https://aspire-mn.vercel.app/api/bots/slack/oauth?code=c1&state=${state}`, { headers: { cookie } }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://aspire-mn.vercel.app/?slack=installed");
    expect(calls[0].url).toBe("https://slack.com/api/oauth.v2.access");
    expect(calls[0].body).toEqual({ code: "c1", redirect_uri: "https://aspire-mn.vercel.app/api/bots/slack/oauth" });
    expect(calls[0].headers.Authorization).toBe(`Basic ${Buffer.from("cid:csecret").toString("base64")}`);
    expect(store.put).toHaveBeenCalledWith({ teamId: "T2", botUserId: "UBOT2", botToken: "xoxb-new-team", installedBy: null });
  });

  it("an expired state is refused", async () => {
    const { newOAuthState, checkOAuthState } = await import("@/lib/bots/slack");
    const t0 = new Date("2026-11-20T00:00:00Z");
    const { state, cookie } = newOAuthState("k", t0);
    expect(checkOAuthState("k", state, cookie, new Date(t0.getTime() + 60_000))).toBe(true);
    expect(checkOAuthState("k", state, cookie, new Date(t0.getTime() + 11 * 60_000))).toBe(false);
    expect(checkOAuthState("other", state, cookie, t0)).toBe(false);
  });

  it("default store serves SLACK_BOT_TOKEN for any team", async () => {
    const { getSlackToken } = await import("@/lib/bots/slack");
    expect(await getSlackToken("ANY")).toBe(BOT_TOKEN);
    vi.stubEnv("SLACK_BOT_TOKEN", "");
    expect(await getSlackToken("ANY")).toBeNull();
  });
});
