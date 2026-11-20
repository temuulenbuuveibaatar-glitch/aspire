import { afterEach, describe, expect, it, vi } from "vitest";
import { applyActions, takeDue } from "@/lib/device-store";
import { runTool, type ToolStep } from "@/lib/tools";
import { mongoliaTime } from "@/lib/tools/local";
import type { ToolContext } from "@/lib/tools/types";
import { calculate } from "@/lib/tools/world";
import { planTrip } from "@/lib/transit";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// 2026-11-20 10:00 in Mongolia
const NOW = new Date("2026-11-20T10:00:00+08:00");
const ctx = (memory: Record<string, string> = {}): ToolContext => ({ now: NOW, device: { memory, reminders: [] }, actions: [] });
const run = async (name: string, input: unknown, c = ctx()) => {
  const steps: ToolStep[] = [];
  return { out: JSON.parse(await runTool(name, input, c, steps)), c, steps };
};

describe("calculator", () => {
  it("does exact arithmetic, percentages and powers", () => {
    expect(calculate("3*4500 + 1200")).toBe(14700);
    expect(calculate("15% * 80000")).toBe(12000);
    expect(calculate("2^10")).toBe(1024);
    expect(calculate("10,5 + 1")).toBe(11.5);
  });
  it("refuses anything that is not math", () => {
    expect(() => calculate("process.exit()")).toThrow();
    expect(() => calculate("alert(1)")).toThrow();
  });
});

describe("reminders", () => {
  it("converts Mongolia local time correctly", () => {
    expect(mongoliaTime("2026-11-21", "08:30")?.toISOString()).toBe("2026-11-21T00:30:00.000Z");
  });
  it("an earlier clock time with no date means tomorrow", async () => {
    const { out, c } = await run("set_reminder", { text: "Эмээ уух цаг", time: "08:00", date: "", repeat_daily: true });
    expect(out).toMatchObject({ ok: true, date: "2026-11-21", time: "08:00", repeatDaily: true });
    expect(c.actions[0]).toMatchObject({ type: "reminder", text: "Эмээ уух цаг", at: "2026-11-21T00:00:00.000Z" });
  });
  it("due reminders fire once, daily ones move to tomorrow", () => {
    const d = applyActions(
      { memory: {}, reminders: [] },
      [
        { type: "reminder", id: "a", text: "once", at: "2026-11-20T01:00:00.000Z", repeatDaily: false },
        { type: "reminder", id: "b", text: "daily", at: "2026-11-20T01:00:00.000Z", repeatDaily: true },
        { type: "reminder", id: "c", text: "later", at: "2026-11-21T01:00:00.000Z", repeatDaily: false },
      ],
    );
    const { due, next } = takeDue(d, new Date("2026-11-20T02:00:00.000Z"));
    expect(due.map((r) => r.id)).toEqual(["a", "b"]);
    expect(next.reminders.map((r) => [r.id, r.at])).toEqual([
      ["b", "2026-11-21T01:00:00.000Z"],
      ["c", "2026-11-21T01:00:00.000Z"],
    ]);
  });
});

describe("memory and calls (privacy + safety)", () => {
  it("remembers useful facts", async () => {
    const { out, c } = await run("remember", { key: "Home stop", value: "Хороолол" });
    expect(out.ok).toBe(true);
    expect(c.actions).toEqual([{ type: "remember", key: "home stop", value: "Хороолол" }]);
  });
  it("refuses to store card numbers or passwords", async () => {
    expect((await run("remember", { key: "bank card", value: "4111 1111 1111 1111" })).out.error).toMatch(/Refused/);
    expect((await run("remember", { key: "wifi", value: "my password is 1234" })).out.error).toMatch(/Refused/);
  });
  it("shows call buttons for any number, flagging numbers that are not emergency or saved", async () => {
    expect((await run("call_phone", { number: "103", label: "Түргэн тусламж" })).c.actions[0]).toMatchObject({ type: "call", number: "103", known: true });
    expect((await run("call_phone", { number: "99112233", label: "stranger" })).c.actions[0]).toMatchObject({ type: "call", known: false });
    const saved = await run("call_phone", { number: "99112233", label: "Охин" }, ctx({ "daughter phone": "+976 9911 2233" }));
    expect(saved.c.actions[0]).toMatchObject({ type: "call", number: "99112233", known: true });
  });
});

describe("trip planner", () => {
  it("finds the direct route between two stops", () => {
    const r = planTrip("Railway Station", "Нэгдсэн эмнэлэг", 12 * 60);
    expect("options" in r && r.options[0]).toMatchObject({ route: "5", rideMinutes: 22 });
  });
});

describe("world tools (network mocked)", () => {
  it("weather for Erdenet without geocoding, failures marked in steps", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", ""); // Open-Meteo path
    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return Response.json({
        current: { temperature_2m: -24, apparent_temperature: -31, weather_code: 71, wind_speed_10m: 12, relative_humidity_2m: 70 },
        daily: { time: ["2026-11-20"], temperature_2m_max: [-15], temperature_2m_min: [-28], weather_code: [3], precipitation_probability_max: [10] },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { out, steps } = await run("get_weather", { place: "" });
    expect(out.now).toMatchObject({ temperatureC: -24, feelsLikeC: -31, conditions: "light snow" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("latitude=49.0333");
    expect(steps).toEqual([{ tool: "get_weather", icon: "☁️", label: "Weather", ok: true }]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const failed = await run("get_air_quality", { place: "" });
    expect(failed.out.error).toBeTruthy();
    expect(failed.steps[0].ok).toBe(false);
  });
});
