import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hardening checks: response headers, link-code guessing, per-user limits, the Slack state key,
// redirects after sign-in, and that no browser code reads a server secret.

const pending: Promise<unknown>[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void pending.push(Promise.resolve().then(fn)) }));
const flush = async () => {
  while (pending.length) await pending.shift();
};

const redeemLinkCode = vi.fn();
vi.mock("@/lib/bots/core", () => ({ handleBotMessage: vi.fn(), redeemLinkCode: (...a: unknown[]) => redeemLinkCode(...a) }));

const synthesize = vi.fn();
const transcribe = vi.fn();
vi.mock("@/lib/speech", () => ({
  SpeechOffline: class extends Error {},
  synthesize: (...a: unknown[]) => synthesize(...a),
  transcribe: (...a: unknown[]) => transcribe(...a),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => ({ id: "user-1", email: null }),
}));

beforeEach(() => {
  redeemLinkCode.mockReset().mockResolvedValue(null);
  synthesize.mockReset().mockResolvedValue({ body: "audio", contentType: "audio/mpeg", engine: "azure" });
  transcribe.mockReset();
  pending.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function headers(env: Record<string, string> = {}): Promise<Record<string, string>> {
  vi.stubEnv("NODE_ENV", "production");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const config = (await import("../next.config")).default;
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === "/:path*");
  return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
}
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("security headers", () => {
  it("sends a CSP that blocks framing, plugins and foreign scripts", async () => {
    const h = await headers();
    const csp = h["Content-Security-Policy"];
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'"); // production
    expect(directive(csp, "script-src")).not.toMatch(/ https: | \*( |$)/);
    expect(directive(csp, "connect-src")).not.toMatch(/ https:( |$)/);
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toContain("max-age=63072000");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("allows what the app embeds and calls: players, map tiles, Clerk, the desktop bridge", async () => {
    const host = "wealthy-mastiff-2480.clerk.accounts.dev";
    const key = `pk_test_${Buffer.from(`${host}$`).toString("base64")}`;
    const csp = (await headers({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key }))["Content-Security-Policy"];
    for (const o of ["https://www.youtube-nocookie.com", "https://open.spotify.com", "https://dedtuv.erdenet.mn", "https://challenges.cloudflare.com"]) {
      expect(directive(csp, "frame-src")).toContain(o);
    }
    expect(directive(csp, "script-src")).toContain(`https://${host}`);
    const connect = directive(csp, "connect-src");
    for (const o of [`https://${host}`, "https://tiles.openfreemap.org", "ipc:", "http://ipc.localhost"]) expect(connect).toContain(o);
    expect(directive(csp, "worker-src")).toBe("worker-src 'self' blob:"); // maplibre's workers
  });

  it("adds a configured https map style host, ignores anything else", async () => {
    expect(directive((await headers({ NEXT_PUBLIC_MAP_STYLE_URL: "https://maps.example.org/style.json" }))["Content-Security-Policy"], "connect-src"))
      .toContain("https://maps.example.org");
    vi.resetModules();
    expect(directive((await headers({ NEXT_PUBLIC_MAP_STYLE_URL: "http://evil.example/style.json" }))["Content-Security-Policy"], "connect-src"))
      .not.toContain("evil.example");
  });

  it("never ships browser source maps", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const config = (await import("../next.config")).default;
    expect(config.productionBrowserSourceMaps).toBe(false);
    expect(config.poweredByHeader).toBe(false);
  });
});

describe("link codes cannot be guessed through the bots", () => {
  it("allows 3 tries per chat account per minute, per platform and workspace", async () => {
    const { linkTryAllowed } = await import("@/lib/rate-limit");
    expect([1, 2, 3, 4].map(() => linkTryAllowed("telegram", "7"))).toEqual([true, true, true, false]);
    expect(linkTryAllowed("telegram", "8")).toBe(true);
    expect(linkTryAllowed("discord", "7")).toBe(true);
    expect([1, 2, 3].map(() => linkTryAllowed("slack", "U1", "T1"))).toEqual([true, true, true]);
    expect(linkTryAllowed("slack", "U1", "T1")).toBe(false);
    expect(linkTryAllowed("slack", "U1", "T2")).toBe(true);
  });

  it("the Telegram bot stops redeeming after 3 tries and says linking is unavailable", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "1:A");
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      sent.push(String(JSON.parse(String(init?.body ?? "{}")).text ?? ""));
      return Response.json({ ok: true, result: true });
    }));
    const { POST } = await import("@/app/api/bots/telegram/route");
    for (let i = 0; i < 5; i++) {
      const update = { update_id: 900 + i, message: { message_id: 1, from: { id: 99, language_code: "en" }, chat: { id: 99, type: "private" }, text: `/link 00000${i}` } };
      await POST(new Request("https://x/api/bots/telegram", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "s" }, body: JSON.stringify(update) }));
      await flush();
    }
    expect(redeemLinkCode).toHaveBeenCalledTimes(3);
    const { BOT_TEXT } = await import("@/lib/bots/text");
    expect(sent.slice(3)).toEqual([BOT_TEXT.en.linkUnavailable, BOT_TEXT.en.linkUnavailable]);
  });
});

describe("per-user limits on paid APIs", () => {
  it("one account cannot rotate IPs past the voice limit", async () => {
    const { POST } = await import("@/app/api/speak/route");
    const call = (i: number) =>
      POST(new Request("https://x/api/speak", { method: "POST", headers: { "x-real-ip": `10.0.0.${i}` }, body: JSON.stringify({ text: "hi", lang: "en" }) }));
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await call(i)).status);
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes[20]).toBe(429);
  });

  it("refuses an oversized voice upload before reading it", async () => {
    const { POST } = await import("@/app/api/listen/route");
    const res = await POST(new Request("https://x/api/listen", { method: "POST", headers: { "content-length": "9000000" }, body: "x" }));
    expect(res.status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe("Slack OAuth state key", () => {
  it("is never the cron secret itself, prefers its own secret, and is empty without one", async () => {
    const { slackStateSecret } = await import("@/lib/auth");
    vi.stubEnv("SLACK_STATE_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
    expect(slackStateSecret()).toBe("");
    vi.stubEnv("CRON_SECRET", "cron-1");
    const derived = slackStateSecret();
    expect(derived).toMatch(/^[\w-]{43}$/);
    expect(derived).not.toContain("cron-1");
    vi.stubEnv("SLACK_STATE_SECRET", "own");
    expect(slackStateSecret()).toBe("own");
  });
});

describe("safeNext keeps redirects on this site", () => {
  it.each([
    "https://evil.example", "//evil.example", "/\\evil.example", "\\\\evil.example", "/\t/evil.example",
    "javascript:alert(1)", "", "evil.example", "/ //evil.example",
  ])("%j -> /", async (bad) => {
    const { safeNext } = await import("@/lib/auth");
    expect(safeNext(bad)).toBe("/");
  });
  it("keeps a same-site path with query and hash", async () => {
    const { safeNext } = await import("@/lib/auth");
    expect(safeNext("/settings?tab=voice#x")).toBe("/settings?tab=voice#x");
  });
});

describe("no server secret in browser code", () => {
  const root = join(__dirname, "..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const client = [...files(join(root, "components")), ...files(join(root, "lib")), ...files(join(root, "app"))]
    .filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

  it("client components read only NEXT_PUBLIC_ variables and import no server-only module (type imports are erased)", () => {
    expect(client.length).toBeGreaterThan(5);
    for (const f of client) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) expect([f, m[1]]).toEqual([f, expect.stringMatching(/^(NEXT_PUBLIC_|NODE_ENV$)/)]);
      expect([f, /^import (?!type )[^;]*?from ["']@\/lib\/(supabase\/server|crypto|cameras|news|address|maps|google-token|bots\/)/m.test(src)]).toEqual([f, false]);
    }
  });
});
