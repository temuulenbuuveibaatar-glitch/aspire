import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as codePOST } from "@/app/api/desktop/code/route";
import { GET as nextGET } from "@/app/api/desktop/next/route";
import { DELETE as pairDELETE, GET as pairGET, POST as pairPOST } from "@/app/api/desktop/pair/route";
import { POST as resultPOST } from "@/app/api/desktop/result/route";
import { DESKTOP_JOB_TTL_MS, enqueueDesktopJob, sha256, validateDesktopJob } from "@/lib/desktop";
import { rateLimitKey } from "@/lib/rate-limit";
import { desktopTools, desktopToolsFor } from "@/lib/tools/desktop";
import { createFakeSupabase } from "./fake-supabase";

let user: { id: string; email: null } | null = null;
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => user,
}));
let fake = createFakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fake.client }));

beforeEach(() => {
  fake = createFakeSupabase();
  user = null;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test");
});
afterEach(() => vi.unstubAllEnvs());

let ip = 0;
const req = (url: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
  new Request(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: {
      "x-real-ip": `10.1.${++ip}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

/** Signs in as `id`, gets a code and pairs a helper; returns its token and device id. */
async function pairAs(id: string, deviceName = `pc-${id}`) {
  user = { id, email: null };
  const { code } = (await (await codePOST(req("/api/desktop/code", { method: "POST" }))).json()) as { code: string };
  const res = await pairPOST(req("/api/desktop/pair", { method: "POST", body: { code, deviceName } }));
  expect(res.status).toBe(200);
  return (await res.json()) as { token: string; deviceId: string; name: string };
}

const poll = async (token?: string) => nextGET(req("/api/desktop/next", { token }));

describe("pairing", () => {
  it("needs a signed-in person for a code; stores only its hash", async () => {
    expect((await codePOST(req("/api/desktop/code", { method: "POST" }))).status).toBe(401);
    user = { id: "user_a", email: null };
    const res = await codePOST(req("/api/desktop/code", { method: "POST" }));
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    expect(fake.table("desktop_codes")).toEqual([expect.objectContaining({ code_hash: sha256(code), user_id: "user_a" })]);
    expect(JSON.stringify(fake.tables)).not.toContain(`"${code}"`);
  });

  it("a code pairs once; wrong and expired codes fail; only the token hash is stored", async () => {
    const paired = await pairAs("user_a", "Desk\u0007 <b>PC</b>");
    expect(paired.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(paired.name).toBe("Desk bPCb");
    const row = fake.table("desktop_devices")[0];
    expect(row.token_hash).toBe(sha256(paired.token));
    expect(JSON.stringify(fake.tables)).not.toContain(paired.token);

    for (const code of ["000000", "123456", "ABCDEFGHJ", "ABCDEFGHIJ", "ABCDEFGHJK0", "ABCDEFGHJK", 123456]) {
      expect((await pairPOST(req("/api/desktop/pair", { method: "POST", body: { code } }))).status).toBe(400);
    }
    user = { id: "user_a", email: null };
    const { code } = (await (await codePOST(req("/api/desktop/code", { method: "POST" }))).json()) as { code: string };
    fake.table("desktop_codes")[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await pairPOST(req("/api/desktop/pair", { method: "POST", body: { code } }))).status).toBe(400);
  });

  it("accepts a typed code in any case, with dashes or spaces", async () => {
    user = { id: "user_a", email: null };
    const { code } = (await (await codePOST(req("/api/desktop/code", { method: "POST" }))).json()) as { code: string };
    const typed = `${code.slice(0, 5).toLowerCase()}- ${code.slice(5)}`;
    expect((await pairPOST(req("/api/desktop/pair", { method: "POST", body: { code: typed } }))).status).toBe(200);
  });

  it("lists and unlinks only the person's own devices; an unlinked token gets 401", async () => {
    const a = await pairAs("user_a");
    const b = await pairAs("user_b");
    user = { id: "user_a", email: null };
    const list = (await (await pairGET(req("/api/desktop/pair"))).json()) as { devices: { id: string }[] };
    expect(list.devices.map((d) => d.id)).toEqual([a.deviceId]);
    expect(JSON.stringify(list)).not.toContain("token");
    expect((await pairDELETE(req("/api/desktop/pair", { method: "DELETE", body: { deviceId: b.deviceId } }))).status).toBe(404);
    expect((await poll(b.token)).status).toBe(200);
    expect((await pairDELETE(req("/api/desktop/pair", { method: "DELETE", body: { deviceId: a.deviceId } }))).status).toBe(200);
    expect((await poll(a.token)).status).toBe(401);
    user = null;
    expect((await pairGET(req("/api/desktop/pair"))).status).toBe(401);
  });
});

describe("jobs", () => {
  it("absent or wrong tokens get 401", async () => {
    await pairAs("user_a");
    expect((await poll()).status).toBe(401);
    expect((await poll("x".repeat(43))).status).toBe(401);
    expect((await nextGET(new Request("http://localhost/api/desktop/next", { headers: { Authorization: "Basic abc", "x-real-ip": "10.9.9.9" } }))).status).toBe(401);
    expect((await resultPOST(req("/api/desktop/result", { method: "POST", body: { jobId: crypto.randomUUID(), ok: true } }))).status).toBe(401);
  });

  it("hands a job to its device once, never to another person's device", async () => {
    const a = await pairAs("user_a");
    const b = await pairAs("user_b");
    const queued = await enqueueDesktopJob("user_a", "open_url", { url: "https://example.com/" });
    expect("jobId" in queued).toBe(true);

    const other = (await (await poll(b.token)).json()) as { job: unknown };
    expect(other.job).toBeNull();

    type Job = { id: string; kind: string; payload: unknown; expiresAt: string; expiresInMs: number };
    const mine = (await (await poll(a.token)).json()) as { job: Job };
    expect(mine.job).toMatchObject({ kind: "open_url", payload: { url: "https://example.com/" } });
    expect(mine.job.expiresInMs).toBeGreaterThan(DESKTOP_JOB_TTL_MS - 10_000);
    expect(mine.job.expiresInMs).toBeLessThanOrEqual(DESKTOP_JOB_TTL_MS);
    expect(((await (await poll(a.token)).json()) as { job: unknown }).job).toBeNull();

    // Another device cannot report on it; its own device can, once.
    const report = (token: string, body: unknown) => resultPOST(req("/api/desktop/result", { method: "POST", token, body }));
    expect((await report(b.token, { jobId: mine.job.id, ok: true, message: "x" })).status).toBe(404);
    expect((await report(a.token, { jobId: mine.job.id, ok: "yes" })).status).toBe(400);
    expect((await report(a.token, { jobId: mine.job.id, ok: false, denied: true, message: "No" })).status).toBe(200);
    expect((await report(a.token, { jobId: mine.job.id, ok: true })).status).toBe(404);
    const row = fake.table("desktop_jobs")[0];
    expect(row).toMatchObject({ status: "denied", message: "No", payload: {} });
  });

  it("records a job nobody answered as expired, not denied", async () => {
    const a = await pairAs("user_a");
    await enqueueDesktopJob("user_a", "open_app", { app: "Notepad" });
    const { job } = (await (await poll(a.token)).json()) as { job: { id: string } };
    const body = { jobId: job.id, ok: false, expired: true, message: "Expired before anyone allowed it." };
    expect((await resultPOST(req("/api/desktop/result", { method: "POST", token: a.token, body }))).status).toBe(200);
    expect(fake.table("desktop_jobs")[0]).toMatchObject({ status: "expired", payload: {} });
  });

  it("jobs expire after 5 minutes and are never handed out late", async () => {
    const a = await pairAs("user_a");
    await enqueueDesktopJob("user_a", "type_text", { text: "secret" }, new Date(Date.now() - DESKTOP_JOB_TTL_MS - 1000));
    expect(((await (await poll(a.token)).json()) as { job: unknown }).job).toBeNull();
    expect(fake.table("desktop_jobs")[0]).toMatchObject({ status: "expired", payload: {} });
  });

  it("queueing any job wipes every user's stale payloads, even for computers that never poll again", async () => {
    await pairAs("user_a");
    await pairAs("user_b");
    await enqueueDesktopJob("user_a", "type_text", { text: "secret" }, new Date(Date.now() - DESKTOP_JOB_TTL_MS - 1000));
    await enqueueDesktopJob("user_b", "open_app", { app: "Notepad" });
    expect(fake.table("desktop_jobs").find((r) => r.user_id === "user_a")).toMatchObject({ status: "expired", payload: {} });
    expect(JSON.stringify(fake.tables)).not.toContain("secret");
  });
});

describe("payload validation", () => {
  it("accepts good jobs", () => {
    expect(validateDesktopJob("open_app", { app: "Notepad" })).toEqual({ kind: "open_app", payload: { app: "Notepad" } });
    expect(validateDesktopJob("open_url", { url: "https://example.com/a?b=1" })).toMatchObject({ payload: { url: "https://example.com/a?b=1" } });
    expect(validateDesktopJob("type_text", { text: "Hi\r\nthere\u0007" })).toMatchObject({ payload: { text: "Hi\nthere" } });
    expect(validateDesktopJob("save_file", { name: "list (1).txt", content: "milk" })).toMatchObject({ payload: { name: "list (1).txt" } });
    expect(validateDesktopJob("save_file", { name: "data.CSV", content: "a,b" })).toMatchObject({ payload: { name: "data.CSV" } });
    expect(validateDesktopJob("fill_form", { fields: [{ label: "Name", value: "Bat\tErdene\n" }] })).toEqual({
      kind: "fill_form",
      payload: { fields: [{ label: "Name", value: "Bat Erdene" }] },
    });
  });

  it("turns numbers from the model into text instead of empty fields", () => {
    expect(validateDesktopJob("fill_form", { fields: [{ label: "Age", value: 42 }, { label: "Phone", value: 99112233 }] })).toMatchObject({
      payload: { fields: [{ label: "Age", value: "42" }, { label: "Phone", value: "99112233" }] },
    });
    expect(validateDesktopJob("type_text", { text: 2026 })).toMatchObject({ payload: { text: "2026" } });
    expect(validateDesktopJob("fill_form", { fields: [{ label: "Age", value: Number.NaN }] })).toMatchObject({
      payload: { fields: [{ label: "Age", value: "" }] },
    });
  });

  it("removes zero-width, separator and bidi characters", () => {
    expect(validateDesktopJob("type_text", { text: "a\u200bb\u2028c\ufeffd\u061ce\u2060f" })).toMatchObject({ payload: { text: "abcdef" } });
  });

  it("rejects bad ones", () => {
    const bad: [string, Record<string, unknown>][] = [
      ["open_app", { app: "-a evil" }],
      ["open_app", { app: "C:\\Windows\\cmd.exe" }],
      ["open_app", { app: "calc & del" + "x".repeat(80) }],
      ["open_url", { url: "http://example.com" }],
      ["open_url", { url: "javascript:alert(1)" }],
      ["open_url", { url: "file:///etc/passwd" }],
      ["open_url", { url: "https://user:pw@example.com" }],
      ["type_text", { text: "" }],
      ["type_text", { text: "x".repeat(2001) }],
      ["save_file", { name: "../evil.txt", content: "x" }],
      ["save_file", { name: "a/b.txt", content: "x" }],
      ["save_file", { name: ".bashrc", content: "x" }],
      ["save_file", { name: "CON.txt", content: "x" }],
      ["save_file", { name: "COM\u00b9.txt", content: "x" }],
      ["save_file", { name: "nul .txt", content: "x" }],
      ["save_file", { name: "a.url", content: "x" }],
      ["save_file", { name: "a.scf", content: "x" }],
      ["save_file", { name: "a.bat", content: "x" }],
      ["save_file", { name: "a.desktop", content: "x" }],
      ["save_file", { name: "a.txt.lnk", content: "x" }],
      ["save_file", { name: "README", content: "x" }],
      ["save_file", { name: "ok.txt", content: "x".repeat(200 * 1024 + 1) }],
      ["save_file", { name: "ok.txt" }],
      ["fill_form", { fields: [] }],
      ["fill_form", { fields: Array.from({ length: 21 }, () => ({ label: "a", value: "b" })) }],
      ["fill_form", { fields: [{ label: "", value: "b" }] }],
      ["rm_rf", { path: "/" }],
    ];
    for (const [kind, input] of bad) expect(validateDesktopJob(kind, input), `${kind} ${JSON.stringify(input)}`).toHaveProperty("error");
  });
});

describe("desktop tools", () => {
  const ctx = (userId?: string, source: "web" | "bot" | "cron" = "web") => ({
    now: new Date(),
    device: { memory: {}, reminders: [] },
    actions: [],
    userId,
    source,
  });
  const tool = (name: string) => desktopTools.find((t) => t.name === name)!;

  it("exports the five tools", () => {
    expect(desktopTools.map((t) => t.name)).toEqual([
      "desktop_open_app",
      "desktop_open_url",
      "desktop_type_text",
      "desktop_save_file",
      "desktop_fill_form",
    ]);
  });

  it("needs a signed-in person and a paired computer, and never claims it is done", async () => {
    expect(await tool("desktop_open_app").run({ app: "Notepad" }, ctx())).toHaveProperty("error");
    expect(await tool("desktop_open_app").run({ app: "Notepad" }, ctx("user_a"))).toMatchObject({ error: expect.stringMatching(/paired/) });
    await pairAs("user_a", "Laptop");
    const out = (await tool("desktop_open_app").run({ app: "Notepad" }, ctx("user_a"))) as { status: string; computer: string; note: string };
    expect(out).toMatchObject({ status: "waiting_for_permission", computer: "Laptop" });
    expect(out.note).toMatch(/never say it is done/);
    expect(fake.table("desktop_jobs")).toEqual([expect.objectContaining({ user_id: "user_a", kind: "open_app", status: "queued" })]);
    expect(await tool("desktop_open_url").run({ url: "http://x.test" }, ctx("user_a"))).toHaveProperty("error");
  });

  it("only exist for a signed-in web request; bot and cron runs are refused", async () => {
    expect(desktopToolsFor({ userId: "user_a", source: "web" })).toBe(desktopTools);
    expect(desktopToolsFor({ userId: "user_a", source: "bot" })).toEqual([]);
    expect(desktopToolsFor({ userId: "user_a" })).toEqual([]);
    expect(desktopToolsFor({ source: "web" })).toEqual([]);
    await pairAs("user_a", "Laptop");
    for (const source of ["bot", "cron"] as const) {
      expect(await tool("desktop_type_text").run({ text: "hi" }, ctx("user_a", source))).toHaveProperty("error");
    }
    expect(fake.table("desktop_jobs")).toEqual([]);
  });
});

describe("pairing rate limit", () => {
  const pairFrom = (ip: string) =>
    pairPOST(new Request("http://localhost/api/desktop/pair", { method: "POST", headers: { "x-real-ip": ip, "Content-Type": "application/json" }, body: JSON.stringify({ code: "ABCDEFGHJK" }) }));

  it("caps guesses per IP", async () => {
    for (let i = 0; i < 10; i++) rateLimitKey("desktop-pair:10.250.0.1", 10);
    expect((await pairFrom("10.250.0.1")).status).toBe(429);
  });

  it("has no shared bucket that one client could fill for everyone", async () => {
    for (let i = 0; i < 100; i++) rateLimitKey("desktop-pair:all", 60);
    expect((await pairFrom("10.250.0.2")).status).not.toBe(429);
  });
});
