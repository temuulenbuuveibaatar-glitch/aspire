import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: "user_1", email: null } as { id: string; email: null } | null, token: "ya29.test" as string | null }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => auth.user,
  signedOut: () => Response.json({ error: "signed_out" }, { status: 401 }),
}));
vi.mock("@/lib/google-token", () => ({ googleAccessToken: async () => auth.token }));

import { POST } from "@/app/api/calendar/route";
import { GoogleAuthError } from "@/lib/google";
import { insertEvent, listEvents } from "@/lib/google-calendar";
import { getCalendar, rangeBounds } from "@/lib/tools/calendar";
import type { ToolContext } from "@/lib/tools/types";

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const NOW = new Date("2026-11-21T10:00:00+08:00");
const ctx = (token: string | null = "ya29.test"): ToolContext => ({
  now: NOW,
  timeZone: "Asia/Ulaanbaatar",
  device: { memory: {}, reminders: [] },
  actions: [],
  gmailToken: async () => token,
});

beforeEach(() => {
  auth.user = { id: "user_1", email: null };
  auth.token = "ya29.test";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listEvents", () => {
  it("queries the primary calendar and maps events", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return Response.json({
        items: [
          { summary: "Standup", start: { dateTime: "2026-11-21T09:00:00+08:00" }, end: { dateTime: "2026-11-21T09:15:00+08:00" }, location: "Office" },
          { summary: "Holiday", start: { date: "2026-11-21" }, end: { date: "2026-11-22" } },
          { summary: "Gone", status: "cancelled", start: { date: "2026-11-21" } },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const events = await listEvents("tok", "2026-11-20T16:00:00.000Z", "2026-11-21T16:00:00.000Z", "Asia/Ulaanbaatar");
    expect(events).toEqual([
      { title: "Standup", start: "2026-11-21T09:00:00+08:00", end: "2026-11-21T09:15:00+08:00", allDay: false, location: "Office" },
      { title: "Holiday", start: "2026-11-21", end: "2026-11-22", allDay: true, location: "" },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(API);
    expect(u.searchParams.get("singleEvents")).toBe("true");
    expect(u.searchParams.get("orderBy")).toBe("startTime");
    expect(u.searchParams.get("timeZone")).toBe("Asia/Ulaanbaatar");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("throws GoogleAuthError with missingScope on 403 insufficientPermissions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { errors: [{ reason: "insufficientPermissions" }] } }, { status: 403 })));
    const err = await listEvents("tok", "a", "b", "UTC").catch((e) => e);
    expect(err).toBeInstanceOf(GoogleAuthError);
    expect(err.missingScope).toBe(true);
  });
});

describe("insertEvent", () => {
  it("POSTs the event with time zone, location and description", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return Response.json({ id: "e1", htmlLink: "https://www.google.com/calendar/event?eid=e1" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await insertEvent("tok", { title: "Dentist", startISO: "2026-11-21T07:00:00.000Z", endISO: "2026-11-21T08:00:00.000Z", tz: "Asia/Ulaanbaatar", location: "Erdenet" });
    expect(out.id).toBe("e1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(API);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      summary: "Dentist",
      start: { dateTime: "2026-11-21T07:00:00.000Z", timeZone: "Asia/Ulaanbaatar" },
      end: { dateTime: "2026-11-21T08:00:00.000Z", timeZone: "Asia/Ulaanbaatar" },
      location: "Erdenet",
    });
  });
});

describe("get_calendar", () => {
  it("today/tomorrow/week bounds follow the person's time zone", () => {
    const iso = (r: "today" | "tomorrow" | "week") => rangeBounds(r, NOW, "Asia/Ulaanbaatar").map((d) => d.toISOString());
    expect(iso("today")).toEqual(["2026-11-20T16:00:00.000Z", "2026-11-21T16:00:00.000Z"]);
    expect(iso("tomorrow")).toEqual(["2026-11-21T16:00:00.000Z", "2026-11-22T16:00:00.000Z"]);
    expect(iso("week")).toEqual(["2026-11-20T16:00:00.000Z", "2026-11-27T16:00:00.000Z"]);
  });

  it("returns events", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [{ summary: "Standup", start: { dateTime: "x" }, end: { dateTime: "y" } }] })));
    const out = (await getCalendar.run({ range: "tomorrow" }, ctx())) as { count: number; range: string };
    expect(out).toMatchObject({ range: "tomorrow", count: 1 });
  });

  it("says Calendar is not connected without a token or the scope", async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getCalendar.run({ range: "today" }, ctx(null))).toEqual({ error: expect.stringContaining("Calendar is not connected") });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getCalendar.run({ range: "today" }, ctx())).toEqual({ error: expect.stringContaining("Calendar is not connected") });
  });

  it("says access expired on 401 and falls back to today for an unknown range", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getCalendar.run({ range: "year" }, ctx())).toEqual({ error: expect.stringContaining("access expired") });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0 as never])).searchParams.get("timeMin")).toBe("2026-11-20T16:00:00.000Z");
  });
});

describe("POST /api/calendar", () => {
  const req = (body: unknown) => new Request("http://x/api/calendar", { method: "POST", headers: { "x-real-ip": `1.1.1.${Math.random()}` }, body: JSON.stringify(body) });
  const good = { title: "Dentist", start: "2026-11-21T15:00:00+08:00", end: "2026-11-21T16:00:00+08:00", details: "", tz: "Asia/Ulaanbaatar" };

  it("adds the event", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "e1", htmlLink: "https://www.google.com/calendar/event?eid=e1" }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(good));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, link: "https://www.google.com/calendar/event?eid=e1" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("validates the body before calling Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(req({ ...good, title: "" }))).status).toBe(400);
    expect((await POST(req({ ...good, title: "x".repeat(201) }))).status).toBe(400);
    expect((await POST(req({ ...good, start: "tomorrow" }))).status).toBe(400);
    expect((await POST(req({ ...good, start: "2026-11-21T15:00:00" }))).status).toBe(400); // no offset
    expect((await POST(req({ ...good, end: good.start }))).status).toBe(400);
    expect((await POST(req({ ...good, details: 5 }))).status).toBe(400);
    expect((await POST(new Request("http://x/api/calendar", { method: "POST", body: "{" }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 when signed out, 403 not_connected without a token or the scope", async () => {
    auth.user = null;
    expect((await POST(req(good))).status).toBe(401);
    auth.user = { id: "user_1", email: null };
    auth.token = null;
    const res = await POST(req(good));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_connected" });
    auth.token = "ya29.test";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { errors: [{ reason: "insufficientPermissions" }] } }, { status: 403 })));
    expect((await POST(req(good))).status).toBe(403);
  });

  it("502 when Google fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    expect((await POST(req(good))).status).toBe(502);
  });
});
