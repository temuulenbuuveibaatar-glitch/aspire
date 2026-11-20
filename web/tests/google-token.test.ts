import { afterEach, describe, expect, it, vi } from "vitest";

// Clerk's Backend API is faked: tests control what getUserOauthAccessToken answers.
const getUserOauthAccessToken = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUserOauthAccessToken: (...a: unknown[]) => getUserOauthAccessToken(...a) } }),
}));

afterEach(() => getUserOauthAccessToken.mockReset());

describe("googleAccessToken", () => {
  it("returns the Google access token Clerk holds for the user", async () => {
    getUserOauthAccessToken.mockResolvedValue({ data: [{ provider: "google", token: "ya29.test" }], totalCount: 1 });
    const { googleAccessToken } = await import("@/lib/google-token");
    expect(await googleAccessToken("user_2abc")).toBe("ya29.test");
    expect(getUserOauthAccessToken).toHaveBeenCalledWith("user_2abc", "google");
  });

  it("returns null when the user has no Google connection", async () => {
    getUserOauthAccessToken.mockResolvedValue({ data: [], totalCount: 0 });
    const { googleAccessToken } = await import("@/lib/google-token");
    expect(await googleAccessToken("user_2abc")).toBeNull();
  });

  it("returns null when Clerk errors", async () => {
    getUserOauthAccessToken.mockRejectedValue(new Error("422 oauth_missing_refresh_token"));
    const { googleAccessToken } = await import("@/lib/google-token");
    expect(await googleAccessToken("user_2abc")).toBeNull();
  });

  it("returns null for an empty user id without calling Clerk", async () => {
    const { googleAccessToken } = await import("@/lib/google-token");
    expect(await googleAccessToken("")).toBeNull();
    expect(getUserOauthAccessToken).not.toHaveBeenCalled();
  });
});
