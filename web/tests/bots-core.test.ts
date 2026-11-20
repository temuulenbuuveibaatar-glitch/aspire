import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

const ask = vi.fn();
vi.mock("@/lib/brain", () => ({ ask: (...a: unknown[]) => ask(...a) }));
let fake = createFakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fake.client }));
const googleAccessToken = vi.fn(async () => "ya29.test");
vi.mock("@/lib/google-token", () => ({ googleAccessToken: (...a: unknown[]) => googleAccessToken(...(a as [])) }));

beforeEach(() => {
  ask.mockReset();
  googleAccessToken.mockClear();
  fake = createFakeSupabase();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const withDb = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test");
};

const reply = (text: string, actions: unknown[] = []) => ({ reply: text, brain: "test", actions, steps: [] });
const msg = (text: string, chatId = "c1") => ({ platform: "telegram" as const, platformUserId: "u1", chatId, text });

describe("bot core (unlinked users)", () => {
  it("answers with an empty device in the detected language", async () => {
    ask.mockResolvedValue(reply("Сайн байна уу!"));
    const { handleBotMessage } = await import("@/lib/bots/core");
    const out = await handleBotMessage(msg("Сайн байна уу"));
    expect(out).toEqual({ text: "Сайн байна уу!", lang: "mn", linked: false });
    expect(ask).toHaveBeenCalledWith("Сайн байна уу", "mn", []);
  });

  it("an explicit language (from a voice note) wins over text detection", async () => {
    ask.mockResolvedValue(reply("ok"));
    const { handleBotMessage } = await import("@/lib/bots/core");
    const out = await handleBotMessage({ ...msg("ok"), lang: "de" });
    expect(out.lang).toBe("de");
    expect(ask.mock.calls[0][1]).toBe("de");
  });

  it("keeps per-chat history so threads keep context", async () => {
    ask.mockResolvedValueOnce(reply("Hi there")).mockResolvedValueOnce(reply("Sunny")).mockResolvedValueOnce(reply("Other"));
    const { handleBotMessage } = await import("@/lib/bots/core");
    await handleBotMessage(msg("hello"));
    await handleBotMessage(msg("and the weather?"));
    expect(ask.mock.calls[1][2]).toEqual([
      { role: "user", text: "hello" },
      { role: "assistant", text: "Hi there" },
    ]);
    await handleBotMessage(msg("hello", "c2"));
    expect(ask.mock.calls[2][2]).toEqual([]); // a different chat starts fresh
  });

  it("history keeps the last 8 turns and at most 500 chats (least recently used dropped)", async () => {
    ask.mockResolvedValue(reply("ok"));
    const { handleBotMessage, historyFor, MAX_CHATS, MAX_TURNS } = await import("@/lib/bots/core");
    expect(MAX_TURNS).toBe(8);
    expect(MAX_CHATS).toBe(500);
    for (let i = 0; i < 6; i++) await handleBotMessage(msg(`q${i}`));
    expect(historyFor("telegram", "c1")).toHaveLength(8);
    expect(historyFor("telegram", "c1")[0]).toEqual({ role: "user", text: "q2" });

    for (let i = 0; i < MAX_CHATS; i++) await handleBotMessage(msg("x", `chat${i}`));
    expect(historyFor("telegram", "c1")).toEqual([]); // evicted
    expect(historyFor("telegram", "chat0")).toHaveLength(2);
  });

  it("call action rendered as text with the number shown", async () => {
    ask.mockResolvedValue(reply("Calling the ambulance.", [{ type: "call", number: "103", label: "Ambulance" }]));
    const { handleBotMessage } = await import("@/lib/bots/core");
    const out = await handleBotMessage(msg("call an ambulance"));
    expect(out.text).toBe("Calling the ambulance.\n\nCall Ambulance: 103");
  });

  it("brain failure returns the localized fallback line", async () => {
    ask.mockRejectedValue(new Error("all providers down"));
    const { handleBotMessage } = await import("@/lib/bots/core");
    const { fallbackLine } = await import("@/lib/brain/shared");
    const out = await handleBotMessage(msg("Привет, какая погода?"));
    expect(out).toEqual({ text: fallbackLine("ru"), lang: "ru", linked: false });
  });

  it("linking is unavailable without a database", async () => {
    const { redeemLinkCode, loadLinkedUser } = await import("@/lib/bots/core");
    expect(await loadLinkedUser("telegram", "u1")).toBeNull();
    expect(await redeemLinkCode("123456", { platform: "telegram", platformUserId: "u1", chatId: "c1", chatTitle: "" })).toBeNull();
  });
});

describe("bot core (linked users)", () => {
  const link = (userId = "user_A", platformUserId = "u1", chatId = "c1") =>
    fake.table("bot_links").push({ id: 99, user_id: userId, platform: "telegram", platform_user_id: platformUserId, chat_id: chatId, chat_title: null, is_primary: true, linked_at: "2026-11-20T00:00:00.000Z" });

  it("unlinked user gets the link hint once per chat when linking is available", async () => {
    withDb();
    ask.mockResolvedValue(reply("Hello!"));
    const { handleBotMessage } = await import("@/lib/bots/core");
    const first = await handleBotMessage(msg("hello", "h1"));
    expect(first.linked).toBe(false);
    expect(first.text).toBe("Hello!\n\nLink your Aspire account: open Settings → Connections in the app.");
    expect((await handleBotMessage(msg("hello again", "h1"))).text).toBe("Hello!");
  });

  it("linked bot answers with the cloud state and Gmail, and remembers into cloud state", async () => {
    withDb();
    link();
    fake.table("user_state").push({
      user_id: "user_A",
      state: { memory: { home: { value: "Erdenet", updatedAt: "2026-11-19T00:00:00.000Z" } }, reminders: [], routines: [], lessons: [], settings: { updatedAt: "1970-01-01T00:00:00.000Z" } },
    });
    ask.mockImplementation(async (_t: string, _l: string, _h: unknown, _d: unknown, _n: unknown, extra: { gmailToken: () => Promise<string> }) => {
      expect(await extra.gmailToken()).toBe("ya29.test");
      return reply("Saved.", [{ type: "remember", key: "son", value: "Bat" }]);
    });
    const { handleBotMessage } = await import("@/lib/bots/core");
    const out = await handleBotMessage(msg("my son is Bat"));
    expect(out).toMatchObject({ text: "Saved.", linked: true });
    const device = ask.mock.calls[0][3];
    expect(device).toMatchObject({ memory: { home: "Erdenet" }, connected: ["telegram"] });
    expect(googleAccessToken).toHaveBeenCalledWith("user_A");
    const saved = fake.table("user_state")[0].state as { memory: Record<string, { value: string }> };
    expect(saved.memory.son.value).toBe("Bat");
    expect(saved.memory.home.value).toBe("Erdenet");
  });

  it("bot reminder upserts bot_reminders (namespaced id), cancel removes it", async () => {
    withDb();
    link();
    ask.mockResolvedValueOnce(reply("Done.", [{ type: "reminder", id: "r1", text: "pills", at: "2026-11-21T01:00:00.000Z", repeatDaily: true }]));
    const { handleBotMessage } = await import("@/lib/bots/core");
    await handleBotMessage(msg("remind me daily at 9 to take pills"));
    expect(fake.table("bot_reminders")).toEqual([
      { id: "user_A:r1", user_id: "user_A", text: "pills", at: "2026-11-21T01:00:00.000Z", repeat_daily: true, sent_at: null },
    ]);
    ask.mockResolvedValueOnce(reply("Cancelled.", [{ type: "cancel_reminder", id: "r1" }]));
    await handleBotMessage(msg("cancel it"));
    expect(fake.table("bot_reminders")).toEqual([]);
  });

  it("message and calendar actions are rendered as text with links", async () => {
    ask.mockResolvedValue(
      reply("Ready.", [
        { type: "message", channel: "email", to: "a@b.mn", subject: "Hi", text: "Late" },
        { type: "message", channel: "slack", to: "#team", subject: "", text: "Late" },
        { type: "calendar", title: "Dentist", start: "2026-11-21T01:00:00.000Z", end: "2026-11-21T02:00:00.000Z", details: "", url: "https://calendar.google.com/x" },
      ]),
    );
    const { handleBotMessage } = await import("@/lib/bots/core");
    const out = await handleBotMessage(msg("prepare things"));
    expect(out.text).toContain("Message to send (Email → a@b.mn): Hi — Late\nhttps://mail.google.com/mail/?view=cm&fs=1&to=a%40b.mn&su=Hi&body=Late");
    expect(out.text).toContain("Message to send (Slack → #team): Late\nOpen the Aspire app to send it.");
    expect(out.text).toMatch(/Add to calendar: Dentist, .*09:00\nhttps:\/\/calendar\.google\.com\/x/);
  });

  it("a failing cloud save still answers", async () => {
    withDb();
    link();
    vi.spyOn(console, "error").mockImplementation(() => {});
    ask.mockResolvedValue(reply("Saved.", [{ type: "remember", key: "k", value: "v" }]));
    const { handleBotMessage } = await import("@/lib/bots/core");
    const realUpsert = fake.client.from;
    fake.client.from = (name: string) => {
      const b = realUpsert(name);
      if (name === "user_state") b.upsert = (() => ({ then: (ok: (v: unknown) => unknown) => Promise.resolve(ok({ data: null, error: { code: "XX000" } })) })) as never;
      return b;
    };
    expect((await handleBotMessage(msg("remember k"))).text).toBe("Saved.");
    vi.restoreAllMocks();
  });
});
