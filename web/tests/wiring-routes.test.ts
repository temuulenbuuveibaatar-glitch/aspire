// Pen tests for the wired-in features at their trust boundaries: a photo on /api/ask and a repeat
// rule on /api/calendar. The brain and Google are mocked; only the routes' own checks run.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Photo } from "@/lib/photo";

const seen = vi.hoisted(() => ({ photo: undefined as unknown, calls: 0 }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => ({ id: "user-photo", email: null }),
}));
vi.mock("@/lib/google-token", () => ({ googleAccessToken: async () => "ya29.test" }));
vi.mock("@/lib/brain", () => ({
  NoBrainConfigured: class extends Error {},
  ask: async (...args: unknown[]) => {
    seen.calls++;
    seen.photo = args[6];
    return { reply: "ok", brain: "test", actions: [], steps: [], sources: [] };
  },
}));

const { POST: ask } = await import("@/app/api/ask/route");
const { POST: calendar } = await import("@/app/api/calendar/route");

afterEach(() => {
  seen.photo = undefined;
  seen.calls = 0;
  vi.unstubAllGlobals();
});

let ip = 0;
const req = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": `10.9.0.${++ip}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const askWith = (extra: Record<string, unknown>) => ask(req("http://localhost/api/ask", { text: "what does this say?", lang: "en", ...extra }));

const png = (w: number, h: number, tail = "") => {
  const b = Buffer.alloc(8 + 25 + 12);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]).copy(b, 33);
  return Buffer.concat([b, Buffer.from(tail)]).toString("base64");
};

describe("POST /api/ask with a photo", () => {
  it("passes a checked photo to the brain", async () => {
    const res = await askWith({ image: `data:image/png;base64,${png(800, 600)}` });
    expect(res.status).toBe(200);
    expect(seen.photo).toMatchObject({ mime: "image/png", width: 800, height: 600 } satisfies Partial<Photo>);
  });

  it("no image field: no photo, the usual answer", async () => {
    expect((await askWith({})).status).toBe(200);
    expect(seen.photo).toBeUndefined();
  });

  it("refuses SVG, HTML, polyglots, bombs and two photos before any AI call", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
    for (const image of [
      `data:image/svg+xml;base64,${svg}`,
      Buffer.from("<html><script>x</script></html>").toString("base64"),
      png(10, 10, "<script>alert(1)</script>"), // bytes after IEND
      png(10_000, 10_000), // decompression bomb header
      [png(10, 10), png(10, 10)],
      12345,
      "not base64 at all!",
    ]) {
      const res = await askWith({ image });
      expect(res.status, JSON.stringify(image).slice(0, 40)).toBe(400);
    }
    expect((await askWith({ images: [png(10, 10)] })).status).toBe(400);
    expect(seen.calls).toBe(0);
  });

  it("refuses a body over the cap without parsing it", async () => {
    const huge = "A".repeat(4_500_000);
    const res = await ask(req("http://localhost/api/ask", `{"text":"hi","image":"${huge}"}`));
    expect(res.status).toBe(400);
    expect(seen.calls).toBe(0);
  });

  it("the error never echoes the photo back", async () => {
    const res = await askWith({ image: png(10, 10, "SECRET-TAIL") });
    expect(await res.text()).not.toContain("SECRET");
  });
});

describe("POST /api/calendar recurrence", () => {
  const event = { title: "Pension day", start: "2026-12-01T01:00:00.000Z", end: "2026-12-01T02:00:00.000Z", tz: "Asia/Ulaanbaatar" };

  it("sends only rules buildRRule can make to Google", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({ id: "e1", htmlLink: "https://calendar.google.com/e1" });
    });
    const ok = await calendar(req("http://localhost/api/calendar", { ...event, recurrence: "RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=12" }));
    expect(ok.status).toBe(200);
    expect(sent[0]).toMatchObject({ recurrence: ["RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=12"], start: { timeZone: "Asia/Ulaanbaatar" } });

    for (const recurrence of [
      "RRULE:FREQ=SECONDLY",
      "RRULE:FREQ=DAILY;COUNT=100000",
      "RRULE:FREQ=WEEKLY\nEXDATE:20261201",
      "EXRULE:FREQ=WEEKLY",
      ["RRULE:FREQ=WEEKLY"],
      7,
    ]) {
      const res = await calendar(req("http://localhost/api/calendar", { ...event, recurrence }));
      expect(res.status, String(recurrence)).toBe(400);
    }
    expect(sent).toHaveLength(1);
  });

  it("no recurrence: a one-off event, as before", async () => {
    const sent: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({ id: "e2", htmlLink: "https://calendar.google.com/e2" });
    });
    expect((await calendar(req("http://localhost/api/calendar", event))).status).toBe(200);
    expect(sent[0].recurrence).toBeUndefined();
  });
});
