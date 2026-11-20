import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ask = vi.fn();
vi.mock("@/lib/brain", () => ({ ask: (...a: unknown[]) => ask(...a) }));

beforeEach(() => {
  ask.mockReset();
});
afterEach(() => {
  vi.resetModules();
});

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

  it("linking is not available yet (stub)", async () => {
    const { redeemLinkCode, loadLinkedUser } = await import("@/lib/bots/core");
    expect(await loadLinkedUser("telegram", "u1")).toBeNull();
    expect(await redeemLinkCode("123456", { platform: "telegram", platformUserId: "u1", chatId: "c1", chatTitle: "" })).toBeNull();
  });
});
