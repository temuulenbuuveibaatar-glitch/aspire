import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

let fake = createFakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fake.client }));

const SECRET = "cron-secret-test";
let calls: { url: string; body: Record<string, unknown> }[] = [];
let respond: (url: string) => Response = () => Response.json({ ok: true, result: {} });

beforeEach(() => {
  fake = createFakeSupabase();
  calls = [];
  respond = (url) =>
    url.includes("discord.com") && url.endsWith("/users/@me/channels")
      ? Response.json({ id: "DM9" })
      : url.includes("conversations.open")
        ? Response.json({ ok: true, channel: { id: "D77" } })
        : Response.json({ ok: true, result: {} });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test");
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
  vi.stubEnv("DISCORD_BOT_TOKEN", "discord-bot");
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-env");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return respond(String(url));
    }),
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T01:00:30.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const run = async (secret: string | null = SECRET) => {
  const { POST } = await import("@/app/api/cron/reminders/route");
  return POST(new Request("http://localhost/api/cron/reminders", { method: "POST", headers: secret === null ? {} : { "x-cron-secret": secret } }));
};

function seedUser(platform: "telegram" | "discord" | "slack", reminder: { id: string; text: string; at: string; repeatDaily: boolean }) {
  fake.table("bot_links").push({
    id: 1,
    user_id: "user_A",
    platform,
    platform_user_id: platform === "slack" ? "U5" : "555",
    chat_id: platform === "telegram" ? "-100" : "chan",
    chat_title: null,
    team_id: platform === "slack" ? "T1" : null,
    is_primary: true,
    linked_at: "2026-11-19T00:00:00Z",
  });
  fake.table("user_state").push({
    user_id: "user_A",
    state: { memory: {}, reminders: [{ ...reminder, updatedAt: "2026-11-19T00:00:00.000Z" }], routines: [], lessons: [], settings: { updatedAt: "1970-01-01T00:00:00.000Z" } },
  });
  fake.table("bot_reminders").push({ id: `user_A:${reminder.id}`, user_id: "user_A", text: reminder.text, at: reminder.at, repeat_daily: reminder.repeatDaily, sent_at: null });
}

const stateReminders = () => (fake.table("user_state")[0].state as { reminders: { id: string; at: string; deleted?: boolean }[] }).reminders;

describe("POST /api/cron/reminders", () => {
  it("rejects a missing or wrong secret", async () => {
    expect((await run(null)).status).toBe(401);
    expect((await run("nope")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await run("")).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("sends a due reminder once to the primary chat", async () => {
    seedUser("telegram", { id: "r1", text: "Take the pills", at: "2026-11-20T01:00:00.000Z", repeatDaily: false });
    fake.table("bot_reminders").push({ id: "user_A:later", user_id: "user_A", text: "later", at: "2026-11-20T05:00:00.000Z", repeat_daily: false, sent_at: null });
    expect(await (await run()).json()).toEqual({ sent: 1, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "-100", text: "Reminder: Take the pills" });
    expect(await (await run()).json()).toEqual({ sent: 0, failed: 0 }); // never twice
    expect(calls).toHaveLength(1);
  });

  it("user_state reflects the sent reminder (one-off becomes a tombstone, row removed)", async () => {
    seedUser("telegram", { id: "r1", text: "pills", at: "2026-11-20T01:00:00.000Z", repeatDaily: false });
    await run();
    expect(stateReminders()[0]).toMatchObject({ id: "r1", deleted: true, updatedAt: "2026-11-20T01:00:30.000Z" });
    expect(fake.table("bot_reminders")).toEqual([]);
  });

  it("daily reminder moves to tomorrow (row and user_state) and is delivered as a Discord DM", async () => {
    seedUser("discord", { id: "d1", text: "Walk", at: "2026-11-20T01:00:00.000Z", repeatDaily: true });
    expect(await (await run()).json()).toEqual({ sent: 1, failed: 0 });
    expect(calls.map((c) => c.url)).toEqual(["https://discord.com/api/v10/users/@me/channels", "https://discord.com/api/v10/channels/DM9/messages"]);
    expect(calls[0].body).toEqual({ recipient_id: "555" });
    expect(calls[1].body).toEqual({ content: "Reminder: Walk", allowed_mentions: { parse: [] } });
    const row = fake.table("bot_reminders")[0];
    expect(row).toMatchObject({ at: "2026-11-21T01:00:00.000Z", sent_at: "2026-11-20T01:00:30.000Z" });
    expect(stateReminders()[0]).toMatchObject({ id: "d1", at: "2026-11-21T01:00:00.000Z" });
    expect(await (await run()).json()).toEqual({ sent: 0, failed: 0 });
  });

  it("Slack reminders go to the person's DM in their workspace", async () => {
    seedUser("slack", { id: "s1", text: "Call mom", at: "2026-11-20T00:59:00.000Z", repeatDaily: false });
    expect(await (await run()).json()).toEqual({ sent: 1, failed: 0 });
    expect(calls[0]).toEqual({ url: "https://slack.com/api/conversations.open", body: { users: "U5" } });
    expect(calls[1]).toMatchObject({ url: "https://slack.com/api/chat.postMessage", body: { channel: "D77", text: "Reminder: Call mom" } });
  });

  it("a failed delivery is retried on the next run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedUser("telegram", { id: "r1", text: "pills", at: "2026-11-20T01:00:00.000Z", repeatDaily: false });
    respond = () => Response.json({ ok: false, description: "Too Many Requests" }, { status: 429 });
    expect(await (await run()).json()).toEqual({ sent: 0, failed: 1 });
    expect(fake.table("bot_reminders")[0].sent_at).toBeNull();
    expect(stateReminders()[0].deleted).toBeUndefined();
    respond = () => Response.json({ ok: true, result: {} });
    expect(await (await run()).json()).toEqual({ sent: 1, failed: 0 });
  });
});
