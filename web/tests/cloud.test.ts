import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

let fake = createFakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fake.client }));
let signedIn: { id: string; email: null } | null = { id: "user_A", email: null };
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => signedIn,
}));

beforeEach(() => {
  fake = createFakeSupabase();
  signedIn = { id: "user_A", email: null };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const tg = (chatId = "100", platformUserId = "100", chatTitle = "") => ({ platform: "telegram" as const, platformUserId, chatId, chatTitle });
let ip = 0;
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/x", {
    method,
    headers: { "Content-Type": "application/json", "x-real-ip": `10.1.0.${++ip}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("link codes", () => {
  it("link code redeems once and expires", async () => {
    const { createLinkCode, redeemLinkCode } = await import("@/lib/bots/links");
    const t0 = new Date("2026-11-20T10:00:00Z");
    const code = await createLinkCode("user_A", t0);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/); // ~49.5 bits: no 6-digit brute force
    expect(await redeemLinkCode(code, tg(), new Date(t0.getTime() + 60_000))).toEqual({ userId: "user_A" });
    expect(await redeemLinkCode(code, tg(), new Date(t0.getTime() + 61_000))).toBeNull(); // used

    const late = await createLinkCode("user_A", t0);
    expect(await redeemLinkCode(late, tg("200"), new Date(t0.getTime() + 11 * 60_000))).toBeNull(); // expired
    expect(await redeemLinkCode("12ab56", tg())).toBeNull();
    expect(await redeemLinkCode("123456", tg())).toBeNull(); // the old 6-digit format is gone
    // Typed codes are forgiving: lower case and a dash still work.
    const typed = await createLinkCode("user_A", t0);
    const loose = `${typed.slice(0, 5)}-${typed.slice(5)}`.toLowerCase();
    expect(await redeemLinkCode(loose, tg("300"), new Date(t0.getTime() + 60_000))).toEqual({ userId: "user_A" });
  });

  it("a new code replaces the user's older ones", async () => {
    const { createLinkCode } = await import("@/lib/bots/links");
    await createLinkCode("user_A");
    const second = await createLinkCode("user_A");
    expect(fake.table("link_codes").map((r) => r.code)).toEqual([second]);
  });

  it("first link is primary; a Telegram group /link becomes a send target with its title", async () => {
    const { createLinkCode, redeemLinkCode, telegramTargets, primaryLink } = await import("@/lib/bots/links");
    await redeemLinkCode(await createLinkCode("user_A"), tg("100", "100"));
    await redeemLinkCode(await createLinkCode("user_A"), tg("-1009", "100", "Family"));
    const links = fake.table("bot_links");
    expect(links.map((l) => [l.chat_id, l.is_primary])).toEqual([
      ["100", true],
      ["-1009", false],
    ]);
    expect(await telegramTargets("user_A")).toEqual([
      { chatId: "100", title: "Telegram" },
      { chatId: "-1009", title: "Family" },
    ]);
    expect((await primaryLink("user_A"))?.chatId).toBe("100");
  });

  it("a chat account linked to a new user leaves the previous user", async () => {
    const { createLinkCode, redeemLinkCode, findLinkedUser } = await import("@/lib/bots/links");
    await redeemLinkCode(await createLinkCode("user_A"), tg());
    fake.table("user_state").push({ user_id: "user_A", state: {} });
    await redeemLinkCode(await createLinkCode("user_B"), tg());
    expect(await findLinkedUser("telegram", "100")).toBe("user_B");
    expect(fake.table("user_state")).toEqual([]); // user_A has no links left: cloud data removed
  });

  it("POST /api/link/code needs a session and the consent box", async () => {
    const { POST } = await import("@/app/api/link/code/route");
    expect((await POST(req("POST", { consent: false }))).status).toBe(400);
    const ok = await POST(req("POST", { consent: true }));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { code: string; expiresAt: string };
    expect(body.code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(9 * 60_000);
    signedIn = null;
    expect((await POST(req("POST", { consent: true }))).status).toBe(401);
  });

  it("linking routes answer 503 without a database", async () => {
    vi.unstubAllEnvs();
    const { POST } = await import("@/app/api/link/code/route");
    expect((await POST(req("POST", { consent: true }))).status).toBe(503);
  });
});

describe("cloud sync", () => {
  const state = (over: Record<string, unknown> = {}) => ({
    memory: { home: { value: "Erdenet", updatedAt: "2026-11-20T10:00:00.000Z" } },
    reminders: [],
    routines: [],
    lessons: [],
    settings: { voice: "friday", updatedAt: "2026-11-20T10:00:00.000Z" },
    ...over,
  });
  const linkA = () =>
    fake.table("bot_links").push({ id: 1, user_id: "user_A", platform: "telegram", platform_user_id: "100", chat_id: "100", chat_title: null, is_primary: true, linked_at: "2026-11-20T00:00:00Z" });

  it("sync requires a link (409)", async () => {
    const { GET, PUT } = await import("@/app/api/sync/route");
    const get = await GET(req("GET"));
    expect(get.status).toBe(204); // GET without a link: nothing to sync (no console error)
    expect((await PUT(req("PUT", { state: state() }))).status).toBe(409);
    expect(fake.table("user_state")).toEqual([]);
  });

  it("PUT merges with the stored copy item by item and GET returns it", async () => {
    linkA();
    fake.table("user_state").push({
      user_id: "user_A",
      state: state({ memory: { home: { value: "Ulaanbaatar", updatedAt: "2026-11-20T10:05:00.000Z" }, son: { value: "Bat", updatedAt: "2026-11-20T09:00:00.000Z" } } }),
    });
    const { GET, PUT } = await import("@/app/api/sync/route");
    const put = await PUT(req("PUT", { state: state() }));
    expect(put.status).toBe(200);
    const merged = ((await put.json()) as { state: { memory: Record<string, { value: string }> } }).state;
    expect(merged.memory.home.value).toBe("Ulaanbaatar"); // cloud edit was newer
    expect(merged.memory.son.value).toBe("Bat"); // not overwritten by the phone's copy
    const got = (await (await GET(req("GET"))).json()) as { state: unknown };
    expect(got.state).toEqual(merged);
    expect((await PUT(req("PUT", { state: { memory: "nope" } }))).status).toBe(400);
  });

  it("cloud copy never contains the Gmail refresh token or webhooks", async () => {
    linkA();
    const { PUT } = await import("@/app/api/sync/route");
    const res = await PUT(
      req("PUT", {
        state: state({
          settings: { voice: "jarvis", gmailRefreshToken: "1//secret-refresh", webhooks: { slack: "https://hooks.slack.com/services/T/B/X" }, updatedAt: "2026-11-20T11:00:00.000Z" },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const stored = JSON.stringify(fake.table("user_state"));
    expect(stored).not.toContain("secret-refresh");
    expect(stored).not.toContain("hooks.slack.com");
    expect(stored).toContain("jarvis");
  });

  it("phone reminders reach bot_reminders through sync", async () => {
    linkA();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00.000Z")); // the reminder is still ahead (late ones are not queued)
    const { PUT } = await import("@/app/api/sync/route");
    await PUT(req("PUT", { state: state({ reminders: [{ id: "r9", text: "bus", at: "2026-11-21T00:30:00.000Z", repeatDaily: false, updatedAt: "2026-11-20T10:00:00.000Z" }] }) }));
    vi.useRealTimers();
    expect(fake.table("bot_reminders")).toEqual([
      { id: "user_A:r9", user_id: "user_A", text: "bus", at: "2026-11-21T00:30:00.000Z", repeat_daily: false, sent_at: null },
    ]);
  });

  it("unlink last link deletes cloud data", async () => {
    linkA();
    fake.table("bot_links").push({ id: 2, user_id: "user_A", platform: "discord", platform_user_id: "d1", chat_id: "d1", chat_title: null, is_primary: false, linked_at: "2026-11-20T01:00:00Z" });
    fake.table("user_state").push({ user_id: "user_A", state: state() });
    fake.table("bot_reminders").push({ id: "user_A:r", user_id: "user_A", text: "x", at: "2026-11-21T00:00:00Z", repeat_daily: false, sent_at: null });
    fake.table("bot_links").push({ id: 3, user_id: "user_B", platform: "slack", platform_user_id: "U1", chat_id: "D1", chat_title: null, is_primary: true, linked_at: "2026-11-20T00:00:00Z" });
    const { POST } = await import("@/app/api/unlink/route");

    expect((await POST(req("POST", { linkId: 3 }))).status).toBe(404); // someone else's link
    const first = await POST(req("POST", { linkId: 1 }));
    expect(await first.json()).toEqual({ ok: true, remaining: 1 });
    expect(fake.table("bot_links").find((l) => l.id === 2)?.is_primary).toBe(true); // primary moves on
    expect(fake.table("user_state")).toHaveLength(1);

    const last = await POST(req("POST", { linkId: 2 }));
    expect(await last.json()).toEqual({ ok: true, remaining: 0 });
    expect(fake.table("user_state")).toEqual([]);
    expect(fake.table("bot_reminders")).toEqual([]);
    expect(fake.table("bot_links").map((l) => l.user_id)).toEqual(["user_B"]);
  });

  it("delete my cloud data removes everything of this user only", async () => {
    linkA();
    fake.table("user_state").push({ user_id: "user_A", state: state() }, { user_id: "user_B", state: state() });
    fake.table("secrets").push({ user_id: "user_A", google_refresh_token_enc: "v1.x.y" });
    const { POST } = await import("@/app/api/unlink/route");
    expect(await (await POST(req("POST", { all: true }))).json()).toEqual({ ok: true, remaining: 0 });
    expect(fake.table("user_state").map((r) => r.user_id)).toEqual(["user_B"]);
    expect(fake.table("secrets")).toEqual([]);
    expect(fake.table("bot_links")).toEqual([]);
  });

  it("GET /api/link lists links; primary can be changed only to an own link", async () => {
    linkA();
    fake.table("bot_links").push({ id: 2, user_id: "user_A", platform: "slack", platform_user_id: "U1", chat_id: "D1", chat_title: "dm", is_primary: false, linked_at: "2026-11-20T01:00:00Z" });
    fake.table("bot_links").push({ id: 3, user_id: "user_B", platform: "slack", platform_user_id: "U2", chat_id: "D2", chat_title: null, is_primary: true, linked_at: "2026-11-20T00:00:00Z" });
    const { GET } = await import("@/app/api/link/route");
    const { POST } = await import("@/app/api/link/primary/route");
    const list = (await (await GET(req("GET"))).json()) as { links: { id: number; isPrimary: boolean }[] };
    expect(list.links.map((l) => [l.id, l.isPrimary])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect((await POST(req("POST", { linkId: 3 }))).status).toBe(404);
    expect((await POST(req("POST", { linkId: 2 }))).status).toBe(200);
    expect(fake.table("bot_links").filter((l) => l.is_primary).map((l) => l.id)).toEqual([2, 3]);
  });

  it("GET /api/link/targets lists only Telegram chats", async () => {
    linkA();
    fake.table("bot_links").push({ id: 2, user_id: "user_A", platform: "discord", platform_user_id: "d", chat_id: "d", chat_title: null, is_primary: false, linked_at: "2026-11-20T01:00:00Z" });
    const { GET } = await import("@/app/api/link/targets/route");
    expect(await (await GET(req("GET"))).json()).toEqual({ targets: [{ chatId: "100", title: "Telegram" }] });
  });
});
