import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/briefing/route";
import { buildBriefingFacts, localDate, makeBriefing, shouldBrief } from "@/lib/briefing";
import type { MailItem } from "@/lib/google";

const user = vi.hoisted(() => ({ current: { id: "user_2abc", email: null } as { id: string; email: null } | null }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireUser: async () => user.current,
}));

const googleAccessToken = vi.hoisted(() => vi.fn<(id: string) => Promise<string | null>>());
vi.mock("@/lib/google-token", () => ({ googleAccessToken }));

// Weather and air are faked so no test touches the network.
vi.mock("@/lib/tools/world", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/tools/world")>();
  return {
    ...real,
    weather: { ...real.weather, run: async () => ({ place: "Erdenet", now: { temperatureC: -18.4, conditions: "clear sky" } }) },
    airQuality: { ...real.airQuality, run: async () => ({ place: "Erdenet", usAqi: 160, level: "unhealthy" }) },
  };
});

const NOW = new Date("2026-11-20T07:30:00+08:00");
const UB = "Asia/Ulaanbaatar";
const mail = (from: string, subject: string): MailItem => ({ from, subject, date: NOW.toISOString(), snippet: "" });

beforeEach(() => {
  user.current = { id: "user_2abc", email: null };
  // No AI key in tests: the route uses the built-in fallback text.
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  googleAccessToken.mockReset();
});

let ip = 0;
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": `10.1.0.${++ip}` },
      body: JSON.stringify(body),
    }),
  );

describe("buildBriefingFacts", () => {
  it("lists senders with counts, at most 5", () => {
    const items = [
      mail("NVIDIA", "GTC keynote"),
      mail("NVIDIA", "Your order"),
      mail("School", "Parent meeting"),
      ...["A", "B", "C", "D", "E"].map((n) => mail(n, `hello from ${n}`)),
    ];
    const facts = buildBriefingFacts({ mail: items, weather: { now: { temperatureC: -18 } }, air: null, reminders: [], now: NOW, timeZone: UB });
    expect(facts).toContain("8 new message(s) from 7 sender(s)");
    expect(facts).toContain('- NVIDIA (2): "GTC keynote", "Your order"');
    expect(facts.match(/^- .*\(\d+\): /gm)).toHaveLength(5);
    expect(facts).toContain("- and 2 more message(s) from 2 other sender(s).");
    expect(facts).toContain("(morning)");
    expect(facts).toContain("Air quality: not available.");
  });

  it("says when mail is not available and lists today's reminders only", () => {
    const facts = buildBriefingFacts({
      mail: null,
      weather: null,
      air: null,
      reminders: [
        { id: "1", text: "Take medicine", at: "2026-11-20T01:00:00.000Z", repeatDaily: false }, // 09:00 today
        { id: "2", text: "Dentist", at: "2026-11-22T02:00:00.000Z", repeatDaily: false }, // another day
        { id: "3", text: "Walk", at: "2026-11-21T10:00:00.000Z", repeatDaily: true }, // daily
      ],
      now: NOW,
      timeZone: UB,
    });
    expect(facts).toContain("Email: not available. Do not mention email.");
    expect(facts).toContain("- 09:00 Take medicine");
    expect(facts).toContain("- 18:00 Walk (daily)");
    expect(facts).not.toContain("Dentist");
  });

  it("reads the clock in the person's own time zone, any country", () => {
    const facts = buildBriefingFacts({ mail: null, weather: null, air: null, reminders: [], now: NOW, timeZone: "Europe/Berlin" });
    // 07:30 in Ulaanbaatar is 00:30 in Berlin.
    expect(facts).toContain("00:30 (morning), time zone Europe/Berlin.");
    expect(facts).not.toContain("Mongolia");
  });

  it("never passes a tool error (no location) to the writer as weather", () => {
    const facts = buildBriefingFacts({
      mail: null,
      weather: { error: "Location unknown: ask which city they mean" },
      air: { error: "Location unknown: ask which city they mean" },
      reminders: [],
      now: NOW,
    });
    expect(facts).toContain("Weather: not available.");
    expect(facts).toContain("Air quality: not available.");
    expect(facts).not.toContain("Location unknown");
    expect(facts).toContain("time zone UTC");
  });
});

describe("makeBriefing", () => {
  it("gives the writer the facts and counts the mail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname.endsWith("/messages")) {
          expect(u.searchParams.get("q")).toBe("in:inbox category:primary newer_than:1d");
          return Response.json({ messages: [{ id: "a" }] });
        }
        return Response.json({ id: "a", payload: { headers: [{ name: "From", value: "NVIDIA <n@nvidia.com>" }, { name: "Subject", value: "GTC" }] } });
      }),
    );
    const write = vi.fn(async () => "Good morning, sir. One email from NVIDIA about GTC.");
    const r = await makeBriefing({ lang: "en", title: "mr", reminders: [], accessToken: "ya29.x", now: NOW, where: { timeZone: UB } }, { write });
    expect(r).toEqual({ text: "Good morning, sir. One email from NVIDIA about GTC.", mailCount: 1, gmailError: false });
    const [facts, lang, title] = write.mock.calls[0] as unknown as [string, string, string];
    expect(facts).toContain("- NVIDIA (1): \"GTC\"");
    expect(facts).toContain("unhealthy");
    expect([lang, title]).toEqual(["en", "mr"]);
  });

  it("falls back to a plain briefing when the writer fails", async () => {
    const r = await makeBriefing(
      { lang: "en", title: "", reminders: [], accessToken: null, now: NOW, where: { timeZone: UB } },
      { write: async () => Promise.reject(new Error("down")) },
    );
    expect(r.text).toBe("Good morning. It is -18 degrees now.");
  });
});

describe("POST /api/briefing", () => {
  it("requires a session", async () => {
    user.current = null;
    const res = await post({ lang: "en", reminders: [] });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed_out" });
  });

  it("briefs without mail when no Google token (email-code users)", async () => {
    googleAccessToken.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await post({ lang: "en", reminders: [{ id: "1", text: "Medicine", at: "2026-11-20T23:00:00.000Z", repeatDaily: true }] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mailCount).toBeNull();
    expect(body.gmailError).toBe(false);
    expect(body.text).toMatch(/^Good (morning|afternoon|evening)\./);
    expect(body.text).toContain("reminder");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(googleAccessToken).toHaveBeenCalledWith("user_2abc");
  });

  it("still briefs, without mail, when Google refuses the token (gmailError)", async () => {
    googleAccessToken.mockResolvedValue("ya29.expired");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: 401 } }, { status: 401 })));
    const body = await (await post({ lang: "ru", reminders: [] })).json();
    expect(body).toMatchObject({ mailCount: null, gmailError: true });
    expect(body.text).toContain("-18 градусов");
  });

  it("treats a Google sign-in without the Gmail scope as not connected", async () => {
    googleAccessToken.mockResolvedValue("ya29.basic");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { errors: [{ reason: "insufficientPermissions" }] } }, { status: 403 })),
    );
    const body = await (await post({ lang: "de", reminders: [] })).json();
    expect(body).toMatchObject({ mailCount: null, gmailError: false });
  });
});

describe("first open per local day", () => {
  it("briefs on a new calendar day in the person's own time zone", () => {
    expect(localDate(new Date("2026-11-21T00:30:00+08:00"), UB)).toBe("2026-11-21");
    expect(shouldBrief("2026-11-20", new Date("2026-11-21T00:30:00+08:00"), UB)).toBe(true);
    expect(shouldBrief("2026-11-20", new Date("2026-11-20T23:59:00+08:00"), UB)).toBe(false);
    // 16:30 UTC is already the next day in Ulaanbaatar, but still the same day in New York.
    expect(shouldBrief("2026-11-20", new Date("2026-11-20T16:30:00Z"), UB)).toBe(true);
    expect(shouldBrief("2026-11-20", new Date("2026-11-20T16:30:00Z"), "America/New_York")).toBe(false);
    expect(shouldBrief(undefined, NOW)).toBe(true);
  });
});
