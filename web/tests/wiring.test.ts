// The v10 features wired into the shared code: vision-only brains for a photo, lists in the
// stamped state (medicine lists never leave the phone), leave-by on get_directions, repeats on
// add_to_calendar, the new tools in the registry, and the reply voice for interpreter mode.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ask } from "@/lib/brain";
import { speechLang } from "@/lib/lang";
import { applyActions as applyDevice } from "@/lib/device-store";
import { type Photo, PHOTO_UNAVAILABLE } from "@/lib/photo";
import { applyActions, emptyState, fromDevice, keepLocalOnly, mergeState, parseState, stripLocalOnly, toDevice } from "@/lib/state";
import { runTool, TOOLS, type ToolStep } from "@/lib/tools";
import type { ClientAction, ToolContext } from "@/lib/tools/types";

const ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "DEEPSEEK_API_KEY", "DEEPSEEK_URL", "GEMINI_API_KEY", "LOCAL_LLM_URL", "BRAIN_ORDER", "GOOGLE_MAPS_API_KEY"];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

const PHOTO: Photo = { mime: "image/jpeg", data: "/9j/AAAA", width: 10, height: 10 };
const NOW = new Date("2026-11-21T06:00:00Z");
const ctx = (extra: Partial<ToolContext> = {}): ToolContext => ({ now: NOW, device: { memory: {}, reminders: [] }, actions: [], lang: "en", timeZone: "Asia/Ulaanbaatar", ...extra });
const run = async (name: string, input: unknown, c = ctx()) => JSON.parse(await runTool(name, input, c, [] as ToolStep[]));

describe("photo: only vision providers see it", () => {
  it("no vision provider configured: a plain 'unavailable' line, never an error or a guess", async () => {
    process.env.LOCAL_LLM_URL = "http://localhost:11434/v1";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await ask("read this", "mn", [], undefined, NOW, {}, PHOTO);
    expect(r.reply).toBe(PHOTO_UNAVAILABLE.mn);
    expect(fetchSpy).not.toHaveBeenCalled(); // the text-only local model never got the question
  });

  it("Gemini gets the photo as inlineData in the last user turn, before the text", async () => {
    process.env.GEMINI_API_KEY = "test";
    process.env.LOCAL_LLM_URL = "http://localhost:11434/v1";
    process.env.BRAIN_ORDER = "local,gemini";
    const bodies: { url: string; body: { contents: { parts: Record<string, unknown>[] }[] } }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      bodies.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: "It says: take one tablet." }] } }] });
    });
    const r = await ask("read this", "en", [{ role: "user", text: "[photo] earlier" }], undefined, NOW, {}, PHOTO);
    expect(r.brain).toBe("gemini");
    expect(bodies).toHaveLength(1); // local skipped
    const last = bodies[0].body.contents.at(-1)!;
    expect(last.parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "/9j/AAAA" } });
    expect(last.parts[1]).toEqual({ text: "read this" });
    // History keeps the placeholder only.
    expect(JSON.stringify(bodies[0].body.contents.slice(0, -1))).not.toContain("inlineData");
  });

  it("every vision provider failing still answers 'unavailable'", async () => {
    process.env.GEMINI_API_KEY = "test";
    vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));
    const r = await ask("read this", "de", [], undefined, NOW, {}, PHOTO);
    expect(r.reply).toBe(PHOTO_UNAVAILABLE.de);
  });
});

describe("lists in the stamped state", () => {
  const add = (id: string, list: string, text: string, amount?: number): ClientAction => ({
    type: "list_add",
    item: { id, list, text, ...(amount ? { amount } : {}), at: NOW.toISOString() },
  });

  it("assistant actions add, remove and clear with tombstones; the device sees live items", () => {
    let s = applyActions(emptyState(), [add("a", "shopping", "milk"), add("b", "shopping", "bread"), add("c", "spending", "bus", 150)], NOW);
    s = applyActions(s, [{ type: "list_remove", id: "a" }], new Date(NOW.getTime() + 1000));
    expect(s.lists?.find((x) => x.id === "a")).toMatchObject({ deleted: true });
    expect(toDevice(s).lists?.map((x) => x.id).sort()).toEqual(["b", "c"]);
    s = applyActions(s, [{ type: "list_clear", list: "shopping" }], new Date(NOW.getTime() + 2000));
    expect(toDevice(s).lists?.map((x) => x.id)).toEqual(["c"]);
  });

  it("the phone path (device-store applyActions, then fromDevice) stamps the same change", () => {
    const s0 = applyActions(emptyState(), [add("a", "shopping", "milk")], NOW);
    const d = applyDevice(toDevice(s0), [add("b", "shopping", "eggs"), { type: "list_remove", id: "a" }]);
    const s1 = fromDevice(s0, d, new Date(NOW.getTime() + 1000));
    expect(s1.lists?.find((x) => x.id === "a")?.deleted).toBe(true);
    expect(toDevice(s1).lists?.map((x) => x.text)).toEqual(["eggs"]);
    // An older caller without lists leaves them alone.
    expect(fromDevice(s1, { memory: {}, reminders: [], routines: [], lessons: [], settings: {} }, NOW).lists).toBe(s1.lists);
  });

  it("medicine and dose lists never leave the phone, and survive a merge with the cloud copy", () => {
    const local = applyActions(emptyState(), [add("m", "fever log", "paracetamol 5 ml"), add("s", "shopping", "milk")], NOW);
    const sent = stripLocalOnly(local);
    expect(sent.lists?.map((x) => x.id)).toEqual(["s"]);
    const cloud = parseState(JSON.parse(JSON.stringify(sent)))!;
    const merged = keepLocalOnly(mergeState(local, cloud, NOW), local);
    expect(merged.lists?.map((x) => x.id).sort()).toEqual(["m", "s"]);
  });

  it("parseState drops forged list rows (bad id, markup, card numbers stay out via the tool)", () => {
    const st = parseState({
      memory: {},
      reminders: [],
      lists: [
        { id: "ok", list: "Shopping", text: "milk", at: NOW.toISOString(), updatedAt: NOW.toISOString() },
        { id: "../x", list: "a", text: "b", at: NOW.toISOString(), updatedAt: NOW.toISOString() },
        { id: "nostamp", list: "a", text: "b", at: NOW.toISOString() },
        { id: "big", list: "a", text: "b", amount: 1e30, at: NOW.toISOString(), updatedAt: NOW.toISOString() },
      ],
    })!;
    expect(st.lists?.map((x) => x.id)).toEqual(["ok", "big"]);
    expect(st.lists?.[0].list).toBe("shopping");
    expect(st.lists?.[1].amount).toBeUndefined();
  });

  it("the list tool is registered and reads the device's lists", async () => {
    const c = ctx({ device: { memory: {}, reminders: [], lists: [{ id: "x", list: "spending", text: "bus", amount: 150, at: NOW.toISOString() }] } });
    const out = await run("list", { action: "read", list_name: "spending", text: "", amount: 0 }, c);
    expect(out).toMatchObject({ total: 1.5 });
    const added = await run("list", { action: "add", list_name: "shopping", text: "milk", amount: 0 }, c);
    expect(added.error).toBeUndefined();
    expect(c.actions.some((a) => a.type === "list_add")).toBe(true);
  });
});

describe("registry", () => {
  it("outdoor_check, poison_help and list are tools every brain and bot sees", () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of ["outdoor_check", "poison_help", "list"]) expect(names).toContain(n);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("get_directions leave-by", () => {
  it("validates depart_at / arrive_by before calling Google", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const base = { origin: "A", destination: "B", mode: "drive" };
    expect((await run("get_directions", { ...base, depart_at: "2026-11-21 15:00", arrive_by: "2026-11-21 16:00" })).error).toMatch(/not both/);
    expect((await run("get_directions", { ...base, depart_at: "", arrive_by: "2026-02-30 09:00" })).error).toBeTruthy();
    expect((await run("get_directions", { ...base, depart_at: "2026-11-20 09:00", arrive_by: "" })).error).toMatch(/passed/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("transit arrive_by goes to Google as arrivalTime, never with departureTime", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test";
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json({ routes: [{ duration: "1200s", distanceMeters: 5000, legs: [] }] });
    });
    await run("get_directions", { origin: "A", destination: "B", mode: "transit", depart_at: "", arrive_by: "2026-11-21 18:00" });
    expect(bodies[0].arrivalTime).toBe("2026-11-21T10:00:00.000Z");
    expect(bodies[0].departureTime).toBeUndefined();
  });

  it("drive arrive_by says when to leave", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test";
    vi.stubGlobal("fetch", async () => Response.json({ routes: [{ duration: "1800s", distanceMeters: 20000, legs: [] }] }));
    const out = await run("get_directions", { origin: "A", destination: "B", mode: "drive", depart_at: "", arrive_by: "2026-11-21 18:00" });
    expect(out).toMatchObject({ leaveAt: "17:30", leaveDate: "2026-11-21" });
    expect(out.note).toMatch(/without traffic/);
  });
});

describe("add_to_calendar repeat", () => {
  const base = { title: "Pension", date: "2026-11-30", time: "09:00", duration_minutes: 30, details: "", time_zone: "" };

  it("a monthly repeat from the 30th becomes 'last day of the month' on the card and the link", async () => {
    const c = ctx();
    const out = await run("add_to_calendar", { ...base, repeat: "monthly", repeat_on: "", repeat_count: 12 }, c);
    expect(out.repeat).toMatch(/last day/);
    const card = c.actions[0] as Extract<ClientAction, { type: "calendar" }>;
    expect(card.recurrence).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=12");
    expect(card.url).toContain(`&recur=${encodeURIComponent(card.recurrence!)}`);
  });

  it("no repeat: a plain one-off card; a bad repeat is an error and no card", async () => {
    const c = ctx();
    await run("add_to_calendar", { ...base, repeat: "none", repeat_on: "", repeat_count: 0 }, c);
    expect((c.actions[0] as { recurrence?: string }).recurrence).toBeUndefined();
    const c2 = ctx();
    expect((await run("add_to_calendar", { ...base, repeat: "weekly", repeat_on: "MO;DROP TABLE", repeat_count: 0 }, c2)).error).toBeTruthy();
    expect(c2.actions).toHaveLength(0);
  });
});

describe("reply voice (interpreter mode)", () => {
  it("keeps the person's voice unless the reply has none of their script", () => {
    expect(speechLang("你好，请问多少钱？", "mn")).toBe("zh");
    expect(speechLang("Энэ нь 你好 гэсэн үг.", "mn")).toBe("mn");
    expect(speechLang("Wie viel kostet das?", "zh")).toBe("de");
    expect(speechLang("Hello, how much is it?", "en")).toBe("en");
    expect(speechLang("Сколько это стоит?", "en")).toBe("ru");
  });
});
