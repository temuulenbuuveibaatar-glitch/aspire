import { describe, expect, it } from "vitest";
import { gmailComposeUrl, googleCalendarUrl, mailtoUrl, smsUrl, telegramShareUrl, telUrl } from "@/lib/links";
import { runTool, type ToolStep } from "@/lib/tools";
import type { DeviceContext, ToolContext } from "@/lib/tools/types";
import { isAllowedWebhook } from "@/lib/webhooks";

const NOW = new Date("2026-11-20T10:00:00+08:00");
const ctx = (device: Partial<DeviceContext> = {}): ToolContext => ({
  now: NOW,
  timeZone: "Asia/Ulaanbaatar",
  device: { memory: {}, reminders: [], ...device },
  actions: [],
});
const run = async (name: string, input: unknown, c = ctx()) => {
  const steps: ToolStep[] = [];
  return { out: JSON.parse(await runTool(name, input, c, steps)), c, steps };
};
const msg = (channel: string, to: string, text = "I'm 10 minutes late", subject = "") => ({ channel, to, subject, text });

describe("send_message", () => {
  it("email needs a valid address", async () => {
    expect((await run("send_message", msg("email", "not-an-email"))).out.error).toBeTruthy();
    const { out, c } = await run("send_message", msg("email", "boss@example.com", "Running late", "Late"));
    expect(out).toEqual({ ok: true, status: "ready — the person must press Send" });
    expect(c.actions).toEqual([{ type: "message", channel: "email", to: "boss@example.com", subject: "Late", text: "Running late" }]);
  });

  it("sms number validation", async () => {
    expect((await run("send_message", msg("sms", "12"))).out.error).toBeTruthy();
    expect((await run("send_message", msg("sms", "call me maybe"))).out.error).toBeTruthy();
    expect((await run("send_message", msg("sms", "1234567890123456"))).out.error).toBeTruthy();
    const { out, c } = await run("send_message", msg("sms", "+976 9911-2233"));
    expect(out.ok).toBe(true);
    expect(c.actions[0]).toMatchObject({ type: "message", channel: "sms", to: "+97699112233" });
  });

  it("telegram requires connection", async () => {
    const { out, c } = await run("send_message", msg("telegram", "me"));
    expect(out.error).toBe("telegram is not connected. Ask them to connect it in Settings, Connections");
    expect(c.actions).toEqual([]);
    const ok = await run("send_message", msg("discord", "#team"), ctx({ connected: ["discord"] }));
    expect(ok.out.ok).toBe(true);
    expect(ok.c.actions[0]).toMatchObject({ type: "message", channel: "discord", to: "#team" });
  });

  it("text must be 1-2000 characters and the channel known", async () => {
    expect((await run("send_message", msg("email", "a@b.co", ""))).out.error).toBeTruthy();
    expect((await run("send_message", msg("email", "a@b.co", "x".repeat(2001)))).out.error).toBeTruthy();
    expect((await run("send_message", msg("pigeon", "a@b.co"))).out.error).toBeTruthy();
  });
});

describe("call_phone", () => {
  it("call any number marks unknown", async () => {
    const stranger = await run("call_phone", { number: "99112233", label: "Someone" });
    expect(stranger.out.ok).toBe(true);
    expect(stranger.c.actions[0]).toEqual({ type: "call", number: "99112233", label: "Someone", known: false });
    expect((await run("call_phone", { number: "103", label: "" })).c.actions[0]).toMatchObject({ number: "103", known: true });
    const saved = await run("call_phone", { number: "99112233", label: "Охин" }, ctx({ memory: { "daughter phone": "Сараа +976 9911 2233" } }));
    expect(saved.c.actions[0]).toMatchObject({ known: true });
  });

  it("a short number is not 'known' just because a saved number ends with it", async () => {
    const r = await run("call_phone", { number: "233", label: "x" }, ctx({ memory: { daughter: "+976 9911 2233" } }));
    expect(r.c.actions[0]).toMatchObject({ known: false });
  });

  it("rejects things that are not phone numbers", async () => {
    expect((await run("call_phone", { number: "12", label: "" })).out.error).toBeTruthy();
    expect((await run("call_phone", { number: "1234567890123456", label: "" })).out.error).toBeTruthy();
  });
});

describe("add_to_calendar", () => {
  it("calendar url has UTC dates", async () => {
    const { out, c } = await run("add_to_calendar", {
      title: "Dentist",
      date: "2026-11-21",
      time: "09:30",
      duration_minutes: 45,
      details: "Bring card",
    });
    expect(out.ok).toBe(true);
    const a = c.actions[0];
    expect(a).toMatchObject({ type: "calendar", title: "Dentist", start: "2026-11-21T01:30:00.000Z", end: "2026-11-21T02:15:00.000Z", details: "Bring card" });
    expect(a.type === "calendar" && a.url).toContain("dates=20261121T013000Z%2F20261121T021500Z");
  });

  it("uses the person's own time zone, or one the model names", async () => {
    const ny = await run("add_to_calendar", { title: "Call", date: "2026-11-23", time: "09:00", duration_minutes: 30, details: "", time_zone: "" }, { ...ctx(), timeZone: "America/New_York" });
    expect(ny.c.actions[0]).toMatchObject({ start: "2026-11-23T14:00:00.000Z", end: "2026-11-23T14:30:00.000Z" });
    const named = await run("add_to_calendar", { title: "Call", date: "2026-11-23", time: "09:00", duration_minutes: 30, details: "", time_zone: "Europe/London" });
    expect(named.c.actions[0]).toMatchObject({ start: "2026-11-23T09:00:00.000Z" });
  });

  it("rejects bad dates", async () => {
    expect((await run("add_to_calendar", { title: "x", date: "tomorrow", time: "09:00", duration_minutes: 30, details: "" })).out.error).toBeTruthy();
  });
});

describe("links", () => {
  it("builds the share, sms, tel and mail links", () => {
    expect(telUrl("+976 9911 2233")).toBe("tel:+97699112233");
    expect(smsUrl("99112233", "Hi & bye")).toBe("sms:99112233?body=Hi%20%26%20bye");
    expect(telegramShareUrl("Hello there")).toBe("https://t.me/share/url?url=&text=Hello%20there");
    expect(gmailComposeUrl("a@b.co", "Hi", "Body text")).toBe("https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.co&su=Hi&body=Body%20text");
    expect(mailtoUrl("a@b.co", "Hi there", "Body")).toBe("mailto:a@b.co?subject=Hi%20there&body=Body");
    expect(googleCalendarUrl("Tea", "2026-11-21T01:30:00.000Z", "2026-11-21T02:00:00.000Z", "")).toBe(
      "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tea&dates=20261121T013000Z%2F20261121T020000Z&details=",
    );
  });
});

describe("webhook allow-list", () => {
  it("accepts only real Discord and Slack webhook urls", () => {
    expect(isAllowedWebhook("discord", "https://discord.com/api/webhooks/123456/abc_DEF-9")).toBe(true);
    expect(isAllowedWebhook("discord", "https://discordapp.com/api/webhooks/123456/abc")).toBe(true);
    expect(isAllowedWebhook("slack", "https://hooks.slack.com/services/T000/B000/XXXXyyyy")).toBe(true);
    for (const bad of [
      "https://evil.test/hook",
      "http://hooks.slack.com/services/T000/B000/XXXX",
      "https://discord.com.evil.test/api/webhooks/1/x",
      "https://discord.com/api/webhooks/1/x?redirect=https://evil.test",
      "https://discord.com/api/webhooks/1/x/../../../evil",
    ]) {
      expect(isAllowedWebhook("discord", bad)).toBe(false);
      expect(isAllowedWebhook("slack", bad)).toBe(false);
    }
    expect(isAllowedWebhook("discord", "https://hooks.slack.com/services/T000/B000/XXXX")).toBe(false);
  });
});
