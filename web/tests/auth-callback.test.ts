import { afterEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: {
      exchangeCodeForSession: (...a: unknown[]) => exchangeCodeForSession(...a),
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
  }),
}));

afterEach(() => {
  exchangeCodeForSession.mockReset();
  verifyOtp.mockReset();
  signOut.mockReset();
});

const callback = async (query: string) => {
  const { GET } = await import("@/app/auth/callback/route");
  return GET(new Request(`http://localhost/auth/callback${query}`));
};
const location = (res: Response) => res.headers.get("location");

describe("GET /auth/callback", () => {
  it("callback redirects to next for relative paths", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    const res = await callback("?code=abc&next=%2Fsettings%3Ftab%3Dvoice");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(location(res)).toBe("http://localhost/settings?tab=voice");
  });

  it("callback ignores absolute next (open redirect)", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    for (const next of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "evil.test"]) {
      const res = await callback(`?code=abc&next=${encodeURIComponent(next)}`);
      expect(location(res), next).toBe("http://localhost/");
    }
  });

  it("callback without code redirects to /login?error=1", async () => {
    const res = await callback("?next=%2F");
    expect(location(res)).toBe("http://localhost/login?error=1");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("failed code exchange redirects to /login?error=1", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: { message: "bad code" } });
    expect(location(await callback("?code=abc"))).toBe("http://localhost/login?error=1");
  });

  it("email link with token_hash is verified then redirects to next", async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: null });
    const res = await callback("?token_hash=th123&type=magiclink&next=%2Fbriefing");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th123", type: "magiclink" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe("http://localhost/briefing");
  });

  it("token_hash with an unknown type or failed verify goes to /login?error=1", async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: { message: "expired" } });
    expect(location(await callback("?token_hash=th123&type=email"))).toBe("http://localhost/login?error=1");
    verifyOtp.mockReset();
    expect(location(await callback("?token_hash=th123&type=sms"))).toBe("http://localhost/login?error=1");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("POST /auth/signout", () => {
  it("signs out and sends the browser to /login with a GET (303)", async () => {
    signOut.mockResolvedValue({ error: null });
    const { POST } = await import("@/app/auth/signout/route");
    const res = await POST(new Request("http://localhost/auth/signout", { method: "POST" }));
    expect(signOut).toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(location(res)).toBe("http://localhost/login");
  });
});
