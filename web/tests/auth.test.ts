import { afterEach, describe, expect, it, vi } from "vitest";

// Clerk is faked: tests control what `auth()` answers. `clerkMiddleware(handler)` becomes a
// plain function that calls our handler with the same fake `auth`, so proxy.ts logic is tested
// without Clerk's network handshake.
type AuthState = { userId: string | null; sessionClaims?: Record<string, unknown> | null };
const authMock = vi.fn<() => Promise<AuthState>>();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  clerkMiddleware:
    (handler: (auth: () => Promise<AuthState>, req: unknown, ev: unknown) => unknown) => (req: unknown, ev: unknown) =>
      handler(() => authMock(), req, ev),
}));

// Routes see a mocked `requireUser`; the real one is loaded with importActual below.
const requireUserMock = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: () => requireUserMock(),
}));

const actual = () => vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");

afterEach(() => {
  authMock.mockReset();
  requireUserMock.mockReset();
});

describe("isPublicPath", () => {
  it.each([
    ["/login", true],
    ["/login/factor-one", true],
    ["/privacy", true],
    ["/terms", true],
    ["/api/bots/telegram", true],
    ["/api/cron/reminders", true],
    ["/_next/static/chunk.js", true],
    ["/favicon.ico", true],
    ["/auth/callback", false],
    ["/api/ask", false],
    ["/", true],
    ["/x", false],
    ["//", false],
    ["/api/desktop/pair", false],
    ["/opengraph-image", true],
    ["/loginx", false],
    ["/settings", false],
  ])("%s -> %s", async (path, expected) => {
    const { isPublicPath } = await actual();
    expect(isPublicPath(path)).toBe(expected);
  });
});

describe("requireUser", () => {
  it("requireUser returns null for an expired session", async () => {
    // Clerk reports an expired or absent session token as signed out: no userId.
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });
    const { requireUser } = await actual();
    expect(await requireUser()).toBeNull();
  });

  it("returns null when the auth call itself fails", async () => {
    authMock.mockRejectedValue(new Error("clerk down"));
    const { requireUser } = await actual();
    expect(await requireUser()).toBeNull();
  });

  it("returns the Clerk user id and the email claim for a signed-in user", async () => {
    authMock.mockResolvedValue({ userId: "user_2abc", sessionClaims: { sub: "user_2abc", email: "a@b.test" } });
    const { requireUser } = await actual();
    expect(await requireUser()).toEqual({ id: "user_2abc", email: "a@b.test" });
  });

  it("email is null when the session token carries no email claim", async () => {
    authMock.mockResolvedValue({ userId: "user_2abc", sessionClaims: { sub: "user_2abc" } });
    const { requireUser } = await actual();
    expect(await requireUser()).toEqual({ id: "user_2abc", email: null });
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

describe("safeNext", () => {
  it("keeps same-origin relative paths", async () => {
    const { safeNext } = await actual();
    expect(safeNext("/settings?tab=voice")).toBe("/settings?tab=voice");
    expect(safeNext("/")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });

  it("ignores absolute and protocol-relative next (open redirect)", async () => {
    const { safeNext } = await actual();
    for (const next of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "evil.test", "/\tevil", "/%0a//evil.test", "/..//evil.test", "/.//evil.test", "/a/..//evil.test", "/%2e//evil.test", "/a/../\\evil.test"]) {
      const out = safeNext(next);
      expect(out.startsWith("/"), next).toBe(true);
      expect(out.startsWith("//"), next).toBe(false);
      expect(new URL(out, "http://same.invalid").origin, next).toBe("http://same.invalid");
    }
    expect(safeNext("https://evil.test")).toBe("/");
    expect(safeNext("//evil.test")).toBe("/");
    expect(safeNext("/\\evil.test")).toBe("/");
    // Dot segments normalize to "//evil.test" after the first checks (pentest finding).
    expect(safeNext("/..//evil.test")).toBe("/");
    expect(safeNext("/.//evil.test")).toBe("/");
    expect(safeNext("/a/..//evil.test")).toBe("/");
    expect(safeNext("/%2e//evil.test")).toBe("/");
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
  // Returning nothing from the Clerk handler means "continue" (Clerk sends NextResponse.next()).
  const run = async (url: string): Promise<Response | undefined> => {
    const { NextRequest } = await import("next/server");
    const proxy = (await import("@/proxy")).default as unknown as (req: unknown, ev: unknown) => Promise<Response | undefined>;
    return proxy(new NextRequest(url), {});
  };
  const location = (res: Response | undefined) => res?.headers.get("location") ?? null;

  it("redirects a signed-out page visit to /login with next", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await run("http://localhost/settings?tab=voice");
    expect(res?.status).toBe(307);
    const loc = new URL(location(res)!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/settings?tab=voice");
  });

  it("never redirects API paths (routes answer 401 themselves)", async () => {
    authMock.mockResolvedValue({ userId: null });
    for (const path of ["/api/ask", "/api/listen", "/api/speak", "/api/send"]) {
      expect(location(await run(`http://localhost${path}`)), path).toBeNull();
    }
  });

  it("lets public pages and signed-in users through", async () => {
    authMock.mockResolvedValue({ userId: null });
    for (const path of ["/login", "/login?next=%2F", "/privacy", "/terms", "/api/bots/telegram", "/api/cron/reminders", "/robots.txt"]) {
      expect(location(await run(`http://localhost${path}`)), path).toBeNull();
    }
    authMock.mockResolvedValue({ userId: "user_2abc" });
    expect(location(await run("http://localhost/"))).toBeNull();
  });

  it("serves the homepage to signed-out visitors (landing page) but still guards every other page", async () => {
    authMock.mockResolvedValue({ userId: null });
    for (const url of ["http://localhost/", "http://localhost/?lang=mn", "http://localhost/opengraph-image"]) {
      expect(location(await run(url)), url).toBeNull();
    }
    const res = await run("http://localhost/x");
    expect(new URL(location(res)!).pathname).toBe("/login");
  });
});
