import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// after() runs the callback once the response is sent; tests collect and await it.
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

const transcribe = vi.fn();
const synthesize = vi.fn();
vi.mock("@/lib/speech", () => ({
  transcribe: (...a: unknown[]) => transcribe(...a),
  synthesize: (...a: unknown[]) => synthesize(...a),
}));

const SECRET = "tg-secret-test";
const TOKEN = "123:ABC";

interface Sent {
  method: string;
  body: Record<string, unknown> | FormData | null;
}
let sent: Sent[];

function stubTelegramApi() {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith(`https://api.telegram.org/file/bot${TOKEN}/`)) return new Response(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 9]));
      const method = u.replace(`https://api.telegram.org/bot${TOKEN}/`, "");
      const body = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : null;
      sent.push({ method, body });
      const result = method === "getFile" ? { file_path: "voice/file_1.oga", file_size: 5 } : true;
      return Response.json({ ok: true, result });
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "AspireMnBot");
  handleBotMessage.mockReset().mockImplementation(async (m: { text: string; lang?: string }) => ({
    text: `answer to ${m.text}`,
    lang: m.lang ?? "en",
    linked: false,
  }));
  redeemLinkCode.mockReset().mockResolvedValue(null);
  transcribe.mockReset();
  synthesize.mockReset();
  stubTelegramApi();
  pending.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

let nextId = 1;
const privateMsg = (text: string, extra: object = {}) => ({
  update_id: nextId++,
  message: { message_id: 10, from: { id: 42, language_code: "en" }, chat: { id: 42, type: "private" }, text, ...extra },
});
const groupMsg = (text: string, extra: object = {}) => ({
  update_id: nextId++,
  message: { message_id: 11, from: { id: 42, language_code: "en" }, chat: { id: -100, type: "supergroup", title: "Team" }, text, ...extra },
});

async function post(update: unknown, secret = SECRET) {
  const { POST } = await import("@/app/api/bots/telegram/route");
  const res = await POST(
    new Request("https://aspire.test/api/bots/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
      body: JSON.stringify(update),
    }),
  );
  await flush();
  return res;
}

const messages = () => sent.filter((s) => s.method === "sendMessage").map((s) => (s.body as { text: string }).text);

describe("Telegram webhook", () => {
  it("rejects wrong secret token", async () => {
    const res = await post(privateMsg("hello"), "wrong");
    expect(res.status).toBe(401);
    expect(handleBotMessage).not.toHaveBeenCalled();
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect((await post(privateMsg("hello"), "")).status).toBe(401);
  });

  it("answers a private message with 200 and the work done after the response", async () => {
    const res = await post(privateMsg("what's the weather?"));
    expect(res.status).toBe(200);
    expect(handleBotMessage).toHaveBeenCalledWith({ platform: "telegram", platformUserId: "42", chatId: "42", text: "what's the weather?" });
    expect(sent.map((s) => s.method)).toEqual(["sendChatAction", "sendMessage"]);
    expect(messages()).toEqual(["answer to what's the weather?"]);
  });

  it("duplicate update_id is ignored", async () => {
    const update = privateMsg("hello");
    expect((await post(update)).status).toBe(200);
    expect((await post(update)).status).toBe(200);
    expect(handleBotMessage).toHaveBeenCalledTimes(1);
  });

  it("group message without mention is ignored", async () => {
    await post(groupMsg("just chatting"));
    expect(handleBotMessage).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("group message answers when mentioned, replied to, or /aspire", async () => {
    await post(groupMsg("@AspireMnBot when is the next bus?"));
    await post(groupMsg("thanks, and tomorrow?", { reply_to_message: { from: { id: 1, is_bot: true, username: "AspireMnBot" } } }));
    await post(groupMsg("/aspire@AspireMnBot translate hello"));
    await post(groupMsg("/aspire@OtherBot ignore me"));
    expect(handleBotMessage.mock.calls.map((c) => c[0].text)).toEqual([
      "when is the next bus?",
      "thanks, and tomorrow?",
      "translate hello",
    ]);
    // In groups the answer replies to the asking message.
    const first = sent.find((s) => s.method === "sendMessage")!.body as { chat_id: string; reply_parameters?: { message_id: number } };
    expect(first.chat_id).toBe("-100");
    expect(first.reply_parameters?.message_id).toBe(11);
  });

  it("/start alone sends the localized welcome", async () => {
    await post(privateMsg("/start", { from: { id: 42, language_code: "ru" } }));
    const { BOT_TEXT } = await import("@/lib/bots/text");
    expect(messages()).toEqual([BOT_TEXT.ru.welcome]);
    expect(handleBotMessage).not.toHaveBeenCalled();
  });

  it("/start code links account", async () => {
    redeemLinkCode.mockResolvedValue({ userId: "user-1" });
    await post(privateMsg("/start 123456"));
    expect(redeemLinkCode).toHaveBeenCalledWith("123456", { platform: "telegram", platformUserId: "42", chatId: "42", chatTitle: "" });
    const { BOT_TEXT } = await import("@/lib/bots/text");
    expect(messages()).toEqual([BOT_TEXT.en.linked]);
  });

  it("/link in a group passes the group title; says linking isn't available when the code is not redeemed", async () => {
    await post(groupMsg("/link 654321"));
    expect(redeemLinkCode).toHaveBeenCalledWith("654321", { platform: "telegram", platformUserId: "42", chatId: "-100", chatTitle: "Team" });
    const { BOT_TEXT } = await import("@/lib/bots/text");
    expect(messages()).toEqual([BOT_TEXT.en.linkUnavailable]);
    expect(BOT_TEXT.en.linkUnavailable).toContain("isn't available yet");
  });

  it("voice note is transcribed and answered with voice", async () => {
    transcribe.mockResolvedValue({ text: "Автобус хэзээ ирэх вэ?", language: "mn", probs: { mn: 0.9 } });
    const ogg = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]);
    synthesize.mockResolvedValue({ body: ogg, contentType: "audio/ogg" });
    await post(privateMsg("", { text: undefined, voice: { file_id: "file-1", duration: 3 } }));

    expect((transcribe.mock.calls[0][0] as Blob).type).toBe("audio/ogg");
    expect(handleBotMessage).toHaveBeenCalledWith({
      platform: "telegram",
      platformUserId: "42",
      chatId: "42",
      text: "Автобус хэзээ ирэх вэ?",
      lang: "mn",
    });
    expect(synthesize).toHaveBeenCalledWith("answer to Автобус хэзээ ирэх вэ?", "mn", "jarvis", "ogg");
    expect(messages()).toEqual(["answer to Автобус хэзээ ирэх вэ?"]);
    const voice = sent.find((s) => s.method === "sendVoice")!.body as FormData;
    expect(voice.get("chat_id")).toBe("42");
    const file = voice.get("voice") as Blob;
    expect(file.type).toBe("audio/ogg");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(ogg);
  });

  it("voice note: text answer still arrives when the voice cannot be made", async () => {
    transcribe.mockResolvedValue({ text: "hello there", language: "en", probs: { en: 0.9 } });
    synthesize.mockRejectedValue(new Error("Azure down"));
    await post(privateMsg("", { text: undefined, voice: { file_id: "file-1", duration: 3 } }));
    expect(messages()).toEqual(["answer to hello there"]);
    expect(sent.some((s) => s.method === "sendVoice")).toBe(false);
  });

  it("silent voice note gets a 'didn't hear' line instead of an AI call", async () => {
    transcribe.mockResolvedValue({ text: "", language: "", probs: {} });
    await post(privateMsg("", { text: undefined, voice: { file_id: "file-1", duration: 2 } }));
    const { BOT_TEXT } = await import("@/lib/bots/text");
    expect(messages()).toEqual([BOT_TEXT.en.didntHear]);
    expect(handleBotMessage).not.toHaveBeenCalled();
  });

  it("posts the fallback line when answering fails", async () => {
    handleBotMessage.mockRejectedValue(new Error("boom"));
    await post(privateMsg("hello", { from: { id: 42, language_code: "de" } }));
    const { fallbackLine } = await import("@/lib/brain/shared");
    expect(messages()).toEqual([fallbackLine("de")]);
  });
});

describe("Telegram client", () => {
  it("sendTelegram splits text over 4096 characters", async () => {
    const { sendTelegram, splitText } = await import("@/lib/bots/telegram");
    const long = `${"a".repeat(3000)}\n${"b".repeat(3000)} ${"c".repeat(3000)}`;
    await sendTelegram("42", long);
    const texts = messages();
    expect(texts.length).toBe(3);
    expect(texts.every((t) => t.length <= 4096)).toBe(true);
    expect(texts.join("")).toBe(long.replace(/[\n ]/g, ""));
    expect(splitText("x".repeat(9000)).map((c) => c.length)).toEqual([4096, 4096, 808]);
    expect(splitText("short")).toEqual(["short"]);
  });

  it("errors never contain the bot token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 })));
    const { tg } = await import("@/lib/bots/telegram");
    const err = await tg("sendMessage", { chat_id: 1, text: "x" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("chat not found");
    expect((err as Error).message).not.toContain(TOKEN);
  });
});
