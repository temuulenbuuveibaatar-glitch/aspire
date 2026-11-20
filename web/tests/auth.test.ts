import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Supabase server client is faked: tests control what `auth.getUser()` answers.
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { getUser: () => getUser() } }),
}));

// Routes see a mocked `requireUser`; the real one is loaded with importActual below.
const requireUserMock = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: () => requireUserMock(),
}));

// proxy.ts builds its own client from @supabase/ssr.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: () => getUser() } }),
}));

const actual = () => vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  getUser.mockReset();
  requireUserMock.mockReset();
});

describe("isPublicPath", () => {
  it.each([
    ["/login", true],
    ["/auth/callback", true],
    ["/privacy", true],
    ["/terms", true],
    ["/api/bots/telegram", true],
    ["/api/cron/reminders", true],
    ["/_next/static/chunk.js", true],
    ["/favicon.ico", true],
    ["/api/ask", false],
    ["/", false],
    ["/loginx", false],
    ["/settings", false],
  ])("%s -> %s", async (path, expected) => {
    const { isPublicPath } = await actual();
    expect(isPublicPath(path)).toBe(expected);
  });
});

describe("requireUser", () => {
  it("requireUser returns null for an expired session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", message: "JWT expired", status: 401 } });
    const { requireUser } = await actual();
    expect(await requireUser()).toBeNull();
  });

  it("returns null when the auth call itself fails", async () => {
    getUser.mockRejectedValue(new Error("network down"));
    const { requireUser } = await actual();
    expect(await requireUser()).toBeNull();
  });

  it("returns id and email for a signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1", email: "a@b.test" } }, error: null });
    const { requireUser } = await actual();
    expect(await requireUser()).toEqual({ id: "u-1", email: "a@b.test" });
  });
});

describe("signedOut", () => {
  it("is a 401 JSON response", async () => {
    const { signedOut } = await actual();
    const res = signedOut();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed_out" });
  });
});

describe("guarded API routes", () => {
  let ip = 0;
  const post = (body: BodyInit, json = true) => ({
    method: "POST",
    headers: { "x-real-ip": `10.1.0.${++ip}`, ...(json ? { "Content-Type": "application/json" } : {}) },
    body,
  });

  it("ask route returns 401 when signed out", async () => {
    requireUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ask/route");
    const res = await POST(new Request("http://localhost/api/ask", post(JSON.stringify({ text: "hi" }))));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed_out" });
  });

  it("listen, speak and send return 401 when signed out", async () => {
    requireUserMock.mockResolvedValue(null);
    const form = new FormData();
    form.append("audio", new Blob(["x"]), "a.webm");
    const cases: [string, () => Promise<{ POST: (r: Request) => Promise<Response> }>, RequestInit][] = [
      ["listen", () => import("@/app/api/listen/route"), post(form, false)],
      ["speak", () => import("@/app/api/speak/route"), post(JSON.stringify({ text: "hi", lang: "en" }))],
      ["send", () => import("@/app/api/send/route"), post(JSON.stringify({ channel: "slack", text: "hi" }))],
    ];
    for (const [name, load, init] of cases) {
      const { POST } = await load();
      const res = await POST(new Request(`http://localhost/api/${name}`, init));
      expect(res.status, name).toBe(401);
      expect(await res.json(), name).toEqual({ error: "signed_out" });
    }
  });
});

describe("proxy", () => {
  const run = async (url: string) => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(url));
  };

  it("redirects a signed-out page visit to /login with next", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await run("http://localhost/settings?tab=voice");
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/settings?tab=voice");
  });

  it("never redirects API paths (routes answer 401 themselves)", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await run("http://localhost/api/ask");
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("lets public pages and signed-in users through", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await run("http://localhost/login")).headers.get("location")).toBeNull();
    getUser.mockResolvedValue({ data: { user: { id: "u-1", email: null } }, error: null });
    expect((await run("http://localhost/")).headers.get("location")).toBeNull();
  });
});
