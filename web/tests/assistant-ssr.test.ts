// The main screen renders on the server (empty state) with no emojis or arrow glyphs.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ userId: "u1", isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never) }));

describe("Assistant (server render)", () => {
  it("renders the empty state without crashing and without emojis", async () => {
    const { default: Assistant } = await import("@/components/Assistant");
    const html = renderToString(createElement(Assistant));
    expect(html).toContain("ASPIRE");
    expect(html).toContain("aspire-core");
    expect(html).toContain("Skip to conversation");
    expect(html).not.toMatch(/[\p{Extended_Pictographic}\u{2190}-\u{21FF}\u{2600}-\u{27BF}]/u);
  });
});
